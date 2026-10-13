//! Length-prefixed JSON Have/Want/Block protocol over TCP.

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

/// 2: a peer must present a library's access token (`Access`) before it is told about or sent anything.
pub const PROTOCOL_VERSION: u32 = 2;
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
    /// Dialer, after `Identify`: "I was invited to this library." Until a proof checks out, the listener
    /// says nothing about what it seeds and serves no chunk.
    AccessRequest {
        root_cid: String,
    },
    /// Listener's answer to `AccessRequest`: a fresh random nonce to prove the invite's token against.
    Challenge {
        root_cid: String,
        nonce_hex: String,
    },
    /// Dialer's answer to `Challenge`: an HMAC keyed with the library's access token (see `access_proof`).
    /// The token itself never goes on the wire, so a wrong device at a reused address learns nothing.
    Access {
        root_cid: String,
        proof_hex: String,
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

/// HMAC-SHA256, keyed with the library's access token, over the library, the listener's fresh nonce and
/// both peer ids. A device that is not the seeder can ask for a proof but cannot reuse it, and a proof
/// for one connection is worthless on another.
pub fn access_proof(token: &str, root_cid: &str, nonce_hex: &str, dialer_id: &str, listener_id: &str) -> String {
    use hmac::{Hmac, Mac};
    let mut mac = <Hmac<sha2::Sha256> as Mac>::new_from_slice(token.as_bytes()).expect("HMAC takes any key length");
    mac.update(format!("aether-access-v1|{root_cid}|{nonce_hex}|{dialer_id}|{listener_id}").as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// Constant-time check of a dialer's proof.
pub fn verify_access_proof(
    token: &str,
    root_cid: &str,
    nonce_hex: &str,
    dialer_id: &str,
    listener_id: &str,
    proof_hex: &str,
) -> bool {
    use hmac::{Hmac, Mac};
    let Ok(proof) = hex::decode(proof_hex) else { return false };
    let mut mac = <Hmac<sha2::Sha256> as Mac>::new_from_slice(token.as_bytes()).expect("HMAC takes any key length");
    mac.update(format!("aether-access-v1|{root_cid}|{nonce_hex}|{dialer_id}|{listener_id}").as_bytes());
    mac.verify_slice(&proof).is_ok()
}

#[cfg(test)]
mod access_proof_tests {
    use super::*;

    #[test]
    fn a_proof_needs_the_token_the_nonce_and_both_ids() {
        let token = "ab".repeat(32);
        let proof = access_proof(&token, "root", "nonce1", "dialer", "listener");
        assert!(verify_access_proof(&token, "root", "nonce1", "dialer", "listener", &proof));
        assert!(!verify_access_proof(&"cd".repeat(32), "root", "nonce1", "dialer", "listener", &proof), "other token");
        assert!(!verify_access_proof(&token, "root", "nonce2", "dialer", "listener", &proof), "other nonce");
        assert!(!verify_access_proof(&token, "root", "nonce1", "someone-else", "listener", &proof), "other dialer");
        assert!(!verify_access_proof(&token, "other", "nonce1", "dialer", "listener", &proof), "other library");
        assert!(!verify_access_proof(&token, "root", "nonce1", "dialer", "listener", "zz"), "not hex");
        assert!(!verify_access_proof(&token, "root", "nonce1", "dialer", "listener", ""), "empty");
        assert!(!proof.contains(&token), "the token is not in the proof");
    }
}
