//! Full Disk Access (System Settings → Privacy & Security).
//!
//! macOS does not show a permission alert for Full Disk Access. The app must
//! open System Settings and the user toggles Cloudbreak Files on. We detect
//! grant status by probing a path that requires FDA.

#[cfg(target_os = "macos")]
use std::fs::OpenOptions;
#[cfg(target_os = "macos")]
use std::io::ErrorKind;
#[cfg(target_os = "macos")]
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::Command;

/// True when the process can read a path that requires Full Disk Access.
#[cfg(target_os = "macos")]
pub fn has_full_disk_access() -> bool {
    for path in probe_paths() {
        match OpenOptions::new().read(true).open(&path) {
            Ok(_) => return true,
            Err(e) if e.kind() == ErrorKind::PermissionDenied => return false,
            Err(_) => continue,
        }
    }
    // No definitive probe file — try listing a protected directory.
    let home = std::env::var_os("HOME").map(PathBuf::from);
    if let Some(home) = home {
        let mail = home.join("Library/Mail");
        if mail.is_dir() {
            return std::fs::read_dir(&mail).is_ok();
        }
    }
    false
}

#[cfg(not(target_os = "macos"))]
pub fn has_full_disk_access() -> bool {
    true
}

#[cfg(target_os = "macos")]
fn probe_paths() -> Vec<PathBuf> {
    let mut paths = vec![PathBuf::from("/Library/Application Support/com.apple.TCC/TCC.db")];
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        paths.push(home.join("Library/Safari/CloudTabs.db"));
        paths.push(home.join("Library/Safari/Bookmarks.plist"));
        paths.push(home.join("Library/Application Support/com.apple.TCC/TCC.db"));
    }
    paths
}

/// Open System Settings to the Full Disk Access list.
#[cfg(target_os = "macos")]
pub fn open_settings() -> Result<(), String> {
    // Ventura+ deep link, then legacy Preference Pane URL as fallback.
    let urls = [
        "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles",
        "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
    ];
    for url in urls {
        let status = Command::new("open")
            .arg(url)
            .status()
            .map_err(|e| format!("Could not open System Settings: {e}"))?;
        if status.success() {
            return Ok(());
        }
    }
    Err("Could not open Full Disk Access in System Settings".into())
}

/// Touch Local Files locations so macOS can show Files and Folders prompts:
/// Desktop, Documents, Downloads, Movies, Photos (Pictures), Applications.
#[cfg(target_os = "macos")]
pub fn nudge_files_and_folders_prompts() {
    let mut paths: Vec<PathBuf> = Vec::new();
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        for relative in [
            "Desktop",
            "Documents",
            "Downloads",
            "Movies",
            "Music",
            "Pictures", // Photos in the sidebar
        ] {
            paths.push(home.join(relative));
        }
    }
    paths.push(PathBuf::from("/Applications"));

    for path in paths {
        touch_folder_for_tcc(&path);
    }
}

/// Enumerate a folder so TCC can present the Files and Folders alert for it.
#[cfg(target_os = "macos")]
fn touch_folder_for_tcc(path: &Path) {
    let Ok(entries) = std::fs::read_dir(path) else {
        return;
    };
    // Consume a few entries — some macOS versions only prompt after a real read.
    for entry in entries.take(8) {
        if let Ok(entry) = entry {
            let _ = entry.metadata();
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn nudge_files_and_folders_prompts() {}

#[tauri::command]
pub fn macos_full_disk_access_status() -> bool {
    has_full_disk_access()
}

#[tauri::command]
pub fn macos_request_full_disk_access() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        nudge_files_and_folders_prompts();
        if has_full_disk_access() {
            return Ok(true);
        }
        open_settings()?;
        Ok(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true)
    }
}
