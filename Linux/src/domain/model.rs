//! Core data model — mirrors `src/types/index.ts`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CloudProviderId {
    All,
    Gdrive,
    Dropbox,
    S3,
    CloudflareR2,
    Onedrive,
    Mega,
    Nextcloud,
    Vault,
}

impl CloudProviderId {
    pub fn label(self) -> &'static str {
        match self {
            Self::All => "All Files",
            Self::Gdrive => "Google Drive",
            Self::Dropbox => "Dropbox",
            Self::S3 => "AWS S3",
            Self::CloudflareR2 => "Cloudflare R2",
            Self::Onedrive => "OneDrive",
            Self::Mega => "MEGA",
            Self::Nextcloud => "Nextcloud",
            Self::Vault => "Encrypted Vault",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileCategory {
    All,
    Files,
    Photo,
    Video,
    Document,
    Audio,
    Archive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptionInfo {
    pub is_encrypted: bool,
    pub algorithm: String,
    pub key_fingerprint: String,
    pub checksum_sha256: String,
    pub zero_knowledge_verified: bool,
}

impl Default for EncryptionInfo {
    fn default() -> Self {
        Self {
            is_encrypted: false,
            algorithm: String::new(),
            key_fingerprint: String::new(),
            checksum_sha256: String::new(),
            zero_knowledge_verified: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileItem {
    pub id: String,
    pub name: String,
    pub folder_id: Option<String>,
    pub folder_path: String,
    pub account_id: CloudProviderId,
    pub size_bytes: u64,
    pub category: FileCategory,
    pub mime_type: String,
    pub updated_at: String,
    pub starred: bool,
    pub tags: Vec<String>,
    pub encryption: EncryptionInfo,
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderItem {
    pub id: String,
    pub name: String,
    pub account_id: CloudProviderId,
    pub parent_id: Option<String>,
    pub item_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudAccount {
    pub id: CloudProviderId,
    pub name: String,
    pub email: String,
    pub used_bytes: u64,
    pub total_bytes: u64,
    pub status: AccountStatus,
    pub is_vault: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountStatus {
    Connected,
    Syncing,
    Offline,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedLibrary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub owner_name: String,
    pub member_count: u32,
    pub e2ee_protected: bool,
    pub direction: LibraryDirection,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LibraryDirection {
    Incoming,
    Outgoing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ViewMode {
    Icons,
    List,
    Columns,
    Gallery,
}

impl ViewMode {
    pub fn label(self) -> &'static str {
        match self {
            Self::Icons => "Icons",
            Self::List => "List",
            Self::Columns => "Columns",
            Self::Gallery => "Gallery",
        }
    }

    pub fn all() -> [ViewMode; 4] {
        [Self::Icons, Self::List, Self::Columns, Self::Gallery]
    }
}

/// Sidebar navigation destinations (COSMIC nav bar).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NavDestination {
    AllFiles,
    Starred,
    Vault,
    LocalFiles,
    CloudAccounts,
    OutgoingLibraries,
    IncomingLibraries,
    Settings,
}
