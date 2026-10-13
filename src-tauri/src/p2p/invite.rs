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
    #[error("This invite was made by an older version of Cloudbreak Files, which did not sign where to connect, so it cannot be trusted. Ask the sender to copy the invite again.")]
    Outdated,
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
    /// The secret the seeder's listener asks for before it serves this library. Anyone holding
    /// the invite has it, which is the point: the invite is the permission.
    #[serde(default)]
    pub access_token: String,
}

fn invite_private_default() -> bool {
    true
}

/// What the seeder signs. Since v2 this includes the dial addresses, so anyone who handles an invite
/// on its way to the invitee cannot change where it points. The addresses go in as a JSON list, so no
/// two different lists can produce the same signed text.
fn capability_message(invite: &LibraryInvite) -> Vec<u8> {
    format!(
        "aether-cap-v2|{library_id}|{root_cid}|{role}|{peer}|{epoch}|{exp}|{addrs}",
        library_id = invite.library_id,
        root_cid = invite.root_cid,
        role = invite.role,
        peer = invite.seeder_peer_id,
        epoch = invite.epoch,
        exp = invite.expires_at,
        addrs = serde_json::to_string(&invite.seeder_addrs).unwrap_or_default(),
    )
    .into_bytes()
}

/// What invites made before addresses were signed carry. Only used to recognise them and say so.
fn legacy_capability_message(invite: &LibraryInvite) -> Vec<u8> {
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
        if verify_signature(&self.seeder_public_key_hex, &msg, &self.capability_sig).is_err() {
            // A genuine signature over the old text means an older version made it: say that,
            // instead of the generic "invalid signature".
            let legacy = legacy_capability_message(self);
            return Err(
                if verify_signature(&self.seeder_public_key_hex, &legacy, &self.capability_sig).is_ok() {
                    InviteError::Outdated
                } else {
                    InviteError::Signature
                },
            );
        }
        let expected_peer = crate::p2p::identity::peer_id_from_pubkey(
            &hex::decode(&self.seeder_public_key_hex).map_err(|_| InviteError::Format)?,
        );
        if expected_peer != self.seeder_peer_id {
            return Err(InviteError::Signature);
        }
        Ok(())
    }

    /// The same invite pointing at other addresses, signed again by `identity`. The addresses are
    /// signed, so this is how a saved invite gets this Mac's current ones: only its seeder can do it.
    pub fn with_seeder_addrs(mut self, addrs: Vec<String>, identity: &PeerIdentity) -> Self {
        self.seeder_addrs = addrs;
        self.sign_with(identity)
    }

    /// Read an invite without checking its signature, for the seeder to refresh its own saved copy
    /// (which may predate signed addresses). Never use on an invite that came from someone else.
    pub fn decode_unverified(text: &str) -> Result<Self, InviteError> {
        let payload = text.trim().strip_prefix(INVITE_PREFIX).ok_or(InviteError::Format)?;
        let bytes = URL_SAFE_NO_PAD.decode(payload).map_err(|_| InviteError::Format)?;
        serde_json::from_slice(&bytes).map_err(|_| InviteError::Format)
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
            access_token: "aa".repeat(32),
        }
        .sign_with(&id);
        let encoded = invite.encode().unwrap();
        assert!(encoded.starts_with(INVITE_PREFIX));
        let decoded = LibraryInvite::decode(&encoded).unwrap();
        assert_eq!(decoded.library_id, "lib-1");
        assert_eq!(decoded.seeder_peer_id, id.peer_id);

        // The addresses are signed: pointing the invite somewhere else breaks it...
        let mut redirected = decoded.clone();
        redirected.seeder_addrs = vec!["/ip4/203.0.113.9/tcp/7421".into()];
        assert!(matches!(LibraryInvite::decode(&redirected.encode().unwrap()), Err(InviteError::Signature)));
        // ...as does any other signed field.
        let mut tampered = decoded.clone();
        tampered.role = "admin".into();
        assert!(LibraryInvite::decode(&tampered.encode().unwrap()).is_err());

        // The seeder can refresh the addresses; that signs the new ones.
        let refreshed = decoded.with_seeder_addrs(
            vec!["/ip4/192.168.1.20/tcp/7421".into(), "/ip4/127.0.0.1/tcp/7421".into()],
            &id,
        );
        let again = LibraryInvite::decode(&refreshed.encode().unwrap()).unwrap();
        assert_eq!(again.seeder_addrs[0], "/ip4/192.168.1.20/tcp/7421");
        assert_eq!(again.seeder_peer_id, id.peer_id);
    }

    #[test]
    fn an_invite_from_before_signed_addresses_is_recognised_not_trusted() {
        let id = PeerIdentity::generate("old-seeder");
        let root = LibraryRootKey::random();
        let mut invite = LibraryInvite {
            root_cid: "abc123".into(),
            library_id: "lib-1".into(),
            library_name: "Old".into(),
            seeder_peer_id: id.peer_id.clone(),
            seeder_public_key_hex: id.public_key_hex.clone(),
            seeder_addrs: vec!["/ip4/127.0.0.1/tcp/7421".into()],
            role: "viewer".into(),
            wrapped_library_key: wrap_with_passphrase(&root, "invite-secret-99").unwrap(),
            capability_sig: String::new(),
            expires_at: 0,
            epoch: 1,
            manifest_nonce_hex: "00".repeat(12),
            private_mode: true,
            access_token: "aa".repeat(32),
        };
        invite.capability_sig = id.sign(&legacy_capability_message(&invite));
        let encoded = invite.encode().unwrap();
        let err = LibraryInvite::decode(&encoded).unwrap_err();
        assert!(matches!(err, InviteError::Outdated), "{err}");
        assert!(err.to_string().contains("copy the invite again"));
        // The seeder can still read its own copy and issue a current one.
        let own = LibraryInvite::decode_unverified(&encoded).unwrap();
        let current = own.with_seeder_addrs(vec!["/ip4/192.168.1.20/tcp/7421".into()], &id);
        assert!(LibraryInvite::decode(&current.encode().unwrap()).is_ok());
        // A forged signature is not mistaken for an old one.
        let mut forged = invite.clone();
        forged.capability_sig = PeerIdentity::generate("other").sign(&legacy_capability_message(&forged));
        assert!(matches!(LibraryInvite::decode(&forged.encode().unwrap()), Err(InviteError::Signature)));
    }
}
