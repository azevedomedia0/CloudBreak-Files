//! TCP swarm in **private mode**: listen + invite-dial only.
//! No DHT, no STUN, no peer-address gossip / Announce. Fetch uses only
//! multiaddrs that arrived inside a signed invite for that library root.

use crate::p2p::chunk_store::ChunkStore;
use crate::p2p::identity::PeerIdentity;
use crate::p2p::protocol::{
    multiaddr_tcp, parse_tcp_multiaddr, read_message, write_message, P2pMessage, DEFAULT_PORT,
    PROTOCOL_VERSION,
};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;

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
    listen_addrs: Vec<String>,
    listening: bool,
    /// root_cid -> set of CIDs we seed
    seeding: HashMap<String, HashSet<String>>,
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
    DialInvite { root_cid: String, addrs: Vec<String> },
    Seed { root_cid: String, library_id: String },
    Fetch {
        root_cid: String,
        want_cids: Vec<String>,
        library_id: String,
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
        // Bind all interfaces for inbound invite-dials; publish loopback in invites
        // when no public multiaddr is configured (still invite-only, not DHT).
        let listen_addrs = vec![
            multiaddr_tcp("127.0.0.1", local.port()),
            multiaddr_tcp("0.0.0.0", local.port()),
        ];

        let inner = Arc::new(RwLock::new(SwarmInner {
            identity: identity.clone(),
            app_data: app_data.clone(),
            listen_addrs: listen_addrs.clone(),
            listening: true,
            seeding: HashMap::new(),
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
        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, addr)) => {
                        let inner = accept_inner.clone();
                        tokio::spawn(async move {
                            let _ = handle_connection(inner, stream, Some(addr.to_string()), true).await;
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
                    SwarmCmd::DialInvite { root_cid, addrs } => {
                        {
                            let mut w = cmd_inner.write();
                            let entry = w.invite_dial_addrs.entry(root_cid).or_default();
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
                                tokio::spawn(async move {
                                    if let Ok(stream) = TcpStream::connect((host.as_str(), port)).await {
                                        let _ = handle_connection(inner, stream, Some(addr), false).await;
                                    }
                                });
                            }
                        }
                    }
                    SwarmCmd::Seed {
                        root_cid,
                        library_id,
                    } => {
                        let store_path = app_data.join("libraries").join(&library_id);
                        if let Ok(store) = ChunkStore::open(store_path) {
                            if let Ok(cids) = store.list_cids() {
                                let mut w = cmd_inner.write();
                                w.seeding.insert(root_cid, cids.into_iter().collect());
                            }
                        }
                    }
                    SwarmCmd::Fetch {
                        root_cid,
                        want_cids,
                        library_id,
                        reply,
                    } => {
                        let result =
                            fetch_blocks_invite_only(cmd_inner.clone(), &root_cid, want_cids, &library_id)
                                .await;
                        let _ = reply.send(result);
                    }
                }
            }
        });

        Ok(handle)
    }

    pub fn status(&self) -> SwarmStatus {
        let r = self.inner.read();
        SwarmStatus {
            listening: r.listening,
            listen_addrs: r.listen_addrs.clone(),
            peer_id: r.identity.peer_id.clone(),
            peers: r.peers.values().cloned().collect(),
            seeding_root_cids: r.seeding.keys().cloned().collect(),
            bytes_sent: r.bytes_sent,
            bytes_received: r.bytes_received,
            private_mode: true,
        }
    }

    pub fn listen_addrs(&self) -> Vec<String> {
        // Prefer concrete loopback for invite embedding (0.0.0.0 is not dialable).
        self.inner
            .read()
            .listen_addrs
            .iter()
            .filter(|a| !a.contains("0.0.0.0"))
            .cloned()
            .collect()
    }

    /// Private mode: register invite multiaddrs and dial only those.
    pub fn dial_invite(&self, root_cid: String, addrs: Vec<String>) {
        let _ = self.cmd_tx.send(SwarmCmd::DialInvite { root_cid, addrs });
    }

    pub fn seed_library(&self, root_cid: String, library_id: String) {
        let _ = self.cmd_tx.send(SwarmCmd::Seed {
            root_cid,
            library_id,
        });
    }

    pub async fn fetch_missing(
        &self,
        root_cid: String,
        want_cids: Vec<String>,
        library_id: String,
    ) -> Result<usize, String> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.cmd_tx
            .send(SwarmCmd::Fetch {
                root_cid,
                want_cids,
                library_id,
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

async fn handle_connection(
    inner: Arc<RwLock<SwarmInner>>,
    mut stream: TcpStream,
    remote_hint: Option<String>,
    inbound: bool,
) -> Result<(), String> {
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

    let remote = match read_message(&mut stream).await.map_err(|e| e.to_string())? {
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

    {
        let seeding: Vec<(String, Vec<String>)> = {
            let r = inner.read();
            r.seeding
                .iter()
                .map(|(root, cids)| (root.clone(), cids.iter().cloned().collect()))
                .collect()
        };
        for (root_cid, cids) in seeding {
            write_message(
                &mut stream,
                &P2pMessage::Have {
                    root_cid,
                    cids,
                },
            )
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    loop {
        let msg = match read_message(&mut stream).await {
            Ok(m) => m,
            Err(_) => break,
        };
        match msg {
            P2pMessage::Want { root_cid: _, cids } => {
                for cid in cids {
                    let data = find_chunk(&inner, &cid);
                    if let Some(bytes) = data {
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
            P2pMessage::Block { cid, data_hex } => {
                if let Ok(bytes) = hex::decode(&data_hex) {
                    let len = bytes.len() as u64;
                    let inbox = {
                        let r = inner.read();
                        r.app_data.join("chunk_inbox")
                    };
                    let _ = std::fs::create_dir_all(&inbox);
                    let _ = std::fs::write(inbox.join(&cid), &bytes);
                    let mut w = inner.write();
                    w.bytes_received += len;
                }
            }
            P2pMessage::Identify { .. } => {}
            P2pMessage::Error { message } => {
                eprintln!("p2p peer error: {message}");
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
    let inbox = app_data.join("chunk_inbox").join(cid);
    if inbox.exists() {
        return std::fs::read(inbox).ok();
    }
    None
}

/// Fetch chunks by dialing **only** invite-embedded multiaddrs for this root_cid.
async fn fetch_blocks_invite_only(
    inner: Arc<RwLock<SwarmInner>>,
    root_cid: &str,
    want_cids: Vec<String>,
    library_id: &str,
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
        let Ok(mut stream) = TcpStream::connect((host.as_str(), port)).await else {
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
        let _ = read_message(&mut stream).await;

        let still_need: Vec<String> = want_cids
            .iter()
            .filter(|c| !store.has(c))
            .cloned()
            .collect();
        if still_need.is_empty() {
            break;
        }

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
            match read_message(&mut stream).await {
                Ok(P2pMessage::Block { cid, data_hex }) => {
                    if let Ok(bytes) = hex::decode(data_hex) {
                        store.put_raw(&bytes).map_err(|e| e.to_string())?;
                        got += 1;
                        let mut w = inner.write();
                        w.bytes_received += bytes.len() as u64;
                        let _ = cid;
                    }
                }
                Ok(P2pMessage::Error { message }) => return Err(message),
                Err(_) => break,
                _ => {}
            }
        }
        if want_cids.iter().all(|c| store.has(c)) {
            break;
        }
    }

    Ok(got)
}
