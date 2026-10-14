//! A relay for Cloudbreak Files P2P libraries.
//!
//! Two devices on different networks often cannot connect to each other: neither router lets a stranger in.
//! Both can connect *out*, so they meet here. The relay copies bytes between them and does nothing else: the
//! devices run their own handshake (a proof of the invite's access token, then encrypted chunks) through it,
//! so the relay is not trusted with anything but seeing who connects and how much they transfer.
//!
//! Protocol: ASCII lines of at most `MAX_LINE` bytes, each ending in `\n`. A line is read one byte at a time
//! so nothing after it is consumed; once a pairing is made the two sockets are joined and everything that
//! follows belongs to the devices.
//!
//! - Host (the device sharing a library), once, on a long-lived connection:
//!   `LISTEN <id> <secret> [key]` -> `OK`. The id is `relay_id(secret)`, so only the holder of the secret can
//!   answer for an id. The relay then sends `INCOMING <session>` when someone asks for the host, and `PING`
//!   every 30 seconds. The optional key is the operator's password for who may host (see `--host-key`).
//! - Host, per incoming session, on a new connection: `ACCEPT <session>` -> `OK`, then the devices talk.
//! - Dialer (the invited device): `CONNECT <id>` -> `OK` once the host has accepted, or `ERR <reason>`.

use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{tcp::OwnedReadHalf, tcp::OwnedWriteHalf, TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot, Semaphore};
use tokio::time::timeout;

pub const MAX_LINE: usize = 256;
pub const DEFAULT_PORT: u16 = 7422;

/// The public name of a host: the SHA-256 of its secret. Dialers learn this from an invite; the secret
/// stays on the host, so knowing an id does not let anyone answer for it.
pub fn relay_id(secret_hex: &str) -> String {
    let bytes = hex::decode(secret_hex).unwrap_or_default();
    hex::encode(Sha256::digest(&bytes))
}

#[derive(Debug, Clone)]
pub struct RelayConfig {
    /// When set, a host must send this key with `LISTEN`. Dialers never need it, so an invite works for anyone.
    pub host_key: Option<String>,
    pub max_hosts: usize,
    /// Joined sessions at once.
    pub max_sessions: usize,
    /// A joined session with no bytes either way for this long is closed.
    pub idle: Duration,
    /// How long a dialer waits for the host to answer.
    pub accept_wait: Duration,
}

impl Default for RelayConfig {
    fn default() -> Self {
        Self {
            host_key: None,
            max_hosts: 1000,
            max_sessions: 256,
            idle: Duration::from_secs(600),
            accept_wait: Duration::from_secs(15),
        }
    }
}

struct Host {
    /// Lines to send down the host's control connection.
    tx: mpsc::UnboundedSender<String>,
    /// Which registration this is, so an old one leaving does not remove a newer one.
    generation: u64,
}

struct State {
    config: RelayConfig,
    hosts: Mutex<HashMap<String, Host>>,
    pending: Mutex<HashMap<String, oneshot::Sender<TcpStream>>>,
    sessions: Arc<Semaphore>,
}

/// Read one line a byte at a time (so the bytes after it stay in the socket).
async fn read_line(stream: &mut (impl AsyncReadExt + Unpin)) -> Result<String, String> {
    let mut line = Vec::with_capacity(64);
    loop {
        let byte = stream.read_u8().await.map_err(|e| e.to_string())?;
        if byte == b'\n' {
            return String::from_utf8(line).map_err(|_| "not text".to_string()).map(|s| s.trim_end_matches('\r').to_string());
        }
        if line.len() >= MAX_LINE {
            return Err("line too long".into());
        }
        line.push(byte);
    }
}

async fn send_line(stream: &mut (impl AsyncWriteExt + Unpin), line: &str) -> Result<(), String> {
    stream.write_all(format!("{line}\n").as_bytes()).await.map_err(|e| e.to_string())?;
    stream.flush().await.map_err(|e| e.to_string())
}

fn random_hex(bytes: usize) -> String {
    use rand::RngCore;
    let mut buf = vec![0u8; bytes];
    rand::rngs::OsRng.fill_bytes(&mut buf);
    hex::encode(buf)
}

fn is_hex(text: &str, len: usize) -> bool {
    text.len() == len && text.bytes().all(|b| b.is_ascii_hexdigit())
}

fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Serve until the listener fails. Each connection is handled on its own task.
pub async fn serve(listener: TcpListener, config: RelayConfig) {
    let state = Arc::new(State {
        sessions: Arc::new(Semaphore::new(config.max_sessions)),
        config,
        hosts: Mutex::new(HashMap::new()),
        pending: Mutex::new(HashMap::new()),
    });
    let mut generation = 0u64;
    loop {
        let Ok((stream, _)) = listener.accept().await else { return };
        let _ = stream.set_nodelay(true);
        generation += 1;
        let state = state.clone();
        tokio::spawn(async move {
            let _ = handle(state, stream, generation).await;
        });
    }
}

async fn handle(state: Arc<State>, mut stream: TcpStream, generation: u64) -> Result<(), String> {
    let line = timeout(Duration::from_secs(10), read_line(&mut stream))
        .await
        .map_err(|_| "no request".to_string())??;
    let parts: Vec<&str> = line.split(' ').collect();
    match parts.as_slice() {
        ["LISTEN", id, secret] => listen(state, stream, id, secret, None, generation).await,
        ["LISTEN", id, secret, key] => listen(state, stream, id, secret, Some(key), generation).await,
        ["ACCEPT", session] => accept(state, stream, session).await,
        ["CONNECT", id] => connect(state, stream, id).await,
        _ => send_line(&mut stream, "ERR bad request").await,
    }
}

async fn listen(
    state: Arc<State>,
    mut stream: TcpStream,
    id: &str,
    secret: &str,
    key: Option<&str>,
    generation: u64,
) -> Result<(), String> {
    if let Some(required) = &state.config.host_key {
        if !key.is_some_and(|k| same(k, required)) {
            return send_line(&mut stream, "ERR hosting needs the relay's key").await;
        }
    }
    if !is_hex(secret, 64) || !is_hex(id, 64) || relay_id(secret) != id {
        return send_line(&mut stream, "ERR id does not match secret").await;
    }
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let full = {
        let mut hosts = state.hosts.lock().unwrap();
        if hosts.len() >= state.config.max_hosts && !hosts.contains_key(id) {
            true
        } else {
            // A host that connects again replaces its older registration (dropping it ends that connection).
            hosts.insert(id.to_string(), Host { tx, generation });
            false
        }
    };
    if full {
        return send_line(&mut stream, "ERR relay is full").await;
    }
    send_line(&mut stream, "OK").await?;

    let (mut reader, mut writer) = stream.into_split();
    let mut tick = tokio::time::interval(Duration::from_secs(30));
    tick.tick().await;
    let result: Result<(), String> = loop {
        tokio::select! {
            line = rx.recv() => match line {
                Some(line) => if let Err(e) = send_line(&mut writer, &line).await { break Err(e) },
                None => break Ok(()),
            },
            _ = tick.tick() => if let Err(e) = send_line(&mut writer, "PING").await { break Err(e) },
            // The host sends nothing after LISTEN; a read that ends means it has gone.
            read = reader.read_u8() => if read.is_err() { break Ok(()) },
        }
    };
    let mut hosts = state.hosts.lock().unwrap();
    if hosts.get(id).is_some_and(|h| h.generation == generation) {
        hosts.remove(id);
    }
    result
}

async fn accept(state: Arc<State>, mut stream: TcpStream, session: &str) -> Result<(), String> {
    let waiting = state.pending.lock().unwrap().remove(session);
    match waiting {
        Some(slot) => {
            send_line(&mut stream, "OK").await?;
            let _ = slot.send(stream);
            Ok(())
        }
        None => send_line(&mut stream, "ERR no such session").await,
    }
}

async fn connect(state: Arc<State>, mut dialer: TcpStream, id: &str) -> Result<(), String> {
    if !is_hex(id, 64) {
        return send_line(&mut dialer, "ERR bad id").await;
    }
    let Ok(permit) = state.sessions.clone().try_acquire_owned() else {
        return send_line(&mut dialer, "ERR relay is busy").await;
    };
    let session = random_hex(16);
    let (slot, host_stream) = oneshot::channel();
    let tx = state.hosts.lock().unwrap().get(id).map(|h| h.tx.clone());
    let Some(tx) = tx else {
        return send_line(&mut dialer, "ERR the host is offline").await;
    };
    state.pending.lock().unwrap().insert(session.clone(), slot);
    if tx.send(format!("INCOMING {session}")).is_err() {
        state.pending.lock().unwrap().remove(&session);
        return send_line(&mut dialer, "ERR the host is offline").await;
    }
    let host = match timeout(state.config.accept_wait, host_stream).await {
        Ok(Ok(stream)) => stream,
        _ => {
            state.pending.lock().unwrap().remove(&session);
            return send_line(&mut dialer, "ERR the host did not answer").await;
        }
    };
    send_line(&mut dialer, "OK").await?;
    pipe(dialer, host, state.config.idle).await;
    drop(permit);
    Ok(())
}

/// Copy one direction until the other side ends, a write fails or nothing moves for `idle`.
async fn copy_idle(mut from: OwnedReadHalf, mut to: OwnedWriteHalf, idle: Duration) {
    let mut buf = vec![0u8; 16 * 1024];
    loop {
        match timeout(idle, from.read(&mut buf)).await {
            Ok(Ok(n)) if n > 0 => {
                if to.write_all(&buf[..n]).await.is_err() {
                    return;
                }
            }
            _ => {
                let _ = to.shutdown().await;
                return;
            }
        }
    }
}

/// Join two sockets until either direction ends.
async fn pipe(a: TcpStream, b: TcpStream, idle: Duration) {
    let (ar, aw) = a.into_split();
    let (br, bw) = b.into_split();
    tokio::select! {
        _ = copy_idle(ar, bw, idle) => {},
        _ = copy_idle(br, aw, idle) => {},
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn start(config: RelayConfig) -> std::net::SocketAddr {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(serve(listener, config));
        addr
    }

    async fn host(addr: std::net::SocketAddr, secret: &str, key: Option<&str>) -> (TcpStream, String) {
        let mut s = TcpStream::connect(addr).await.unwrap();
        let id = relay_id(secret);
        let line = match key {
            Some(k) => format!("LISTEN {id} {secret} {k}"),
            None => format!("LISTEN {id} {secret}"),
        };
        send_line(&mut s, &line).await.unwrap();
        (s, id)
    }

    #[tokio::test]
    async fn joins_a_dialer_and_a_host_and_carries_their_bytes() {
        let addr = start(RelayConfig::default()).await;
        let secret = "ab".repeat(32);
        let (mut control, id) = host(addr, &secret, None).await;
        assert_eq!(read_line(&mut control).await.unwrap(), "OK");

        let dialer = tokio::spawn(async move {
            let mut d = TcpStream::connect(addr).await.unwrap();
            send_line(&mut d, &format!("CONNECT {id}")).await.unwrap();
            assert_eq!(read_line(&mut d).await.unwrap(), "OK");
            d.write_all(b"hello host").await.unwrap();
            let mut got = [0u8; 10];
            d.read_exact(&mut got).await.unwrap();
            got
        });

        let session = read_line(&mut control).await.unwrap();
        let session = session.strip_prefix("INCOMING ").expect("an incoming session").to_string();
        let mut h = TcpStream::connect(addr).await.unwrap();
        send_line(&mut h, &format!("ACCEPT {session}")).await.unwrap();
        assert_eq!(read_line(&mut h).await.unwrap(), "OK");
        let mut got = [0u8; 10];
        h.read_exact(&mut got).await.unwrap();
        assert_eq!(&got, b"hello host");
        h.write_all(b"hello dial").await.unwrap();
        assert_eq!(&dialer.await.unwrap(), b"hello dial");
    }

    #[tokio::test]
    async fn an_unknown_or_offline_host_is_refused() {
        let addr = start(RelayConfig::default()).await;
        let mut d = TcpStream::connect(addr).await.unwrap();
        send_line(&mut d, &format!("CONNECT {}", "11".repeat(32))).await.unwrap();
        assert!(read_line(&mut d).await.unwrap().starts_with("ERR"));
        let mut d = TcpStream::connect(addr).await.unwrap();
        send_line(&mut d, "CONNECT not-an-id").await.unwrap();
        assert!(read_line(&mut d).await.unwrap().starts_with("ERR"));
        let mut d = TcpStream::connect(addr).await.unwrap();
        send_line(&mut d, "ACCEPT deadbeef").await.unwrap();
        assert!(read_line(&mut d).await.unwrap().starts_with("ERR"));
    }

    #[tokio::test]
    async fn only_the_holder_of_the_secret_can_answer_for_an_id() {
        let addr = start(RelayConfig::default()).await;
        let mut s = TcpStream::connect(addr).await.unwrap();
        // The id of one secret, offered with another.
        send_line(&mut s, &format!("LISTEN {} {}", relay_id(&"ab".repeat(32)), "cd".repeat(32))).await.unwrap();
        assert!(read_line(&mut s).await.unwrap().starts_with("ERR"));
        // Knowing only the public id is no use: it is not a valid secret.
        let mut s = TcpStream::connect(addr).await.unwrap();
        let id = relay_id(&"ab".repeat(32));
        send_line(&mut s, &format!("LISTEN {id} {id}")).await.unwrap();
        assert!(read_line(&mut s).await.unwrap().starts_with("ERR"));
    }

    #[tokio::test]
    async fn a_host_key_is_required_to_host_but_not_to_dial() {
        let config = RelayConfig { host_key: Some("letmein".into()), ..Default::default() };
        let addr = start(config).await;
        let secret = "ab".repeat(32);
        let (mut no_key, _) = host(addr, &secret, None).await;
        assert!(read_line(&mut no_key).await.unwrap().starts_with("ERR"));
        let (mut wrong, _) = host(addr, &secret, Some("nope")).await;
        assert!(read_line(&mut wrong).await.unwrap().starts_with("ERR"));
        let (mut right, id) = host(addr, &secret, Some("letmein")).await;
        assert_eq!(read_line(&mut right).await.unwrap(), "OK");
        // A dialer asks without any key and reaches the host's control connection.
        let mut d = TcpStream::connect(addr).await.unwrap();
        send_line(&mut d, &format!("CONNECT {id}")).await.unwrap();
        assert!(read_line(&mut right).await.unwrap().starts_with("INCOMING "));
    }

    #[tokio::test]
    async fn a_host_that_does_not_answer_is_reported_to_the_dialer() {
        let addr = start(RelayConfig { accept_wait: Duration::from_millis(300), ..Default::default() }).await;
        let secret = "ab".repeat(32);
        let (mut control, id) = host(addr, &secret, None).await;
        assert_eq!(read_line(&mut control).await.unwrap(), "OK");
        let mut d = TcpStream::connect(addr).await.unwrap();
        send_line(&mut d, &format!("CONNECT {id}")).await.unwrap();
        assert!(read_line(&mut d).await.unwrap().starts_with("ERR"));
    }

    #[tokio::test]
    async fn a_host_that_leaves_is_forgotten() {
        let addr = start(RelayConfig::default()).await;
        let secret = "ab".repeat(32);
        let (mut control, id) = host(addr, &secret, None).await;
        assert_eq!(read_line(&mut control).await.unwrap(), "OK");
        drop(control);
        tokio::time::sleep(Duration::from_millis(200)).await;
        let mut d = TcpStream::connect(addr).await.unwrap();
        send_line(&mut d, &format!("CONNECT {id}")).await.unwrap();
        assert!(read_line(&mut d).await.unwrap().contains("offline"));
    }

    #[test]
    fn the_id_is_the_hash_of_the_secret() {
        let secret = "00".repeat(32);
        assert_eq!(relay_id(&secret), hex::encode(Sha256::digest([0u8; 32])));
        assert_ne!(relay_id(&secret), secret);
    }
}
