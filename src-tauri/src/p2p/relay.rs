//! Reaching a device whose router will not let strangers in.
//!
//! Both devices can connect *out* to a relay server (the `cloudbreak-relay` program in `relay/`, run by
//! whoever hosts it). The sharing device keeps one connection open and registers under an id; an invite
//! carries `relay://host:port/<id>` next to its other addresses. A device dialing that address asks the relay
//! for the id, the relay tells the host, the host opens a second connection for that session, and the relay
//! joins the two sockets. From then on it is the same connection as a direct one: the same handshake (a proof
//! of the invite's access token) and the same encrypted chunks run through it, so the relay is trusted with
//! nothing but seeing who connects and how much they transfer.
//!
//! The id is the SHA-256 of a secret only this device can compute (`PeerIdentity::derive_secret`), so
//! knowing an id from an invite does not let anyone else answer for it.

use crate::p2p::identity::PeerIdentity;
use crate::p2p::swarm::SwarmHandle;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;

pub const DEFAULT_PORT: u16 = 7422;
const SECRET_LABEL: &str = "cloudbreak-relay-host-v1";
const MAX_LINE: usize = 256;
/// Connecting to the relay and its first answer.
const IO_TIMEOUT: Duration = Duration::from_secs(10);
/// A dialer waits this long for the host to answer through the relay.
const DIAL_WAIT: Duration = Duration::from_secs(25);
/// The relay pings every 30 seconds; silence for this long means the connection is dead.
const CONTROL_SILENCE: Duration = Duration::from_secs(90);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelayEndpoint {
    pub host: String,
    pub port: u16,
}

impl RelayEndpoint {
    /// `host`, `host:port` or `relay://host:port`; the port defaults to 7422.
    pub fn parse(text: &str) -> Result<Self, String> {
        let text = text.trim().trim_start_matches("relay://").trim_end_matches('/');
        if text.is_empty() {
            return Err("Enter the relay server's address, for example relay.example.com:7422".into());
        }
        if text.contains(['/', ' ', '\n', '\t']) {
            return Err("A relay address is a host name and an optional port, for example relay.example.com:7422".into());
        }
        let (host, port) = match text.rsplit_once(':') {
            Some((host, port)) => {
                let port: u16 = port.parse().map_err(|_| "The relay's port must be a number from 1 to 65535".to_string())?;
                if port == 0 {
                    return Err("The relay's port must be a number from 1 to 65535".into());
                }
                (host, port)
            }
            None => (text, DEFAULT_PORT),
        };
        if host.is_empty() {
            return Err("Enter the relay server's host name".into());
        }
        Ok(Self { host: host.to_string(), port })
    }

    pub fn label(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

/// The invite address for a host registered under `id` on `endpoint`.
pub fn relay_addr(endpoint: &RelayEndpoint, id: &str) -> String {
    format!("relay://{}:{}/{id}", endpoint.host, endpoint.port)
}

pub fn is_relay_addr(addr: &str) -> bool {
    addr.starts_with("relay://")
}

pub fn parse_relay_addr(addr: &str) -> Option<(RelayEndpoint, String)> {
    let rest = addr.strip_prefix("relay://")?;
    let (endpoint, id) = rest.rsplit_once('/')?;
    if id.len() != 64 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    Some((RelayEndpoint::parse(endpoint).ok()?, id.to_ascii_lowercase()))
}

/// This device's secret on any relay, and the public id derived from it.
pub fn host_secret(identity: &PeerIdentity) -> String {
    hex::encode(identity.derive_secret(SECRET_LABEL))
}

pub fn relay_id(secret_hex: &str) -> String {
    hex::encode(Sha256::digest(hex::decode(secret_hex).unwrap_or_default()))
}

/// One line, a byte at a time: the bytes after it belong to whatever runs over the connection.
async fn read_line(stream: &mut TcpStream) -> Result<String, String> {
    let mut line = Vec::with_capacity(64);
    loop {
        let byte = stream.read_u8().await.map_err(|e| e.to_string())?;
        if byte == b'\n' {
            return Ok(String::from_utf8_lossy(&line).trim_end_matches('\r').to_string());
        }
        if line.len() >= MAX_LINE {
            return Err("the relay sent too much".into());
        }
        line.push(byte);
    }
}

async fn send_line(stream: &mut TcpStream, line: &str) -> Result<(), String> {
    stream.write_all(format!("{line}\n").as_bytes()).await.map_err(|e| e.to_string())?;
    stream.flush().await.map_err(|e| e.to_string())
}

async fn open(endpoint: &RelayEndpoint) -> Result<TcpStream, String> {
    let stream = timeout(IO_TIMEOUT, TcpStream::connect((endpoint.host.as_str(), endpoint.port)))
        .await
        .map_err(|_| format!("{} did not answer", endpoint.label()))?
        .map_err(|e| format!("cannot reach {}: {e}", endpoint.label()))?;
    let _ = stream.set_nodelay(true);
    Ok(stream)
}

/// Ask the relay for a connection to the host registered under `id`. On success the stream is joined to the
/// host and carries the peer protocol from its first byte.
pub async fn dial(endpoint: &RelayEndpoint, id: &str) -> Result<TcpStream, String> {
    let mut stream = open(endpoint).await?;
    send_line(&mut stream, &format!("CONNECT {id}")).await?;
    match timeout(DIAL_WAIT, read_line(&mut stream)).await {
        Ok(Ok(line)) if line == "OK" => Ok(stream),
        Ok(Ok(line)) => Err(line.strip_prefix("ERR ").unwrap_or(&line).to_string()),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("the relay did not answer".into()),
    }
}

/// What the Preferences screen shows about this device's relay.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RelayStatus {
    pub enabled: bool,
    pub connected: bool,
    /// The address invites carry while connected.
    pub address: Option<String>,
    pub message: String,
}

impl RelayStatus {
    pub fn off() -> Self {
        Self { message: "No relay server is set. Only devices that can reach this one directly can connect.".into(), ..Default::default() }
    }
}

/// Keep this device registered with the relay: connect, register, serve each incoming session, and reconnect
/// when the connection drops. Stops when the returned task is aborted.
pub fn start_hosting(
    endpoint: RelayEndpoint,
    host_key: Option<String>,
    identity: &PeerIdentity,
    swarm: Arc<SwarmHandle>,
    status: Arc<RwLock<RelayStatus>>,
) -> tokio::task::JoinHandle<()> {
    let secret = host_secret(identity);
    let id = relay_id(&secret);
    *status.write() = RelayStatus {
        enabled: true,
        connected: false,
        address: None,
        message: format!("Connecting to {}…", endpoint.label()),
    };
    tokio::spawn(async move {
        let mut wait = Duration::from_secs(2);
        loop {
            let failure = match host_once(&endpoint, &host_key, &secret, &id, &swarm, &status).await {
                Ok(()) => "the connection was closed".to_string(),
                Err(e) => e,
            };
            swarm.set_relay_addr(None);
            *status.write() = RelayStatus {
                enabled: true,
                connected: false,
                address: None,
                message: format!("Not connected to {}: {failure}. Trying again.", endpoint.label()),
            };
            tokio::time::sleep(wait).await;
            wait = (wait * 2).min(Duration::from_secs(60));
        }
    })
}

/// One connection's life. Returns when it ends, whichever way.
async fn host_once(
    endpoint: &RelayEndpoint,
    host_key: &Option<String>,
    secret: &str,
    id: &str,
    swarm: &Arc<SwarmHandle>,
    status: &Arc<RwLock<RelayStatus>>,
) -> Result<(), String> {
    let mut control = open(endpoint).await?;
    let login = match host_key {
        Some(key) if !key.is_empty() => format!("LISTEN {id} {secret} {key}"),
        _ => format!("LISTEN {id} {secret}"),
    };
    send_line(&mut control, &login).await?;
    match timeout(IO_TIMEOUT, read_line(&mut control)).await {
        Ok(Ok(line)) if line == "OK" => {}
        Ok(Ok(line)) => return Err(line.strip_prefix("ERR ").unwrap_or(&line).to_string()),
        Ok(Err(e)) => return Err(e),
        Err(_) => return Err("the relay did not answer".into()),
    }
    let address = relay_addr(endpoint, id);
    swarm.set_relay_addr(Some(address.clone()));
    *status.write() = RelayStatus {
        enabled: true,
        connected: true,
        address: Some(address),
        message: format!("Connected to {}. Invites you copy now work from other networks.", endpoint.label()),
    };

    loop {
        let line = timeout(CONTROL_SILENCE, read_line(&mut control))
            .await
            .map_err(|_| "the relay went quiet".to_string())??;
        if let Some(session) = line.strip_prefix("INCOMING ") {
            if session.len() == 32 && session.bytes().all(|b| b.is_ascii_hexdigit()) {
                let (endpoint, session, swarm) = (endpoint.clone(), session.to_string(), swarm.clone());
                tokio::spawn(async move {
                    let _ = accept_session(&endpoint, &session, &swarm).await;
                });
            }
        }
        // PING, and anything else, only shows the connection is alive.
    }
}

/// Answer one incoming session: connect to the relay, take the dialer's place in the pairing, and serve the
/// connection like any other inbound one (the access proof still decides what it gets).
async fn accept_session(endpoint: &RelayEndpoint, session: &str, swarm: &Arc<SwarmHandle>) -> Result<(), String> {
    let mut stream = open(endpoint).await?;
    send_line(&mut stream, &format!("ACCEPT {session}")).await?;
    match timeout(IO_TIMEOUT, read_line(&mut stream)).await {
        Ok(Ok(line)) if line == "OK" => {
            swarm.accept_relayed(stream);
            Ok(())
        }
        _ => Err("the relay did not pair the session".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_endpoint_is_a_host_and_an_optional_port() {
        assert_eq!(RelayEndpoint::parse("relay.example.com").unwrap(), RelayEndpoint { host: "relay.example.com".into(), port: 7422 });
        assert_eq!(RelayEndpoint::parse(" relay.example.com:9000 ").unwrap().port, 9000);
        assert_eq!(RelayEndpoint::parse("relay://203.0.113.9:7422/").unwrap().host, "203.0.113.9");
        for bad in ["", "   ", ":7422", "host:0", "host:99999", "host:abc", "ho st", "host/path"] {
            assert!(RelayEndpoint::parse(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn a_relay_address_round_trips_and_rejects_a_bad_id() {
        let endpoint = RelayEndpoint::parse("relay.example.com:7422").unwrap();
        let id = "ab".repeat(32);
        let addr = relay_addr(&endpoint, &id);
        assert!(is_relay_addr(&addr) && !is_relay_addr("/ip4/127.0.0.1/tcp/7421"));
        assert_eq!(parse_relay_addr(&addr), Some((endpoint, id)));
        assert_eq!(parse_relay_addr("relay://relay.example.com:7422/short"), None);
        assert_eq!(parse_relay_addr("relay://relay.example.com:7422"), None);
    }

    #[test]
    fn the_id_is_public_and_the_secret_is_not_the_id_and_matches_the_server() {
        let identity = PeerIdentity::generate("relay-test");
        let secret = host_secret(&identity);
        assert_eq!(secret, host_secret(&identity), "stable for one identity");
        assert_ne!(secret, host_secret(&PeerIdentity::generate("other")));
        assert_ne!(relay_id(&secret), secret);
        assert_eq!(relay_id(&secret), cloudbreak_relay::relay_id(&secret), "same id as the relay computes");
    }
}
