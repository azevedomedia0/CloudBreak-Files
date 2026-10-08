//! Signed out-of-band invite blobs: `aetherlib:1:<base64url(json)>`.

use crate::p2p::identity::{verify_signature, PeerIdentity};
use crate::p2p::keys::WrappedLibraryKey;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};

pub const INVITE_PREFIX: &str = "aetherlib:1:";

#[derive(Debug, thiserror::Error)]
pub enum InviteError {
    #[error("invalid invite format")]
    Format,
    #[error("invalid signature")]
    Signature,
    #[error("invite expired")]
    Expired,
    #[error("{0}")]
    Other(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryInvite {
    pub root_cid: String,
    pub library_id: String,
    pub library_name: String,
    pub seeder_peer_id: String,
    pub seeder_public_key_hex: String,
    pub seeder_addrs: Vec<String>,
    pub role: String,
    pub wrapped_library_key: WrappedLibraryKey,
    pub capability_sig: String,
    pub expires_at: i64,
    pub epoch: u64,
    /// Encrypted manifest nonce (needed to decrypt root after fetching ciphertext).
    pub manifest_nonce_hex: String,
    /// Invite-dial only; no DHT / STUN / peer announce (always true).
    #[serde(default = "invite_private_default")]
    pub private_mode: bool,
}

fn invite_private_default() -> bool {
    true
}

fn capability_message(invite: &LibraryInvite) -> Vec<u8> {
    format!(
        "aether-cap-v1|{library_id}|{root_cid}|{role}|{peer}|{epoch}|{exp}",
        library_id = invite.library_id,
        root_cid = invite.root_cid,
        role = invite.role,
        peer = invite.seeder_peer_id,
        epoch = invite.epoch,
        exp = invite.expires_at,
    )
    .into_bytes()
}

impl LibraryInvite {
    pub fn sign_with(mut self, identity: &PeerIdentity) -> Self {
        self.seeder_peer_id = identity.peer_id.clone();
        self.seeder_public_key_hex = identity.public_key_hex.clone();
        let msg = capability_message(&self);
        self.capability_sig = identity.sign(&msg);
        self
    }

    pub fn verify(&self) -> Result<(), InviteError> {
        let now = chrono::Utc::now().timestamp();
        if self.expires_at > 0 && now > self.expires_at {
            return Err(InviteError::Expired);
        }
        let msg = capability_message(self);
        verify_signature(&self.seeder_public_key_hex, &msg, &self.capability_sig)
            .map_err(|_| InviteError::Signature)?;
        let expected_peer = crate::p2p::identity::peer_id_from_pubkey(
            &hex::decode(&self.seeder_public_key_hex).map_err(|_| InviteError::Format)?,
        );
        if expected_peer != self.seeder_peer_id {
            return Err(InviteError::Signature);
        }
        Ok(())
    }

    pub fn encode(&self) -> Result<String, InviteError> {
        let json = serde_json::to_vec(self).map_err(|e| InviteError::Other(e.to_string()))?;
        Ok(format!(
            "{INVITE_PREFIX}{}",
            URL_SAFE_NO_PAD.encode(json)
        ))
    }

    pub fn decode(text: &str) -> Result<Self, InviteError> {
        let trimmed = text.trim();
        let payload = trimmed
            .strip_prefix(INVITE_PREFIX)
            .ok_or(InviteError::Format)?;
        let bytes = URL_SAFE_NO_PAD
            .decode(payload)
            .map_err(|_| InviteError::Format)?;
        let invite: Self = serde_json::from_slice(&bytes).map_err(|_| InviteError::Format)?;
        invite.verify()?;
        Ok(invite)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::p2p::identity::PeerIdentity;
    use crate::p2p::keys::{wrap_with_passphrase, LibraryRootKey};

    #[test]
    fn encode_decode_roundtrip() {
        let id = PeerIdentity::generate("seeder");
        let root = LibraryRootKey::random();
        let wrapped = wrap_with_passphrase(&root, "invite-secret-99").unwrap();
        let invite = LibraryInvite {
            root_cid: "abc123".into(),
            library_id: "lib-1".into(),
            library_name: "Test Lib".into(),
            seeder_peer_id: String::new(),
            seeder_public_key_hex: String::new(),
            seeder_addrs: vec!["/ip4/127.0.0.1/tcp/7421".into()],
            role: "viewer".into(),
            wrapped_library_key: wrapped,
            capability_sig: String::new(),
            expires_at: chrono::Utc::now().timestamp() + 86400,
            epoch: 1,
            manifest_nonce_hex: "00".repeat(12),
            private_mode: true,
        }
        .sign_with(&id);
        let encoded = invite.encode().unwrap();
        assert!(encoded.starts_with(INVITE_PREFIX));
        let decoded = LibraryInvite::decode(&encoded).unwrap();
        assert_eq!(decoded.library_id, "lib-1");
        assert_eq!(decoded.seeder_peer_id, id.peer_id);
    }
}
