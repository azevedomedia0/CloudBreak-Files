//! Length-prefixed JSON Have/Want/Block protocol over TCP.

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

pub const PROTOCOL_VERSION: u32 = 1;
pub const DEFAULT_PORT: u16 = 7421;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum P2pMessage {
    Identify {
        peer_id: String,
        public_key_hex: String,
        protocol_version: u32,
        listen_addrs: Vec<String>,
    },
    Have {
        root_cid: String,
        cids: Vec<String>,
    },
    Want {
        root_cid: String,
        cids: Vec<String>,
    },
    Block {
        cid: String,
        data_hex: String,
    },
    /// Rejected in private mode (invite-dial only; no DHT/gossip).
    Announce {
        root_cid: String,
        peer_id: String,
        addrs: Vec<String>,
        signature: String,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, thiserror::Error)]
pub enum ProtocolError {
    #[error("io: {0}")]
    Io(String),
    #[error("protocol: {0}")]
    Proto(String),
}

pub async fn write_message(stream: &mut TcpStream, msg: &P2pMessage) -> Result<(), ProtocolError> {
    let bytes = serde_json::to_vec(msg).map_err(|e| ProtocolError::Proto(e.to_string()))?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err(ProtocolError::Proto("message too large".into()));
    }
    let len = (bytes.len() as u32).to_be_bytes();
    stream
        .write_all(&len)
        .await
        .map_err(|e| ProtocolError::Io(e.to_string()))?;
    stream
        .write_all(&bytes)
        .await
        .map_err(|e| ProtocolError::Io(e.to_string()))?;
    stream.flush().await.map_err(|e| ProtocolError::Io(e.to_string()))?;
    Ok(())
}

pub async fn read_message(stream: &mut TcpStream) -> Result<P2pMessage, ProtocolError> {
    let mut len_buf = [0u8; 4];
    stream
        .read_exact(&mut len_buf)
        .await
        .map_err(|e| ProtocolError::Io(e.to_string()))?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len > 16 * 1024 * 1024 {
        return Err(ProtocolError::Proto("message too large".into()));
    }
    let mut buf = vec![0u8; len];
    stream
        .read_exact(&mut buf)
        .await
        .map_err(|e| ProtocolError::Io(e.to_string()))?;
    serde_json::from_slice(&buf).map_err(|e| ProtocolError::Proto(e.to_string()))
}

pub fn multiaddr_tcp(host: &str, port: u16) -> String {
    format!("/ip4/{host}/tcp/{port}")
}

pub fn parse_tcp_multiaddr(addr: &str) -> Option<(String, u16)> {
    // /ip4/127.0.0.1/tcp/7421
    let parts: Vec<&str> = addr.trim().split('/').filter(|p| !p.is_empty()).collect();
    if parts.len() >= 4 && parts[0] == "ip4" && parts[2] == "tcp" {
        let host = parts[1].to_string();
        let port = parts[3].parse().ok()?;
        return Some((host, port));
    }
    // host:port fallback
    if let Some((h, p)) = addr.rsplit_once(':') {
        if let Ok(port) = p.parse() {
            return Some((h.to_string(), port));
        }
    }
    None
}
