//! Long-lived Ed25519 peer identity. Peer id = SHA-256 of the public key (hex).

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const IDENTITY_FILE: &str = "p2p_identity.json";

#[derive(Debug, thiserror::Error)]
pub enum IdentityError {
    #[error("{0}")]
    Io(String),
    #[error("corrupt identity file")]
    Corrupt,
    #[error("invalid signature")]
    BadSignature,
    #[error("invalid public key")]
    BadPublicKey,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdentityFile {
    /// Hex-encoded 32-byte Ed25519 secret key seed.
    secret_seed_hex: String,
    /// Hex-encoded 32-byte public key.
    public_key_hex: String,
    peer_id: String,
    display_name: String,
}

#[derive(Clone)]
pub struct PeerIdentity {
    signing: SigningKey,
    pub peer_id: String,
    pub public_key_hex: String,
    pub display_name: String,
}

impl PeerIdentity {
    pub fn generate(display_name: &str) -> Self {
        let signing = SigningKey::generate(&mut OsRng);
        let verifying = signing.verifying_key();
        let public_key_hex = hex::encode(verifying.as_bytes());
        let peer_id = peer_id_from_pubkey(verifying.as_bytes());
        Self {
            signing,
            peer_id,
            public_key_hex,
            display_name: display_name.to_string(),
        }
    }

    pub fn verifying_key(&self) -> VerifyingKey {
        self.signing.verifying_key()
    }

    pub fn sign(&self, message: &[u8]) -> String {
        hex::encode(self.signing.sign(message).to_bytes())
    }

    pub fn x25519_public_hex(&self) -> String {
        // Derive X25519 from Ed25519 seed for key wrapping (same seed).
        let seed = self.signing.to_bytes();
        let static_secret = x25519_dalek::StaticSecret::from(seed);
        let public = x25519_dalek::PublicKey::from(&static_secret);
        hex::encode(public.as_bytes())
    }

    pub fn x25519_secret(&self) -> x25519_dalek::StaticSecret {
        x25519_dalek::StaticSecret::from(self.signing.to_bytes())
    }

    pub fn save(&self, path: &Path) -> Result<(), IdentityError> {
        let file = IdentityFile {
            secret_seed_hex: hex::encode(self.signing.to_bytes()),
            public_key_hex: self.public_key_hex.clone(),
            peer_id: self.peer_id.clone(),
            display_name: self.display_name.clone(),
        };
        let json = serde_json::to_string_pretty(&file).map_err(|e| IdentityError::Io(e.to_string()))?;
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(|e| IdentityError::Io(e.to_string()))?;
        }
        let tmp = path.with_extension("json.tmp");
        let mut f = fs::File::create(&tmp).map_err(|e| IdentityError::Io(e.to_string()))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            f.set_permissions(fs::Permissions::from_mode(0o600))
                .map_err(|e| IdentityError::Io(e.to_string()))?;
        }
        f.write_all(json.as_bytes())
            .map_err(|e| IdentityError::Io(e.to_string()))?;
        f.sync_all().map_err(|e| IdentityError::Io(e.to_string()))?;
        fs::rename(&tmp, path).map_err(|e| IdentityError::Io(e.to_string()))?;
        Ok(())
    }

    pub fn load(path: &Path) -> Result<Option<Self>, IdentityError> {
        match fs::read_to_string(path) {
            Ok(text) => {
                let file: IdentityFile = serde_json::from_str(&text).map_err(|_| IdentityError::Corrupt)?;
                let seed = hex::decode(&file.secret_seed_hex).map_err(|_| IdentityError::Corrupt)?;
                let seed_arr: [u8; 32] = seed.try_into().map_err(|_| IdentityError::Corrupt)?;
                let signing = SigningKey::from_bytes(&seed_arr);
                Ok(Some(Self {
                    signing,
                    peer_id: file.peer_id,
                    public_key_hex: file.public_key_hex,
                    display_name: file.display_name,
                }))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(IdentityError::Io(e.to_string())),
        }
    }

    pub fn load_or_create(path: &Path, display_name: &str) -> Result<Self, IdentityError> {
        if let Some(existing) = Self::load(path)? {
            return Ok(existing);
        }
        let id = Self::generate(display_name);
        id.save(path)?;
        Ok(id)
    }
}

pub fn peer_id_from_pubkey(pubkey: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"aethercloud-peer-v1");
    hasher.update(pubkey);
    hex::encode(hasher.finalize())
}

pub fn verify_signature(public_key_hex: &str, message: &[u8], sig_hex: &str) -> Result<(), IdentityError> {
    let pk_bytes = hex::decode(public_key_hex).map_err(|_| IdentityError::BadPublicKey)?;
    let pk_arr: [u8; 32] = pk_bytes.try_into().map_err(|_| IdentityError::BadPublicKey)?;
    let verifying = VerifyingKey::from_bytes(&pk_arr).map_err(|_| IdentityError::BadPublicKey)?;
    let sig_bytes = hex::decode(sig_hex).map_err(|_| IdentityError::BadSignature)?;
    let sig_arr: [u8; 64] = sig_bytes.try_into().map_err(|_| IdentityError::BadSignature)?;
    let signature = Signature::from_bytes(&sig_arr);
    verifying
        .verify(message, &signature)
        .map_err(|_| IdentityError::BadSignature)
}

pub fn identity_path(app_data: &Path) -> PathBuf {
    app_data.join(IDENTITY_FILE)
}

impl Drop for PeerIdentity {
    fn drop(&mut self) {
        // SigningKey zeroizes on drop via dalek; nothing extra required.
        let _ = &mut self.signing;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_sign_verify_roundtrip() {
        let id = PeerIdentity::generate("tester");
        let msg = b"hello swarm";
        let sig = id.sign(msg);
        verify_signature(&id.public_key_hex, msg, &sig).unwrap();
        assert_eq!(id.peer_id.len(), 64);
    }

    #[test]
    fn save_load() {
        let dir = std::env::temp_dir().join(format!("aether-p2p-id-{}", uuid::Uuid::new_v4()));
        let path = dir.join(IDENTITY_FILE);
        let id = PeerIdentity::generate("save-me");
        id.save(&path).unwrap();
        let loaded = PeerIdentity::load(&path).unwrap().unwrap();
        assert_eq!(loaded.peer_id, id.peer_id);
        assert_eq!(loaded.public_key_hex, id.public_key_hex);
        let _ = fs::remove_dir_all(dir);
    }
}
