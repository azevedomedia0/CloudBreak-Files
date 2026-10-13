//! TCP swarm in **private mode**: listen + invite-dial only.
//! No DHT, no STUN, no peer-address gossip / Announce. Fetch uses only
//! multiaddrs that arrived inside a signed invite for that library root.
//!
//! The listener may be reachable from the internet (opt-in router port mapping), so it trusts
//! nobody by default: a peer has to present a library's access token, which only its invite
//! carries, before it learns the library exists or receives any of its chunks; it is then served
//! that library's chunks and nothing else. Blocks are only stored when this side asked for them.

use crate::p2p::chunk_store::{cid_of_ciphertext, ChunkStore};
use crate::p2p::identity::PeerIdentity;
use crate::p2p::protocol::{
    multiaddr_tcp, parse_tcp_multiaddr, read_message, write_message, P2pMessage, DEFAULT_PORT,
    PROTOCOL_VERSION,
};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use subtle::ConstantTimeEq;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Semaphore};
use tokio::time::timeout;

/// How long a connecting peer has to identify itself and present a token.
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);
/// An authorised connection that goes quiet this long is closed.
const IDLE_TIMEOUT: Duration = Duration::from_secs(600);
/// How long to wait for a TCP connection to an invite address. Private LAN addresses in an invite
/// are unreachable from another network, and the OS default would make each one hang for minutes.
const DIAL_TIMEOUT: Duration = Duration::from_secs(5);
/// Inbound connections served at once; the rest are dropped.
const MAX_INBOUND: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwarmPeerStatus {
    pub peer_id: String,
    /// Connection endpoint used for this session only (never used for discovery).
    pub addrs: Vec<String>,
    pub connected: bool,
    pub transfer_bytes: u64,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwarmStatus {
    pub listening: bool,
    pub listen_addrs: Vec<String>,
    pub peer_id: String,
    pub peers: Vec<SwarmPeerStatus>,
    pub seeding_root_cids: Vec<String>,
    pub bytes_sent: u64,
    pub bytes_received: u64,
    /// Always true: no DHT / STUN / announce gossip.
    pub private_mode: bool,
}

struct SwarmInner {
    identity: PeerIdentity,
    app_data: PathBuf,
    /// The bound port. Advertised addresses are worked out from it when asked for, not stored:
    /// the Mac's network address can appear (Wi-Fi joins after launch) or change while the app runs.
    port: u16,
    listening: bool,
    /// root_cid -> set of CIDs we seed
    seeding: HashMap<String, HashSet<String>>,
    /// root_cid -> the access token a peer must present for it
    access_tokens: HashMap<String, String>,
    /// This Mac's address on the internet when router port mapping is on.
    public_addr: Option<(Ipv4Addr, u16)>,
    /// peer_id -> status (session UI only; addrs are not used for dial)
    peers: HashMap<String, SwarmPeerStatus>,
    /// root_cid -> multiaddrs from the invite only (private-mode dial allowlist)
    invite_dial_addrs: HashMap<String, Vec<String>>,
    bytes_sent: u64,
    bytes_received: u64,
}

pub struct SwarmHandle {
    inner: Arc<RwLock<SwarmInner>>,
    cmd_tx: mpsc::UnboundedSender<SwarmCmd>,
}

enum SwarmCmd {
    DialInvite { root_cid: String, addrs: Vec<String>, token: String },
    Seed { root_cid: String, library_id: String, access_token: String },
    Fetch {
        root_cid: String,
        want_cids: Vec<String>,
        library_id: String,
        token: String,
        reply: tokio::sync::oneshot::Sender<Result<usize, String>>,
    },
}

impl SwarmHandle {
    pub async fn start(
        identity: PeerIdentity,
        app_data: PathBuf,
        port: Option<u16>,
    ) -> Result<Self, String> {
        let port = port.unwrap_or(DEFAULT_PORT);
        let listener = TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], port)))
            .await
            .map_err(|e| format!("listen failed: {e}"))?;
        let local = listener.local_addr().map_err(|e| e.to_string())?;
        // Bind all interfaces for inbound invite-dials. The invite carries the LAN address
        // (so another Mac can dial it) and loopback (so a second copy on this Mac can too).

        let inner = Arc::new(RwLock::new(SwarmInner {
            identity: identity.clone(),
            app_data: app_data.clone(),
            port: local.port(),
            listening: true,
            seeding: HashMap::new(),
            access_tokens: HashMap::new(),
            public_addr: None,
            peers: HashMap::new(),
            invite_dial_addrs: HashMap::new(),
            bytes_sent: 0,
            bytes_received: 0,
        }));

        let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel();
        let handle = SwarmHandle {
            inner: inner.clone(),
            cmd_tx,
        };

        let accept_inner = inner.clone();
        let slots = Arc::new(Semaphore::new(MAX_INBOUND));
        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, addr)) => {
                        // Over the limit: drop the connection rather than queue it.
                        let Ok(permit) = slots.clone().try_acquire_owned() else { continue };
                        let inner = accept_inner.clone();
                        tokio::spawn(async move {
                            let _ = handle_connection(inner, stream, Some(addr.to_string()), None).await;
                            drop(permit);
                        });
                    }
                    Err(_) => break,
                }
            }
        });

        let cmd_inner = inner.clone();
        tokio::spawn(async move {
            while let Some(cmd) = cmd_rx.recv().await {
                match cmd {
                    SwarmCmd::DialInvite { root_cid, addrs, token } => {
                        {
                            let mut w = cmd_inner.write();
                            let entry = w.invite_dial_addrs.entry(root_cid.clone()).or_default();
                            for a in &addrs {
                                if !entry.contains(a) {
                                    entry.push(a.clone());
                                }
                            }
                        }
                        for addr in addrs {
                            if let Some((host, port)) = parse_tcp_multiaddr(&addr) {
                                let host = if host == "0.0.0.0" {
                                    "127.0.0.1".to_string()
                                } else {
                                    host
                                };
                                let inner = cmd_inner.clone();
                                let access = (root_cid.clone(), token.clone());
                                tokio::spawn(async move {
                                    if let Ok(Ok(stream)) =
                                        timeout(DIAL_TIMEOUT, TcpStream::connect((host.as_str(), port))).await
                                    {
                                        let _ = handle_connection(inner, stream, Some(addr), Some(access)).await;
                                    }
                                });
                            }
                        }
                    }
                    SwarmCmd::Seed {
                        root_cid,
                        library_id,
                        access_token,
                    } => {
                        let store_path = app_data.join("libraries").join(&library_id);
                        if let Ok(store) = ChunkStore::open(store_path) {
                            if let Ok(cids) = store.list_cids() {
                                let mut w = cmd_inner.write();
                                w.seeding.insert(root_cid.clone(), cids.into_iter().collect());
                                w.access_tokens.insert(root_cid, access_token);
                            }
                        }
                    }
                    SwarmCmd::Fetch {
                        root_cid,
                        want_cids,
                        library_id,
                        token,
                        reply,
                    } => {
                        let result = fetch_blocks_invite_only(
                            cmd_inner.clone(),
                            &root_cid,
                            want_cids,
                            &library_id,
                            &token,
                        )
                        .await;
                        let _ = reply.send(result);
                    }
                }
            }
        });

        Ok(handle)
    }

    pub fn status(&self) -> SwarmStatus {
        let listen_addrs = self.listen_addrs();
        let r = self.inner.read();
        SwarmStatus {
            listening: r.listening,
            listen_addrs,
            peer_id: r.identity.peer_id.clone(),
            peers: r.peers.values().cloned().collect(),
            seeding_root_cids: r.seeding.keys().cloned().collect(),
            bytes_sent: r.bytes_sent,
            bytes_received: r.bytes_received,
            private_mode: true,
        }
    }

    /// Where other devices can reach this listener right now, most reachable first.
    pub fn listen_addrs(&self) -> Vec<String> {
        let (port, public) = {
            let r = self.inner.read();
            (r.port, r.public_addr)
        };
        advertised_addrs(lan_ipv4(), public, port)
    }

    /// The port the listener is bound to (what router port mapping forwards to).
    pub fn port(&self) -> u16 {
        self.inner.read().port
    }

    /// Set or clear the internet address that router port mapping obtained.
    pub fn set_public_addr(&self, addr: Option<(Ipv4Addr, u16)>) {
        self.inner.write().public_addr = addr;
    }

    /// Private mode: register invite multiaddrs and dial only those, presenting the invite's token.
    pub fn dial_invite(&self, root_cid: String, addrs: Vec<String>, token: String) {
        let _ = self.cmd_tx.send(SwarmCmd::DialInvite { root_cid, addrs, token });
    }

    /// Serve a library's chunks to peers that present `access_token`.
    pub fn seed_library(&self, root_cid: String, library_id: String, access_token: String) {
        let _ = self.cmd_tx.send(SwarmCmd::Seed {
            root_cid,
            library_id,
            access_token,
        });
    }

    pub async fn fetch_missing(
        &self,
        root_cid: String,
        want_cids: Vec<String>,
        library_id: String,
        token: String,
    ) -> Result<usize, String> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.cmd_tx
            .send(SwarmCmd::Fetch {
                root_cid,
                want_cids,
                library_id,
                token,
                reply: tx,
            })
            .map_err(|_| "swarm stopped".to_string())?;
        rx.await.map_err(|_| "swarm cancelled".to_string())?
    }

    pub fn invite_addrs(&self, root_cid: &str) -> Vec<String> {
        self.inner
            .read()
            .invite_dial_addrs
            .get(root_cid)
            .cloned()
            .unwrap_or_default()
    }
}

/// Whether `token` is the access token of a library this Mac seeds. Constant-time, so the
/// comparison does not reveal how much of a guess was right.
fn token_matches(inner: &Arc<RwLock<SwarmInner>>, root_cid: &str, token: &str) -> bool {
    let r = inner.read();
    match r.access_tokens.get(root_cid) {
        Some(expected) if !expected.is_empty() => expected.as_bytes().ct_eq(token.as_bytes()).into(),
        _ => false,
    }
}

/// A chunk id as this protocol uses them: a lowercase hex SHA-256. Anything else could be a path.
fn is_cid(cid: &str) -> bool {
    cid.len() == 64 && cid.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// One connection, either way round. `access` is set when this side dialled: the library and
/// token it presents. A connection this side accepted serves only libraries whose token the
/// other side presents on it.
async fn handle_connection(
    inner: Arc<RwLock<SwarmInner>>,
    mut stream: TcpStream,
    remote_hint: Option<String>,
    access: Option<(String, String)>,
) -> Result<(), String> {
    let inbound = access.is_none();
    let (peer_id, public_key) = {
        let r = inner.read();
        (r.identity.peer_id.clone(), r.identity.public_key_hex.clone())
    };

    // Private mode: Identify does not advertise discoverable listen addrs for gossip.
    write_message(
        &mut stream,
        &P2pMessage::Identify {
            peer_id: peer_id.clone(),
            public_key_hex: public_key,
            protocol_version: PROTOCOL_VERSION,
            listen_addrs: vec![],
        },
    )
    .await
    .map_err(|e| e.to_string())?;

    let first = timeout(HANDSHAKE_TIMEOUT, read_message(&mut stream))
        .await
        .map_err(|_| "peer did not identify in time".to_string())?
        .map_err(|e| e.to_string())?;
    let remote = match first {
        P2pMessage::Identify { peer_id, .. } => {
            // Session status only — remote listen_addrs are ignored (no dial retain).
            let session_addr = remote_hint.clone().into_iter().collect::<Vec<_>>();
            {
                let mut w = inner.write();
                w.peers.insert(
                    peer_id.clone(),
                    SwarmPeerStatus {
                        peer_id: peer_id.clone(),
                        addrs: session_addr,
                        connected: true,
                        transfer_bytes: 0,
                        role: if inbound { "inbound" } else { "invite-dial" }.into(),
                    },
                );
            }
            peer_id
        }
        other => return Err(format!("expected Identify, got {other:?}")),
    };

    if let Some((root_cid, token)) = &access {
        write_message(
            &mut stream,
            &P2pMessage::Access {
                root_cid: root_cid.clone(),
                token: token.clone(),
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    // Libraries the other side has proved it was invited to, on this connection.
    let mut authorised: HashSet<String> = HashSet::new();

    loop {
        // Until a token matches, a silent or slow peer is dropped quickly.
        let wait = if inbound && authorised.is_empty() { HANDSHAKE_TIMEOUT } else { IDLE_TIMEOUT };
        let msg = match timeout(wait, read_message(&mut stream)).await {
            Ok(Ok(m)) => m,
            _ => break,
        };
        match msg {
            P2pMessage::Access { root_cid, token } => {
                if !inbound || !token_matches(&inner, &root_cid, &token) {
                    let _ = write_message(
                        &mut stream,
                        &P2pMessage::Error {
                            message: "This library was not shared with you.".into(),
                        },
                    )
                    .await;
                    break;
                }
                let cids: Vec<String> = inner
                    .read()
                    .seeding
                    .get(&root_cid)
                    .map(|set| set.iter().cloned().collect())
                    .unwrap_or_default();
                authorised.insert(root_cid.clone());
                write_message(&mut stream, &P2pMessage::Have { root_cid, cids })
                    .await
                    .map_err(|e| e.to_string())?;
            }
            P2pMessage::Want { root_cid, cids } => {
                if !authorised.contains(&root_cid) {
                    let _ = write_message(
                        &mut stream,
                        &P2pMessage::Error {
                            message: "This library was not shared with you.".into(),
                        },
                    )
                    .await;
                    break;
                }
                for cid in cids {
                    // Only chunks of the library this peer was invited to.
                    let allowed = inner
                        .read()
                        .seeding
                        .get(&root_cid)
                        .is_some_and(|set| set.contains(&cid));
                    if !allowed {
                        continue;
                    }
                    let Some(bytes) = find_chunk(&inner, &cid) else { continue };
                    let len = bytes.len() as u64;
                    write_message(
                        &mut stream,
                        &P2pMessage::Block {
                            cid,
                            data_hex: hex::encode(bytes),
                        },
                    )
                    .await
                    .map_err(|e| e.to_string())?;
                    let mut w = inner.write();
                    w.bytes_sent += len;
                    if let Some(p) = w.peers.get_mut(&remote) {
                        p.transfer_bytes += len;
                    }
                }
            }
            P2pMessage::Have { .. } => {
                // Inventory only — never treat Have as address discovery.
            }
            P2pMessage::Announce { .. } => {
                // Private mode: ignore DHT/gossip announce messages.
                let _ = write_message(
                    &mut stream,
                    &P2pMessage::Error {
                        message: "private mode: announce rejected".into(),
                    },
                )
                .await;
            }
            P2pMessage::Block { .. } => {
                // Unrequested: never stored. Fetches read their blocks on their own connection.
            }
            P2pMessage::Identify { .. } => {}
            P2pMessage::Error { message } => {
                eprintln!("p2p peer error: {message}");
                if !inbound {
                    break;
                }
            }
        }
    }

    {
        let mut w = inner.write();
        if let Some(p) = w.peers.get_mut(&remote) {
            p.connected = false;
        }
    }
    Ok(())
}

fn find_chunk(inner: &Arc<RwLock<SwarmInner>>, cid: &str) -> Option<Vec<u8>> {
    if !is_cid(cid) {
        return None;
    }
    let app_data = inner.read().app_data.clone();
    let libs = app_data.join("libraries");
    if let Ok(entries) = std::fs::read_dir(libs) {
        for entry in entries.flatten() {
            let path = entry.path().join("chunks").join(cid);
            if path.exists() {
                return std::fs::read(path).ok();
            }
        }
    }
    None
}

/// The address other devices on this network would reach this Mac at, found without sending anything:
/// connecting a UDP socket to a non-routable address makes the OS pick its outgoing interface.
/// `None` when there is no network route (offline), or only loopback.
pub fn lan_ipv4() -> Option<Ipv4Addr> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("192.0.2.1:9").ok()?; // TEST-NET-1: never routed, nothing is sent
    match socket.local_addr().ok()?.ip() {
        IpAddr::V4(ip) if !ip.is_loopback() && !ip.is_unspecified() => Some(ip),
        _ => None,
    }
}

/// The multiaddrs an invite can carry for a listener on `port`, in the order a dialer tries them:
/// the LAN address (a peer on the same network), then the internet address router port mapping
/// opened (a peer elsewhere), then loopback (a second copy on this Mac).
/// Never `0.0.0.0`: it is a bind address, not a place to dial.
pub fn advertised_addrs(lan: Option<Ipv4Addr>, public: Option<(Ipv4Addr, u16)>, port: u16) -> Vec<String> {
    let mut addrs = Vec::with_capacity(3);
    if let Some(ip) = lan {
        addrs.push(multiaddr_tcp(&ip.to_string(), port));
    }
    if let Some((ip, public_port)) = public {
        addrs.push(multiaddr_tcp(&ip.to_string(), public_port));
    }
    addrs.push(multiaddr_tcp("127.0.0.1", port));
    addrs
}

/// Fetch chunks by dialing **only** invite-embedded multiaddrs for this root_cid, presenting the
/// invite's token. A block is stored only if this side asked for it and its content matches its id.
async fn fetch_blocks_invite_only(
    inner: Arc<RwLock<SwarmInner>>,
    root_cid: &str,
    want_cids: Vec<String>,
    library_id: &str,
    token: &str,
) -> Result<usize, String> {
    let addrs: Vec<String> = {
        let r = inner.read();
        r.invite_dial_addrs
            .get(root_cid)
            .cloned()
            .unwrap_or_default()
    };

    if addrs.is_empty() {
        return Err(
            "private mode: no invite dial addresses for this library (paste invite with seederAddrs)"
                .into(),
        );
    }

    let mut got = 0usize;
    let mut refused: Option<String> = None;
    let store_path = {
        let r = inner.read();
        r.app_data.join("libraries").join(library_id)
    };
    let store = ChunkStore::open(store_path).map_err(|e| e.to_string())?;

    for addr in addrs {
        let Some((host, port)) = parse_tcp_multiaddr(&addr) else {
            continue;
        };
        let host = if host == "0.0.0.0" {
            "127.0.0.1".to_string()
        } else {
            host
        };
        let Ok(Ok(mut stream)) = timeout(DIAL_TIMEOUT, TcpStream::connect((host.as_str(), port))).await else {
            continue;
        };

        let (my_id, my_pk) = {
            let r = inner.read();
            (r.identity.peer_id.clone(), r.identity.public_key_hex.clone())
        };
        write_message(
            &mut stream,
            &P2pMessage::Identify {
                peer_id: my_id,
                public_key_hex: my_pk,
                protocol_version: PROTOCOL_VERSION,
                listen_addrs: vec![],
            },
        )
        .await
        .map_err(|e| e.to_string())?;
        if !matches!(
            timeout(HANDSHAKE_TIMEOUT, read_message(&mut stream)).await,
            Ok(Ok(P2pMessage::Identify { .. }))
        ) {
            continue;
        }

        write_message(
            &mut stream,
            &P2pMessage::Access {
                root_cid: root_cid.to_string(),
                token: token.to_string(),
            },
        )
        .await
        .map_err(|e| e.to_string())?;
        match timeout(HANDSHAKE_TIMEOUT, read_message(&mut stream)).await {
            Ok(Ok(P2pMessage::Have { .. })) => {}
            Ok(Ok(P2pMessage::Error { message })) => {
                refused = Some(message);
                continue;
            }
            _ => continue,
        }

        let still_need: Vec<String> = want_cids
            .iter()
            .filter(|c| !store.has(c))
            .cloned()
            .collect();
        if still_need.is_empty() {
            break;
        }
        let wanted: HashSet<&String> = still_need.iter().collect();

        write_message(
            &mut stream,
            &P2pMessage::Want {
                root_cid: root_cid.to_string(),
                cids: still_need.clone(),
            },
        )
        .await
        .map_err(|e| e.to_string())?;

        for _ in 0..still_need.len() {
            match timeout(IDLE_TIMEOUT, read_message(&mut stream)).await {
                Ok(Ok(P2pMessage::Block { cid, data_hex })) => {
                    let Ok(bytes) = hex::decode(data_hex) else { continue };
                    // Only what was asked for, and only if the bytes are what the id says.
                    if !wanted.contains(&cid) || cid_of_ciphertext(&bytes) != cid {
                        continue;
                    }
                    store.put_raw(&bytes).map_err(|e| e.to_string())?;
                    got += 1;
                    inner.write().bytes_received += bytes.len() as u64;
                }
                Ok(Ok(P2pMessage::Error { message })) => return Err(message),
                Ok(Err(_)) | Err(_) => break,
                _ => {}
            }
        }
        if want_cids.iter().all(|c| store.has(c)) {
            break;
        }
    }

    if got == 0 && want_cids.iter().any(|c| !store.has(c)) {
        if let Some(message) = refused {
            return Err(message);
        }
    }
    Ok(got)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::p2p::protocol::parse_tcp_multiaddr;

    #[test]
    fn invite_carries_the_lan_address_before_loopback() {
        let addrs = advertised_addrs(Some(Ipv4Addr::new(192, 168, 1, 20)), None, 7421);
        assert_eq!(addrs, vec!["/ip4/192.168.1.20/tcp/7421", "/ip4/127.0.0.1/tcp/7421"]);
    }

    #[test]
    fn offline_mac_still_advertises_loopback() {
        assert_eq!(advertised_addrs(None, None, 7421), vec!["/ip4/127.0.0.1/tcp/7421"]);
    }

    #[test]
    fn no_advertised_address_is_the_unspecified_bind_address() {
        for lan in [None, Some(Ipv4Addr::new(10, 0, 0, 5))] {
            for addr in advertised_addrs(lan, Some((Ipv4Addr::new(203, 0, 113, 9), 7421)), 7421) {
                let (host, port) = parse_tcp_multiaddr(&addr).expect("valid multiaddr");
                assert_ne!(host, "0.0.0.0");
                assert_eq!(port, 7421);
            }
        }
    }

    #[test]
    fn detected_lan_address_is_routable_ipv4_or_absent() {
        if let Some(ip) = lan_ipv4() {
            assert!(!ip.is_loopback() && !ip.is_unspecified());
        }
    }

    #[tokio::test]
    async fn a_running_listener_advertises_its_port_as_of_now() {
        let identity = PeerIdentity::generate("advertise-test");
        let data = std::env::temp_dir().join(format!("cb-swarm-{}", uuid::Uuid::new_v4()));
        let swarm = SwarmHandle::start(identity, data.clone(), Some(0)).await.unwrap();
        let addrs = swarm.listen_addrs();
        let port = parse_tcp_multiaddr(addrs.last().unwrap()).unwrap().1;
        assert_ne!(port, 0);
        assert_eq!(addrs, advertised_addrs(lan_ipv4(), None, port));
        assert_eq!(swarm.status().listen_addrs, addrs);
        let _ = std::fs::remove_dir_all(&data);
    }

    /// What a stranger on the internet gets by connecting: nothing without the library's token.
    #[tokio::test]
    async fn the_listener_serves_only_peers_holding_the_token() {
        let data = std::env::temp_dir().join(format!("cb-swarm-{}", uuid::Uuid::new_v4()));
        let store = ChunkStore::open(data.join("libraries").join("lib")).unwrap();
        let cid = store.put_raw(b"sealed chunk").unwrap();
        let root = "ab".repeat(32);
        let token = "cd".repeat(32);
        let swarm = SwarmHandle::start(PeerIdentity::generate("seeder"), data.clone(), Some(0)).await.unwrap();
        swarm.seed_library(root.clone(), "lib".into(), token.clone());
        let port = swarm.port();

        let stranger = PeerIdentity::generate("stranger");
        let connect = |access: Option<String>| {
            let (root, cid, stranger) = (root.clone(), cid.clone(), stranger.clone());
            async move {
                // The seed command is applied on the swarm's own task; give it a moment.
                tokio::time::sleep(Duration::from_millis(100)).await;
                let mut s = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
                write_message(&mut s, &P2pMessage::Identify {
                    peer_id: stranger.peer_id.clone(),
                    public_key_hex: stranger.public_key_hex.clone(),
                    protocol_version: PROTOCOL_VERSION,
                    listen_addrs: vec![],
                })
                .await
                .unwrap();
                let mut seen = Vec::new();
                if let Some(token) = access {
                    write_message(&mut s, &P2pMessage::Access { root_cid: root.clone(), token }).await.unwrap();
                    // Wait for the answer, as the real dialer does: a refusal closes the connection.
                    while let Ok(Ok(msg)) = timeout(Duration::from_millis(500), read_message(&mut s)).await {
                        let answered = matches!(msg, P2pMessage::Have { .. } | P2pMessage::Error { .. });
                        seen.push(msg);
                        if answered {
                            break;
                        }
                    }
                }
                let _ = write_message(&mut s, &P2pMessage::Want { root_cid: root, cids: vec![cid] }).await;
                while let Ok(Ok(msg)) = timeout(Duration::from_millis(500), read_message(&mut s)).await {
                    seen.push(msg);
                }
                seen
            }
        };

        let no_token = connect(None).await;
        assert!(
            !no_token.iter().any(|m| matches!(m, P2pMessage::Have { .. } | P2pMessage::Block { .. })),
            "no token: {no_token:?}"
        );
        let wrong = connect(Some("ef".repeat(32))).await;
        assert!(wrong.iter().any(|m| matches!(m, P2pMessage::Error { .. })), "wrong token: {wrong:?}");
        assert!(!wrong.iter().any(|m| matches!(m, P2pMessage::Have { .. } | P2pMessage::Block { .. })));
        let right = connect(Some(token)).await;
        assert!(right.iter().any(|m| matches!(m, P2pMessage::Have { .. })), "right token: {right:?}");
        assert!(
            right.iter().any(|m| matches!(m, P2pMessage::Block { cid: c, .. } if *c == cid)),
            "right token: {right:?}"
        );
        let _ = std::fs::remove_dir_all(&data);
    }
}
