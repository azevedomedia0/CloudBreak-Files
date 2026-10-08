//! Sample library data for the scaffold UI (mirrors web sample data shape).

use super::model::*;

pub struct SampleLibrary {
    pub accounts: Vec<CloudAccount>,
    pub folders: Vec<FolderItem>,
    pub files: Vec<FileItem>,
    pub libraries: Vec<SharedLibrary>,
}

impl SampleLibrary {
    pub fn new() -> Self {
        let accounts = vec![
            CloudAccount {
                id: CloudProviderId::Gdrive,
                name: "Google Drive".into(),
                email: "you@example.com".into(),
                used_bytes: 12_884_901_888,
                total_bytes: 34_359_738_368,
                status: AccountStatus::Connected,
                is_vault: false,
            },
            CloudAccount {
                id: CloudProviderId::Vault,
                name: "Private Vault".into(),
                email: "local".into(),
                used_bytes: 2_147_483_648,
                total_bytes: 10_737_418_240,
                status: AccountStatus::Connected,
                is_vault: true,
            },
        ];

        let folders = vec![
            FolderItem {
                id: "folder-photos".into(),
                name: "Photos".into(),
                account_id: CloudProviderId::Gdrive,
                parent_id: None,
                item_count: 3,
            },
            FolderItem {
                id: "folder-docs".into(),
                name: "Documents".into(),
                account_id: CloudProviderId::Gdrive,
                parent_id: None,
                item_count: 2,
            },
        ];

        let files = vec![
            FileItem {
                id: "file-1".into(),
                name: "Coastal Sunrise.jpg".into(),
                folder_id: Some("folder-photos".into()),
                folder_path: "/Photos".into(),
                account_id: CloudProviderId::Gdrive,
                size_bytes: 4_194_304,
                category: FileCategory::Photo,
                mime_type: "image/jpeg".into(),
                updated_at: "2026-03-12T10:00:00Z".into(),
                starred: true,
                tags: vec!["travel".into()],
                encryption: EncryptionInfo::default(),
                version: 1,
            },
            FileItem {
                id: "file-2".into(),
                name: "Project Brief.pdf".into(),
                folder_id: Some("folder-docs".into()),
                folder_path: "/Documents".into(),
                account_id: CloudProviderId::Gdrive,
                size_bytes: 524_288,
                category: FileCategory::Document,
                mime_type: "application/pdf".into(),
                updated_at: "2026-03-10T14:30:00Z".into(),
                starred: false,
                tags: vec![],
                encryption: EncryptionInfo::default(),
                version: 2,
            },
            FileItem {
                id: "file-3".into(),
                name: "Vault Notes.md".into(),
                folder_id: None,
                folder_path: "/Vault".into(),
                account_id: CloudProviderId::Vault,
                size_bytes: 8_192,
                category: FileCategory::Document,
                mime_type: "text/markdown".into(),
                updated_at: "2026-03-14T09:15:00Z".into(),
                starred: true,
                tags: vec!["private".into()],
                encryption: EncryptionInfo {
                    is_encrypted: true,
                    algorithm: "AES-256-GCM".into(),
                    key_fingerprint: "a1:b2:c3:d4".into(),
                    checksum_sha256: String::new(),
                    zero_knowledge_verified: true,
                },
                version: 1,
            },
            FileItem {
                id: "file-4".into(),
                name: "Demo Reel.mp4".into(),
                folder_id: Some("folder-photos".into()),
                folder_path: "/Photos".into(),
                account_id: CloudProviderId::Gdrive,
                size_bytes: 104_857_600,
                category: FileCategory::Video,
                mime_type: "video/mp4".into(),
                updated_at: "2026-02-28T18:00:00Z".into(),
                starred: false,
                tags: vec!["video".into()],
                encryption: EncryptionInfo::default(),
                version: 1,
            },
        ];

        let libraries = vec![
            SharedLibrary {
                id: "lib-out-1".into(),
                name: "Studio Seed".into(),
                description: "Outgoing encrypted library".into(),
                owner_name: "User".into(),
                member_count: 2,
                e2ee_protected: true,
                direction: LibraryDirection::Outgoing,
            },
            SharedLibrary {
                id: "lib-in-1".into(),
                name: "Client Drop".into(),
                description: "Incoming private invite".into(),
                owner_name: "Peer".into(),
                member_count: 1,
                e2ee_protected: true,
                direction: LibraryDirection::Incoming,
            },
        ];

        Self {
            accounts,
            folders,
            files,
            libraries,
        }
    }
}

impl Default for SampleLibrary {
    fn default() -> Self {
        Self::new()
    }
}

pub fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} {}", UNITS[unit])
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}
