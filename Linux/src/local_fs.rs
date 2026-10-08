//! Browse the local filesystem and map entries into [`crate::domain::FileItem`].

use crate::domain::{CloudProviderId, EncryptionInfo, FileCategory, FileItem, FolderItem};
use crate::crypto::compute_sha256;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, thiserror::Error)]
pub enum LocalFsError {
    #[error("{0}")]
    Io(String),
}

pub fn home_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
}

pub fn list_directory(path: &Path) -> Result<(Vec<FolderItem>, Vec<FileItem>), LocalFsError> {
    let mut folders = Vec::new();
    let mut files = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| LocalFsError::Io(e.to_string()))?;

    for entry in entries.flatten() {
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let path_str = entry.path().to_string_lossy().into_owned();
        if meta.is_dir() {
            folders.push(FolderItem {
                id: format!("local-dir-{}", &compute_sha256(path_str.as_bytes())[..16]),
                name,
                account_id: CloudProviderId::All,
                parent_id: None,
                item_count: 0,
            });
        } else if meta.is_file() {
            let mime = mime_guess::from_path(&entry.path())
                .first_or_octet_stream()
                .essence_str()
                .to_string();
            files.push(FileItem {
                id: format!(
                    "local-{}",
                    &compute_sha256(path_str.as_bytes())[..16]
                ),
                name,
                folder_id: None,
                folder_path: path_str.clone(),
                account_id: CloudProviderId::All,
                size_bytes: meta.len(),
                category: category_from_mime(&mime),
                mime_type: mime,
                updated_at: meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| {
                        chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                            .map(|dt| dt.to_rfc3339())
                            .unwrap_or_default()
                    })
                    .unwrap_or_default(),
                starred: false,
                tags: vec!["local".into()],
                encryption: EncryptionInfo::default(),
                version: 1,
            });
        }
    }

    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok((folders, files))
}

/// Shallow scan of a tree (max depth 2) for Favorites / Local Files.
pub fn scan_tree(root: &Path, max_depth: usize) -> Result<Vec<FileItem>, LocalFsError> {
    let mut files = Vec::new();
    for entry in WalkDir::new(root)
        .max_depth(max_depth)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        if name.starts_with('.') {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let path_str = entry.path().to_string_lossy().into_owned();
        let mime = mime_guess::from_path(entry.path())
            .first_or_octet_stream()
            .essence_str()
            .to_string();
        files.push(FileItem {
            id: format!("local-{}", &compute_sha256(path_str.as_bytes())[..16]),
            name: name.into_owned(),
            folder_id: None,
            folder_path: path_str,
            account_id: CloudProviderId::All,
            size_bytes: meta.len(),
            category: category_from_mime(&mime),
            mime_type: mime,
            updated_at: String::new(),
            starred: false,
            tags: vec!["local".into()],
            encryption: EncryptionInfo::default(),
            version: 1,
        });
        if files.len() >= 200 {
            break;
        }
    }
    Ok(files)
}

pub fn category_from_mime(mime: &str) -> FileCategory {
    if mime.starts_with("image/") {
        FileCategory::Photo
    } else if mime.starts_with("video/") {
        FileCategory::Video
    } else if mime.starts_with("audio/") {
        FileCategory::Audio
    } else if mime.contains("zip") || mime.contains("tar") || mime.contains("gzip") {
        FileCategory::Archive
    } else if mime.starts_with("text/")
        || mime.contains("pdf")
        || mime.contains("document")
        || mime.contains("word")
    {
        FileCategory::Document
    } else {
        FileCategory::Files
    }
}

pub fn read_file_bytes(path: &Path) -> Result<Vec<u8>, LocalFsError> {
    fs::read(path).map_err(|e| LocalFsError::Io(e.to_string()))
}
