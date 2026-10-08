//! Encrypted library manifest (content-addressed root).

use crate::p2p::chunk_store::{cid_of_ciphertext, ChunkStore, EncryptedChunkMeta};
use crate::p2p::keys::{aead_decrypt, aead_encrypt, LibraryRootKey};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum ManifestError {
    #[error("{0}")]
    Io(String),
    #[error("crypto: {0}")]
    Crypto(String),
    #[error("invalid manifest")]
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestFileEntry {
    pub file_id: String,
    pub name: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub plaintext_sha256: String,
    pub chunks: Vec<EncryptedChunkMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryManifest {
    pub version: u32,
    pub library_id: String,
    pub name: String,
    pub description: String,
    pub epoch: u64,
    pub owner_peer_id: String,
    pub created_at: String,
    pub files: Vec<ManifestFileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedManifestBlob {
    pub root_cid: String,
    pub nonce_hex: String,
    pub ciphertext_hex: String,
}

impl LibraryManifest {
    pub fn to_bytes(&self) -> Result<Vec<u8>, ManifestError> {
        serde_json::to_vec(self).map_err(|e| ManifestError::Io(e.to_string()))
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self, ManifestError> {
        serde_json::from_slice(bytes).map_err(|_| ManifestError::Invalid)
    }

    pub fn encrypt(
        &self,
        root_key: &LibraryRootKey,
        store: &ChunkStore,
    ) -> Result<EncryptedManifestBlob, ManifestError> {
        let plain = self.to_bytes()?;
        let (ct, nonce) = aead_encrypt(&root_key.0, &plain)
            .map_err(|e| ManifestError::Crypto(e.to_string()))?;
        let root_cid = store
            .put_raw(&ct)
            .map_err(|e| ManifestError::Io(e.to_string()))?;
        // Also verify CID matches
        debug_assert_eq!(root_cid, cid_of_ciphertext(&ct));
        Ok(EncryptedManifestBlob {
            root_cid,
            nonce_hex: hex::encode(nonce),
            ciphertext_hex: hex::encode(ct),
        })
    }

    pub fn decrypt_blob(
        root_key: &LibraryRootKey,
        blob: &EncryptedManifestBlob,
    ) -> Result<Self, ManifestError> {
        let ct = hex::decode(&blob.ciphertext_hex)
            .map_err(|e| ManifestError::Crypto(e.to_string()))?;
        let nonce = hex::decode(&blob.nonce_hex)
            .map_err(|e| ManifestError::Crypto(e.to_string()))?;
        let plain = aead_decrypt(&root_key.0, &nonce, &ct)
            .map_err(|e| ManifestError::Crypto(e.to_string()))?;
        Self::from_bytes(&plain)
    }

    pub fn save_local(&self, dir: &Path, blob: &EncryptedManifestBlob) -> Result<(), ManifestError> {
        fs::create_dir_all(dir).map_err(|e| ManifestError::Io(e.to_string()))?;
        let plain_path = dir.join("manifest.json");
        let blob_path = dir.join("manifest.enc.json");
        fs::write(
            &plain_path,
            serde_json::to_vec_pretty(self).map_err(|e| ManifestError::Io(e.to_string()))?,
        )
        .map_err(|e| ManifestError::Io(e.to_string()))?;
        fs::write(
            &blob_path,
            serde_json::to_vec_pretty(blob).map_err(|e| ManifestError::Io(e.to_string()))?,
        )
        .map_err(|e| ManifestError::Io(e.to_string()))?;
        Ok(())
    }

    pub fn load_local(dir: &Path) -> Result<(Self, EncryptedManifestBlob), ManifestError> {
        let plain: Self = serde_json::from_slice(
            &fs::read(dir.join("manifest.json")).map_err(|e| ManifestError::Io(e.to_string()))?,
        )
        .map_err(|_| ManifestError::Invalid)?;
        let blob: EncryptedManifestBlob = serde_json::from_slice(
            &fs::read(dir.join("manifest.enc.json")).map_err(|e| ManifestError::Io(e.to_string()))?,
        )
        .map_err(|_| ManifestError::Invalid)?;
        Ok((plain, blob))
    }
}
