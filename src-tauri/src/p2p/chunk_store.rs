//! Content-addressed encrypted chunk store on disk.

use crate::crypto::compute_sha256;
use crate::p2p::keys::{aead_decrypt, aead_encrypt, LibraryRootKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

pub const CHUNK_SIZE: usize = 1024 * 1024; // 1 MiB

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("{0}")]
    Io(String),
    #[error("chunk not found: {0}")]
    Missing(String),
    #[error("crypto: {0}")]
    Crypto(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedChunkMeta {
    pub cid: String,
    pub nonce_hex: String,
    pub size: usize,
    pub index: u32,
}

pub fn cid_of_ciphertext(ciphertext: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"aether-chunk-v1");
    hasher.update(ciphertext);
    hex::encode(hasher.finalize())
}

pub struct ChunkStore {
    root: PathBuf,
}

impl ChunkStore {
    pub fn open(root: PathBuf) -> Result<Self, StoreError> {
        fs::create_dir_all(root.join("chunks")).map_err(|e| StoreError::Io(e.to_string()))?;
        Ok(Self { root })
    }

    fn chunk_path(&self, cid: &str) -> PathBuf {
        self.root.join("chunks").join(cid)
    }

    pub fn put_raw(&self, ciphertext: &[u8]) -> Result<String, StoreError> {
        let cid = cid_of_ciphertext(ciphertext);
        let path = self.chunk_path(&cid);
        if !path.exists() {
            fs::write(&path, ciphertext).map_err(|e| StoreError::Io(e.to_string()))?;
        }
        Ok(cid)
    }

    pub fn get_raw(&self, cid: &str) -> Result<Vec<u8>, StoreError> {
        fs::read(self.chunk_path(cid)).map_err(|_| StoreError::Missing(cid.to_string()))
    }

    pub fn has(&self, cid: &str) -> bool {
        self.chunk_path(cid).exists()
    }

    pub fn list_cids(&self) -> Result<Vec<String>, StoreError> {
        let dir = self.root.join("chunks");
        let mut out = Vec::new();
        if !dir.exists() {
            return Ok(out);
        }
        for entry in fs::read_dir(&dir).map_err(|e| StoreError::Io(e.to_string()))? {
            let entry = entry.map_err(|e| StoreError::Io(e.to_string()))?;
            if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                out.push(entry.file_name().to_string_lossy().into_owned());
            }
        }
        Ok(out)
    }

    /// Split plaintext, encrypt each chunk with file key, store ciphertext.
    pub fn ingest_file(
        &self,
        root_key: &LibraryRootKey,
        file_id: &str,
        plaintext: &[u8],
    ) -> Result<(Vec<EncryptedChunkMeta>, String), StoreError> {
        let file_key = root_key.derive_file_key(file_id);
        let plaintext_hash = compute_sha256(plaintext);
        let mut metas = Vec::new();
        for (index, chunk) in plaintext.chunks(CHUNK_SIZE).enumerate() {
            let (ct, nonce) = aead_encrypt(&file_key, chunk)
                .map_err(|e| StoreError::Crypto(e.to_string()))?;
            let cid = self.put_raw(&ct)?;
            metas.push(EncryptedChunkMeta {
                cid,
                nonce_hex: hex::encode(nonce),
                size: chunk.len(),
                index: index as u32,
            });
        }
        Ok((metas, plaintext_hash))
    }

    /// Stream-read a file from disk (no full-buffer load). Returns chunk metas, hash, and size.
    pub fn ingest_path(
        &self,
        root_key: &LibraryRootKey,
        file_id: &str,
        path: &Path,
    ) -> Result<(Vec<EncryptedChunkMeta>, String, u64), StoreError> {
        let file_key = root_key.derive_file_key(file_id);
        let mut file = File::open(path).map_err(|e| StoreError::Io(e.to_string()))?;
        let mut hasher = Sha256::new();
        let mut metas = Vec::new();
        let mut buf = vec![0u8; CHUNK_SIZE];
        let mut index: u32 = 0;
        let mut total: u64 = 0;
        loop {
            let n = file.read(&mut buf).map_err(|e| StoreError::Io(e.to_string()))?;
            if n == 0 {
                break;
            }
            let chunk = &buf[..n];
            hasher.update(chunk);
            total += n as u64;
            let (ct, nonce) =
                aead_encrypt(&file_key, chunk).map_err(|e| StoreError::Crypto(e.to_string()))?;
            let cid = self.put_raw(&ct)?;
            metas.push(EncryptedChunkMeta {
                cid,
                nonce_hex: hex::encode(nonce),
                size: n,
                index,
            });
            index += 1;
        }
        if metas.is_empty() {
            // Empty file: one zero-length encrypted chunk so the manifest is valid.
            let (ct, nonce) =
                aead_encrypt(&file_key, &[]).map_err(|e| StoreError::Crypto(e.to_string()))?;
            let cid = self.put_raw(&ct)?;
            metas.push(EncryptedChunkMeta {
                cid,
                nonce_hex: hex::encode(nonce),
                size: 0,
                index: 0,
            });
        }
        Ok((metas, hex::encode(hasher.finalize()), total))
    }

    /// Decrypt all chunks of a file to `dest` without holding the full plaintext in memory.
    pub fn materialize_file(
        &self,
        root_key: &LibraryRootKey,
        file_id: &str,
        metas: &[EncryptedChunkMeta],
        expected_hash: &str,
        dest: &Path,
    ) -> Result<u64, StoreError> {
        let mut ordered = metas.to_vec();
        ordered.sort_by_key(|m| m.index);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| StoreError::Io(e.to_string()))?;
        }
        let mut out = File::create(dest).map_err(|e| StoreError::Io(e.to_string()))?;
        let mut hasher = Sha256::new();
        let mut total: u64 = 0;
        for meta in &ordered {
            let plain = self.decrypt_chunk(root_key, file_id, meta)?;
            hasher.update(&plain);
            out.write_all(&plain).map_err(|e| StoreError::Io(e.to_string()))?;
            total += plain.len() as u64;
        }
        out.flush().map_err(|e| StoreError::Io(e.to_string()))?;
        let hash = hex::encode(hasher.finalize());
        if hash != expected_hash {
            let _ = fs::remove_file(dest);
            return Err(StoreError::Crypto("plaintext hash mismatch".into()));
        }
        Ok(total)
    }

    pub fn read_file(
        &self,
        root_key: &LibraryRootKey,
        file_id: &str,
        metas: &[EncryptedChunkMeta],
        expected_hash: &str,
    ) -> Result<Vec<u8>, StoreError> {
        let file_key = root_key.derive_file_key(file_id);
        let mut ordered = metas.to_vec();
        ordered.sort_by_key(|m| m.index);
        let mut out = Vec::new();
        for meta in &ordered {
            let ct = self.get_raw(&meta.cid)?;
            let nonce = hex::decode(&meta.nonce_hex).map_err(|e| StoreError::Crypto(e.to_string()))?;
            let plain = aead_decrypt(&file_key, &nonce, &ct)
                .map_err(|e| StoreError::Crypto(e.to_string()))?;
            out.extend_from_slice(&plain);
        }
        let hash = compute_sha256(&out);
        if hash != expected_hash {
            return Err(StoreError::Crypto("plaintext hash mismatch".into()));
        }
        Ok(out)
    }

    /// Decrypt a single chunk for streaming.
    pub fn decrypt_chunk(
        &self,
        root_key: &LibraryRootKey,
        file_id: &str,
        meta: &EncryptedChunkMeta,
    ) -> Result<Vec<u8>, StoreError> {
        let file_key = root_key.derive_file_key(file_id);
        let ct = self.get_raw(&meta.cid)?;
        let nonce = hex::decode(&meta.nonce_hex).map_err(|e| StoreError::Crypto(e.to_string()))?;
        aead_decrypt(&file_key, &nonce, &ct).map_err(|e| StoreError::Crypto(e.to_string()))
    }
}

pub fn library_dir(app_data: &Path, library_id: &str) -> PathBuf {
    app_data.join("libraries").join(library_id)
}
