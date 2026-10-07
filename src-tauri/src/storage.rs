use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CloudProvider {
    GoogleDrive,
    Dropbox,
    AwsS3,
    CloudflareR2,
    EncryptedVault,
    LocalFiles,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudAccount {
    pub id: String,
    pub name: String,
    pub provider: CloudProvider,
    pub email: String,
    pub used_bytes: u64,
    pub total_bytes: u64,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudFile {
    pub id: String,
    pub name: String,
    pub account_id: String,
    pub folder_path: String,
    pub size_bytes: u64,
    pub mime_type: String,
    pub sha256_checksum: String,
    pub is_encrypted: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageStats {
    pub total_used: u64,
    pub total_quota: u64,
    pub active_nodes: usize,
}

pub struct StorageManager {
    pub accounts: Vec<CloudAccount>,
}

impl StorageManager {
    pub fn new() -> Self {
        Self {
            accounts: vec![
                CloudAccount {
                    id: "gdrive".into(),
                    name: "Google Drive".into(),
                    provider: CloudProvider::GoogleDrive,
                    email: "stevenazevedodesign@gmail.com".into(),
                    used_bytes: 84 * 1024 * 1024 * 1024,
                    total_bytes: 100 * 1024 * 1024 * 1024,
                    connected: true,
                },
                CloudAccount {
                    id: "s3".into(),
                    name: "AWS S3 Master Archives".into(),
                    provider: CloudProvider::AwsS3,
                    email: "s3-us-west-2@vault-primary".into(),
                    used_bytes: 380 * 1024 * 1024 * 1024,
                    total_bytes: 2 * 1024 * 1024 * 1024 * 1024,
                    connected: true,
                },
                CloudAccount {
                    id: "dropbox".into(),
                    name: "Dropbox".into(),
                    provider: CloudProvider::Dropbox,
                    email: "steven@agencyvivid.com".into(),
                    used_bytes: 142 * 1024 * 1024 * 1024,
                    total_bytes: 250 * 1024 * 1024 * 1024,
                    connected: true,
                },
            ],
        }
    }

    pub fn get_stats(&self) -> StorageStats {
        let total_used = self.accounts.iter().map(|a| a.used_bytes).sum();
        let total_quota = self.accounts.iter().map(|a| a.total_bytes).sum();
        StorageStats {
            total_used,
            total_quota,
            active_nodes: self.accounts.len(),
        }
    }
}
