//! Persisted library records (metadata + wrapped root key for local unlock).

use crate::p2p::keys::WrappedLibraryKey;
use crate::p2p::manifest::EncryptedManifestBlob;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum LibraryStoreError {
    #[error("{0}")]
    Io(String),
    #[error("library not found")]
    NotFound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRecord {
    pub library_id: String,
    pub name: String,
    pub description: String,
    pub direction: String, // "outgoing" | "incoming"
    pub role: String,
    pub owner_peer_id: String,
    pub owner_name: String,
    pub root_cid: String,
    pub epoch: u64,
    pub e2ee_protected: bool,
    pub is_seeding: bool,
    pub created_at: String,
    pub file_ids: Vec<String>,
    pub member_count: u32,
    /// Local copy of wrapped root key (passphrase or self-wrapped for owner).
    pub local_wrapped_key: WrappedLibraryKey,
    pub manifest_blob: EncryptedManifestBlob,
    pub last_invite: Option<String>,
    pub seeding_status: Option<String>,
    pub bandwidth_cap: Option<String>,
    /// Always true: invite-dial only; no DHT / STUN / peer announce.
    #[serde(default = "default_true")]
    pub private_mode: bool,
    /// Invite expiry as RFC3339; None = never.
    #[serde(default)]
    pub expires_at: Option<String>,
    /// Recipients may download originals (vs stream-only).
    #[serde(default = "default_true")]
    pub allow_downloads: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibraryIndex {
    pub libraries: Vec<LibraryRecord>,
}

impl LibraryIndex {
    pub fn path(app_data: &Path) -> PathBuf {
        app_data.join("p2p_libraries.json")
    }

    pub fn load(app_data: &Path) -> Result<Self, LibraryStoreError> {
        let path = Self::path(app_data);
        match fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str(&text).map_err(|e| LibraryStoreError::Io(e.to_string())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(LibraryStoreError::Io(e.to_string())),
        }
    }

    pub fn save(&self, app_data: &Path) -> Result<(), LibraryStoreError> {
        fs::create_dir_all(app_data).map_err(|e| LibraryStoreError::Io(e.to_string()))?;
        let path = Self::path(app_data);
        let tmp = path.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(self).map_err(|e| LibraryStoreError::Io(e.to_string()))?;
        fs::write(&tmp, json).map_err(|e| LibraryStoreError::Io(e.to_string()))?;
        fs::rename(&tmp, &path).map_err(|e| LibraryStoreError::Io(e.to_string()))?;
        Ok(())
    }

    pub fn upsert(&mut self, record: LibraryRecord) {
        if let Some(existing) = self.libraries.iter_mut().find(|l| l.library_id == record.library_id) {
            *existing = record;
        } else {
            self.libraries.push(record);
        }
    }

    pub fn get(&self, library_id: &str) -> Option<&LibraryRecord> {
        self.libraries.iter().find(|l| l.library_id == library_id)
    }

    pub fn get_mut(&mut self, library_id: &str) -> Option<&mut LibraryRecord> {
        self.libraries.iter_mut().find(|l| l.library_id == library_id)
    }
}
