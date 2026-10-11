//! Local file access for the desktop app.
//!
//! The user picks a folder with the native dialog. Every scan, read, write and rename is checked
//! against the folders picked so far, so the web view can never reach files outside them.
//! Symlinks are never followed while scanning, and a path is resolved before it is compared, so
//! `..` segments and links cannot escape a picked folder.

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

pub const ROOTS_FILE: &str = "local_roots.json";
const MAX_DEPTH: usize = 12;
/// `/Applications` is mostly opaque `.app` packages — keep the walk shallow so
/// selecting it in the sidebar does not ingest tens of thousands of nested files.
/// Depth 1 = top-level apps + one subfolder (Utilities/*.app), not deeper trees.
const APPLICATIONS_MAX_DEPTH: usize = 1;
/// Cap on files+folders returned per scan. Package dirs (.app) are opaque so they
/// do not burn this budget walking Contents/.
const MAX_ENTRIES: usize = 25_000;
const APPLICATIONS_MAX_ENTRIES: usize = 4_000;
const MAX_READ_BYTES: u64 = 64 * 1024 * 1024;

fn is_applications_root(root: &Path) -> bool {
    root.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.eq_ignore_ascii_case("Applications"))
        .unwrap_or(false)
}

fn scan_limits_for(root: &Path) -> (usize, usize) {
    if is_applications_root(root) {
        (APPLICATIONS_MAX_DEPTH, APPLICATIONS_MAX_ENTRIES)
    } else {
        (MAX_DEPTH, MAX_ENTRIES)
    }
}

#[derive(Default)]
pub struct LocalRoots {
    roots: Mutex<Vec<PathBuf>>,
    /// Folders allowed for this session only (save destinations). Never written to disk.
    session_only: Mutex<Vec<PathBuf>>,
    /// Individual files from Spotlight “Search This Mac” (session only).
    pub(crate) search_allowed: Mutex<HashSet<PathBuf>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalFolder {
    pub path: String,
    pub name: String,
    /// Extra roots merged into this sidebar folder (e.g. iCloud Documents twin).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub extra_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalEntry {
    pub name: String,
    /// Absolute path.
    pub path: String,
    /// Path relative to the scanned folder, using `/`.
    pub relative_path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalScan {
    pub entries: Vec<LocalEntry>,
    /// True when the folder had more than the scan limit and the rest was skipped.
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileInfo {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub modified_ms: u64,
}

// ---------- pure helpers (unit tested) ----------

fn folder_of(path: &Path) -> LocalFolder {
    LocalFolder {
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string_lossy().into_owned()),
        extra_paths: Vec::new(),
    }
}

/// When Desktop & Documents were unlinked from iCloud, Finder still keeps a twin under CloudDocs.
fn icloud_drive_twin(home: &Path, relative: &str) -> Option<PathBuf> {
    let twin = home
        .join("Library/Mobile Documents/com~apple~CloudDocs")
        .join(relative);
    if !twin.is_dir() {
        return None;
    }
    let primary = home.join(relative);
    match (fs::canonicalize(&primary), fs::canonicalize(&twin)) {
        (Ok(a), Ok(b)) if a != b => Some(twin),
        (Err(_), Ok(_)) => Some(twin),
        _ => None,
    }
}

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn info_for(path: &Path) -> Result<LocalFileInfo, String> {
    let meta = fs::metadata(path).map_err(|e| format!("Could not read file details: {e}"))?;
    Ok(LocalFileInfo {
        path: path.to_string_lossy().into_owned(),
        name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        size_bytes: meta.len(),
        modified_ms: modified_ms(&meta),
    })
}

/// Resolve `path` and require it to sit inside one of `roots`. The file may not exist yet (a save),
/// in which case its parent folder is resolved instead.
pub fn resolve_in_roots(roots: &[PathBuf], path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("Local paths must be absolute".into());
    }
    let resolved = match fs::canonicalize(path) {
        Ok(p) => p,
        Err(_) => {
            let parent = path.parent().ok_or("That path has no parent folder")?;
            let name = path.file_name().ok_or("That path has no file name")?;
            if name == ".." || name == "." {
                return Err("Invalid file name".into());
            }
            fs::canonicalize(parent)
                .map_err(|_| "The folder does not exist".to_string())?
                .join(name)
        }
    };
    let allowed = roots
        .iter()
        .filter_map(|r| fs::canonicalize(r).ok())
        .any(|root| resolved.starts_with(&root));
    if allowed {
        Ok(resolved)
    } else {
        Err("Cloudbreak only has access to folders you have added. Add this folder first.".into())
    }
}

/// Resolve a path under Local Folders / session roots, or a Spotlight search hit.
pub fn resolve_accessible(state: &LocalRoots, path: &Path) -> Result<PathBuf, String> {
    match resolve_in_roots(&snapshot(state), path) {
        Ok(resolved) => Ok(resolved),
        Err(root_err) => {
            let resolved = fs::canonicalize(path).map_err(|_| root_err.clone())?;
            let allowed = state
                .search_allowed
                .lock()
                .map(|g| g.contains(&resolved))
                .unwrap_or(false);
            if allowed {
                Ok(resolved)
            } else {
                Err(root_err)
            }
        }
    }
}

/// Resolve a `.app` (or symlink to one) listed under an added folder.
///
/// Finder puts stubs in `/Applications` that symlink into `/System/Applications`.
/// Full canonicalize would leave the allowed root, so we only require the parent
/// folder to sit inside a root and return the path as listed (for `open` / QL).
pub fn resolve_app_bundle(state: &LocalRoots, path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("Local paths must be absolute".into());
    }
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "That path has no file name".to_string())?;
    if !name.to_ascii_lowercase().ends_with(".app") {
        return Err("That path is not an application".into());
    }
    if name.contains("..") {
        return Err("Invalid file name".into());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "That path has no parent folder".to_string())?;
    let parent_canon = fs::canonicalize(parent)
        .map_err(|_| "The folder does not exist".to_string())?;
    let candidate = parent_canon.join(name);
    let roots = snapshot(state);
    let under_root = roots.iter().filter_map(|r| fs::canonicalize(r).ok()).any(|root| {
        parent_canon.starts_with(&root) || candidate.starts_with(&root)
    });
    if !under_root {
        // Spotlight may have allow-listed the resolved target.
        if let Ok(resolved) = fs::canonicalize(&candidate) {
            let allowed = state
                .search_allowed
                .lock()
                .map(|g| g.contains(&resolved))
                .unwrap_or(false);
            if allowed {
                return Ok(resolved);
            }
        }
        return Err(
            "Cloudbreak only has access to folders you have added. Add this folder first.".into(),
        );
    }
    // Accept real dirs and Application stubs (symlinks).
    let meta = fs::symlink_metadata(&candidate)
        .map_err(|e| format!("Could not open that application: {e}"))?;
    if !(meta.is_dir() || meta.file_type().is_symlink()) {
        return Err("That path is not an application".into());
    }
    Ok(candidate)
}

fn valid_file_name(name: &str) -> Result<&str, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." || trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
        return Err("That file name is not allowed".into());
    }
    Ok(trimmed)
}

pub fn scan_dir(root: &Path) -> Result<LocalScan, String> {
    let (max_depth, max_entries) = scan_limits_for(root);
    scan_dir_limited(root, max_entries, max_depth)
}

fn scan_dir_limited(root: &Path, max_entries: usize, max_depth: usize) -> Result<LocalScan, String> {
    let mut entries = Vec::new();
    let mut truncated = false;
    walk(root, root, 0, &mut entries, &mut truncated, max_entries, max_depth)?;
    Ok(LocalScan { entries, truncated })
}

/// macOS/iOS bundles and other package directories — list as one folder, do not recurse.
fn is_opaque_package_dir(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".app")
        || lower.ends_with(".bundle")
        || lower.ends_with(".framework")
        || lower.ends_with(".plugin")
        || lower.ends_with(".kext")
        || lower.ends_with(".scptd")
        || lower.ends_with(".xcodeproj")
        || lower.ends_with(".xcworkspace")
        || lower.ends_with(".playground")
        // Apple TV / Music library database packages (media lives beside them).
        || lower.ends_with(".tvlibrary")
        || lower.ends_with(".musiclibrary")
}

/// Apple Photos library packages — list the bundle, then only walk `originals/` for media.
fn is_photos_library_dir(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".photoslibrary") || lower.ends_with(".photolibrary")
}

fn should_skip_dir_name(name: &str) -> bool {
    matches!(
        name,
        "node_modules" | "Pods" | "DerivedData" | "Carthage" | "__pycache__" | "venv" | ".venv"
    )
}

fn walk(
    root: &Path,
    dir: &Path,
    depth: usize,
    out: &mut Vec<LocalEntry>,
    truncated: &mut bool,
    max_entries: usize,
    max_depth: usize,
) -> Result<(), String> {
    if depth > max_depth {
        // Mark truncated but keep scanning siblings of the deep folder.
        *truncated = true;
        return Ok(());
    }
    let read = fs::read_dir(dir).map_err(|e| format!("Could not open {}: {e}", dir.display()))?;
    let mut children: Vec<_> = read.filter_map(Result::ok).collect();
    children.sort_by_key(|e| e.file_name());

    // List every sibling at this level before recursing. Otherwise a huge early
    // subfolder (common in Downloads) burns MAX_ENTRIES and hides later files.
    let mut recurse: Vec<PathBuf> = Vec::new();
    let mut photos_libraries: Vec<PathBuf> = Vec::new();
    for child in children {
        let name = child.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        // `symlink_metadata` does not follow links. Symlinks are listed (e.g. Safari.app
        // in /Applications) but never recursed into, so they cannot escape the root.
        let Ok(meta) = fs::symlink_metadata(child.path()) else { continue };
        if out.len() >= max_entries {
            *truncated = true;
            return Ok(());
        }
        let path = child.path();
        let relative = path
            .strip_prefix(root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| name.clone());
        let is_symlink = meta.file_type().is_symlink();
        let is_dir = if is_symlink {
            let lower = name.to_ascii_lowercase();
            lower.ends_with(".app")
                || lower.ends_with(".bundle")
                || is_photos_library_dir(&name)
                || is_opaque_package_dir(&name)
                || fs::metadata(&path).map(|m| m.is_dir()).unwrap_or(false)
        } else {
            meta.is_dir()
        };
        out.push(LocalEntry {
            name: name.clone(),
            path: path.to_string_lossy().into_owned(),
            relative_path: relative,
            is_dir,
            size_bytes: if is_dir || is_symlink { 0 } else { meta.len() },
            modified_ms: modified_ms(&meta),
        });
        if is_symlink {
            continue;
        }
        if is_dir && is_photos_library_dir(&name) {
            photos_libraries.push(path);
        } else if is_dir && !is_opaque_package_dir(&name) && !should_skip_dir_name(&name) {
            recurse.push(path);
        }
    }

    for path in recurse {
        if out.len() >= max_entries {
            *truncated = true;
            return Ok(());
        }
        walk(root, &path, depth + 1, out, truncated, max_entries, max_depth)?;
        if *truncated && out.len() >= max_entries {
            return Ok(());
        }
    }

    // Photos libraries: only walk originals/ (skip database/, resources/, etc.).
    for library in photos_libraries {
        if out.len() >= max_entries {
            *truncated = true;
            return Ok(());
        }
        let originals = library.join("originals");
        let Ok(meta) = fs::symlink_metadata(&originals) else { continue };
        if !meta.is_dir() {
            continue;
        }
        let relative = originals
            .strip_prefix(root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| "originals".into());
        out.push(LocalEntry {
            name: "originals".into(),
            path: originals.to_string_lossy().into_owned(),
            relative_path: relative,
            is_dir: true,
            size_bytes: 0,
            modified_ms: modified_ms(&meta),
        });
        // Permission denied (TCC) while walking is fine — keep the library folder entry.
        let _ = walk(root, &originals, depth + 1, out, truncated, max_entries, max_depth);
        if *truncated && out.len() >= max_entries {
            return Ok(());
        }
    }
    Ok(())
}

/// Writes next to the target and renames, so a crash cannot leave a half-written file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = path.parent().ok_or("That path has no parent folder")?;
    let name = path.file_name().ok_or("That path has no file name")?.to_string_lossy().into_owned();
    let tmp = dir.join(format!(".{name}.cloudbreak-tmp"));
    let run = || -> std::io::Result<()> {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        if let Ok(meta) = fs::metadata(path) {
            let _ = fs::set_permissions(&tmp, meta.permissions());
        }
        fs::rename(&tmp, path)
    };
    run().map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Could not save {name}: {e}")
    })
}

fn rename_in_place(path: &Path, new_name: &str) -> Result<PathBuf, String> {
    let new_name = valid_file_name(new_name)?;
    let dir = path.parent().ok_or("That path has no parent folder")?;
    let target = dir.join(new_name);
    if target == path {
        return Ok(target);
    }
    if target.exists() {
        return Err(format!("A file named \"{new_name}\" already exists in that folder"));
    }
    fs::rename(path, &target).map_err(|e| format!("Could not rename the file: {e}"))?;
    Ok(target)
}

/// `name`, or `name 2`, `name 3`, ... if a file with that name is already in `dir`.
pub fn unique_destination(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(dot) if dot > 0 => (&name[..dot], &name[dot..]),
        _ => (name, ""),
    };
    let mut n = 2;
    loop {
        let candidate = dir.join(format!("{stem} {n}{ext}"));
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

/// Copy `src` to `dest` through a temp file in the destination folder, so a failed copy leaves no partial file.
pub fn copy_atomic(src: &Path, dest: &Path) -> Result<(), String> {
    let dir = dest.parent().ok_or("That path has no parent folder")?;
    let name = dest.file_name().ok_or("That path has no file name")?.to_string_lossy().into_owned();
    let tmp = dir.join(format!(".{name}.cloudbreak-tmp"));
    fs::copy(src, &tmp)
        .and_then(|_| fs::rename(&tmp, dest))
        .map_err(|e| {
            let _ = fs::remove_file(&tmp);
            format!("Could not save {name}: {e}")
        })
}

fn load_roots(file: &Path) -> Vec<PathBuf> {
    fs::read_to_string(file)
        .ok()
        .and_then(|t| serde_json::from_str::<Vec<String>>(&t).ok())
        .map(|v| v.into_iter().map(PathBuf::from).filter(|p| p.is_dir()).collect())
        .unwrap_or_default()
}

fn save_roots(file: &Path, roots: &[PathBuf]) -> Result<(), String> {
    let list: Vec<String> = roots.iter().map(|p| p.to_string_lossy().into_owned()).collect();
    let json = serde_json::to_vec_pretty(&list).map_err(|e| e.to_string())?;
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Could not create the app data folder: {e}"))?;
    }
    write_atomic(file, &json)
}

// ---------- state and commands ----------

fn roots_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not find the app data folder: {e}"))?
        .join(ROOTS_FILE))
}

/// Every folder the web view may use right now: remembered folders plus session-only save destinations.
pub fn snapshot(state: &LocalRoots) -> Vec<PathBuf> {
    let mut all = state.roots.lock().map(|r| r.clone()).unwrap_or_default();
    if let Ok(extra) = state.session_only.lock() {
        all.extend(extra.iter().cloned());
    }
    all
}

/// Called at startup: load the folders picked in earlier sessions and let the web view load their media.
pub fn restore_roots(app: &AppHandle, state: &LocalRoots) {
    let Ok(file) = roots_file(app) else { return };
    let roots = load_roots(&file);
    for root in &roots {
        let _ = app.asset_protocol_scope().allow_directory(root, true);
    }
    if let Ok(mut guard) = state.roots.lock() {
        *guard = roots;
    }
}

/// Allow a folder. `remember` keeps it for later launches; otherwise it is only allowed until the app quits.
/// When `persist` is false, remembered roots are kept in memory only — caller must `save_roots` once.
fn add_root(
    app: &AppHandle,
    state: &LocalRoots,
    root: PathBuf,
    remember: bool,
) -> Result<LocalFolder, String> {
    add_root_ex(app, state, root, remember, true).map(|(folder, _)| folder)
}

fn add_root_ex(
    app: &AppHandle,
    state: &LocalRoots,
    root: PathBuf,
    remember: bool,
    persist: bool,
) -> Result<(LocalFolder, bool), String> {
    let root = fs::canonicalize(&root).map_err(|e| format!("Could not open that folder: {e}"))?;
    if !root.is_dir() {
        return Err("That is not a folder".into());
    }
    let mut changed = false;
    if remember {
        app.asset_protocol_scope()
            .allow_directory(&root, true)
            .map_err(|e| format!("Could not allow that folder: {e}"))?;
        let mut guard = state.roots.lock().map_err(|_| "Local folder list is unavailable".to_string())?;
        if !guard.contains(&root) {
            guard.push(root.clone());
            changed = true;
        }
        if persist && changed {
            save_roots(&roots_file(app)?, &guard)?;
        }
    } else if let Ok(mut guard) = state.session_only.lock() {
        if !guard.contains(&root) {
            guard.push(root.clone());
            changed = true;
        }
    }
    Ok((folder_of(&root), changed))
}

/// For the debug-only self-test: allow a folder exactly as picking it in the dialog would.
#[cfg(debug_assertions)]
pub fn allow_folder_for_selftest(app: &AppHandle, state: &LocalRoots, path: PathBuf) -> Result<(), String> {
    add_root(app, state, path, true).map(|_| ())
}

/// Show the macOS folder picker and remember the choice. Returns `None` if the user cancels.
#[tauri::command]
pub async fn local_pick_folder(app: AppHandle, state: State<'_, LocalRoots>) -> Result<Option<LocalFolder>, String> {
    let dialog_app = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .set_title("Choose a folder to add to Cloudbreak")
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    add_root(&app, &state, path, true).map(Some)
}

/// Folder picker for choosing where to save something. The folder is allowed for this session only.
#[tauri::command]
pub async fn local_pick_save_folder(app: AppHandle, state: State<'_, LocalRoots>) -> Result<Option<LocalFolder>, String> {
    let dialog_app = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .set_title("Choose where to save")
            .blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    add_root(&app, &state, path, false).map(Some)
}

/// Allow a folder path (e.g. a mounted volume) for browsing without using the picker.
#[tauri::command]
pub fn local_remember_folder(path: String, app: AppHandle, state: State<'_, LocalRoots>) -> Result<LocalFolder, String> {
    add_root(&app, &state, PathBuf::from(path), true)
}

/// Folders picked in earlier sessions that still exist.
#[tauri::command]
pub fn local_list_folders(state: State<'_, LocalRoots>) -> Vec<LocalFolder> {
    state.roots.lock().map(|r| r.iter().map(|p| folder_of(p)).collect()).unwrap_or_default()
}

/// Standard macOS locations for the Local Files sidebar (display name, path).
fn standard_folder_candidates() -> Vec<(String, PathBuf)> {
    let mut out = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        let home = PathBuf::from(home);
        for (name, relative) in [
            ("Desktop", "Desktop"),
            ("Documents", "Documents"),
            ("Photos", "Pictures"),
            ("Videos", "Movies"),
            ("Music", "Music"),
            ("Downloads", "Downloads"),
        ] {
            out.push((name.to_string(), home.join(relative)));
        }
    }
    out.push(("Applications".to_string(), PathBuf::from("/Applications")));
    out
}

/// Add the standard user folders (Desktop, Documents, …) when they exist on disk.
/// Returns each folder with its sidebar display name. Skips missing paths quietly.
/// Persists `local_roots.json` once at the end when any new root was added.
#[tauri::command]
pub fn local_ensure_standard_folders(app: AppHandle, state: State<'_, LocalRoots>) -> Vec<LocalFolder> {
    // Re-touch protected locations so Files and Folders prompts can appear if still undetermined.
    #[cfg(target_os = "macos")]
    crate::macos_full_disk_access::nudge_files_and_folders_prompts();

    let home = std::env::var("HOME").ok().map(PathBuf::from);
    let mut added = Vec::new();
    let mut dirty = false;
    for (display_name, path) in standard_folder_candidates() {
        if !path.is_dir() {
            continue;
        }
        match add_root_ex(&app, &state, path.clone(), true, false) {
            Ok((folder, changed)) => {
                dirty |= changed;
                let mut extra_paths = Vec::new();
                // Merge the iCloud Drive twin when it is a separate folder.
                if matches!(
                    display_name.as_str(),
                    "Desktop" | "Documents" | "Downloads" | "Photos" | "Videos" | "Music"
                ) {
                    if let Some(home) = home.as_ref() {
                        let relative = path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or(display_name.as_str());
                        if let Some(twin) = icloud_drive_twin(home, relative) {
                            if let Ok((_, twin_changed)) =
                                add_root_ex(&app, &state, twin.clone(), true, false)
                            {
                                dirty |= twin_changed;
                                extra_paths.push(twin.to_string_lossy().into_owned());
                            }
                        }
                    }
                }
                // Finder also shows ~/Applications alongside /Applications.
                if display_name == "Applications" {
                    if let Some(home) = home.as_ref() {
                        let user_apps = home.join("Applications");
                        if user_apps.is_dir() {
                            if let Ok(canon) = fs::canonicalize(&user_apps) {
                                if canon != PathBuf::from(&folder.path) {
                                    if let Ok((_, apps_changed)) =
                                        add_root_ex(&app, &state, user_apps.clone(), true, false)
                                    {
                                        dirty |= apps_changed;
                                        extra_paths.push(canon.to_string_lossy().into_owned());
                                    }
                                }
                            }
                        }
                    }
                }
                added.push(LocalFolder {
                    path: folder.path,
                    name: display_name,
                    extra_paths,
                });
            }
            Err(_) => {
                // Permission denied or unreadable — keep the empty sidebar stub.
            }
        }
    }
    if dirty {
        if let (Ok(file), Ok(guard)) = (roots_file(&app), state.roots.lock()) {
            let _ = save_roots(&file, &guard);
        }
    }
    added
}

/// Stop tracking a folder. The files on disk are not touched.
#[tauri::command]
pub fn local_forget_folder(path: String, app: AppHandle, state: State<'_, LocalRoots>) -> Result<(), String> {
    let target = fs::canonicalize(&path).unwrap_or_else(|_| PathBuf::from(&path));
    let mut guard = state.roots.lock().map_err(|_| "Local folder list is unavailable".to_string())?;
    guard.retain(|r| *r != target);
    save_roots(&roots_file(&app)?, &guard)
}

#[tauri::command]
pub fn local_scan_folder(path: String, state: State<'_, LocalRoots>) -> Result<LocalScan, String> {
    let resolved = resolve_in_roots(&snapshot(&state), Path::new(&path))?;
    if !resolved.is_dir() {
        return Err("That is not a folder".into());
    }
    scan_dir(&resolved)
}

/// Read a file as base64 (up to 64 MB). Large media should be loaded through the asset URL instead.
#[tauri::command]
pub fn local_read_file(path: String, state: State<'_, LocalRoots>) -> Result<String, String> {
    let resolved = resolve_accessible(&state, Path::new(&path))?;
    let meta = fs::metadata(&resolved).map_err(|e| format!("Could not read the file: {e}"))?;
    if !meta.is_file() {
        return Err("That is not a file".into());
    }
    if meta.len() > MAX_READ_BYTES {
        return Err(format!("File is larger than {} MB", MAX_READ_BYTES / (1024 * 1024)));
    }
    let bytes = fs::read(&resolved).map_err(|e| format!("Could not read the file: {e}"))?;
    Ok(B64.encode(bytes))
}

#[tauri::command]
pub fn local_write_file(path: String, content_base64: String, state: State<'_, LocalRoots>) -> Result<LocalFileInfo, String> {
    let resolved = resolve_in_roots(&snapshot(&state), Path::new(&path))?;
    let bytes = B64.decode(content_base64.as_bytes()).map_err(|_| "Invalid file data".to_string())?;
    if bytes.len() as u64 > MAX_READ_BYTES {
        return Err(format!("File is larger than {} MB", MAX_READ_BYTES / (1024 * 1024)));
    }
    write_atomic(&resolved, &bytes)?;
    info_for(&resolved)
}

/// Save `bytes` as a new file in `dir`. A taken name becomes `name 2.ext`; an existing file is never replaced.
fn save_new_in(dir: &Path, name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let dest = unique_destination(dir, valid_file_name(name)?);
    write_atomic(&dest, bytes)?;
    Ok(dest)
}

#[tauri::command]
pub fn local_save_new_file(dir: String, name: String, content_base64: String, state: State<'_, LocalRoots>) -> Result<LocalFileInfo, String> {
    let dir = resolve_in_roots(&snapshot(&state), Path::new(&dir))?;
    if !dir.is_dir() {
        return Err("That is not a folder".into());
    }
    let bytes = B64.decode(content_base64.as_bytes()).map_err(|_| "Invalid file data".to_string())?;
    if bytes.len() as u64 > MAX_READ_BYTES {
        return Err(format!("The archive is larger than {} MB", MAX_READ_BYTES / (1024 * 1024)));
    }
    let dest = save_new_in(&dir, &name, &bytes)?;
    info_for(&dest)
}

#[tauri::command]
pub fn local_write_text(path: String, text: String, state: State<'_, LocalRoots>) -> Result<LocalFileInfo, String> {
    let resolved = resolve_in_roots(&snapshot(&state), Path::new(&path))?;
    write_atomic(&resolved, text.as_bytes())?;
    info_for(&resolved)
}

#[tauri::command]
pub fn local_rename_file(path: String, new_name: String, state: State<'_, LocalRoots>) -> Result<LocalFileInfo, String> {
    let resolved = resolve_in_roots(&snapshot(&state), Path::new(&path))?;
    let renamed = rename_in_place(&resolved, &new_name)?;
    info_for(&renamed)
}

/// Move a file to the Trash. It can be restored from there.
#[tauri::command]
pub fn local_trash_file(path: String, state: State<'_, LocalRoots>) -> Result<(), String> {
    let resolved = resolve_in_roots(&snapshot(&state), Path::new(&path))?;
    let meta = fs::symlink_metadata(&resolved).map_err(|e| format!("Could not find the file: {e}"))?;
    if !meta.is_file() {
        return Err("Only files can be moved to the Trash from here".into());
    }
    move_to_trash(&resolved).map_err(|e| format!("Could not move the file to the Trash: {e}"))
}

/// On macOS this uses the system file manager directly. The default (asking Finder) would need
/// Automation permission and show a prompt.
fn move_to_trash(path: &Path) -> Result<(), trash::Error> {
    let mut ctx = trash::TrashContext::default();
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        ctx.set_delete_method(DeleteMethod::NsFileManager);
    }
    ctx.delete(path)
}

/// Save a finished media file from the app's temp folder. With `folder`, it goes there (renamed if the
/// name is taken). Without it, the macOS save dialog opens. Returns `None` if the user cancels.
#[tauri::command]
pub async fn local_save_from_temp(
    temp_path: String,
    file_name: String,
    folder: Option<String>,
    app: AppHandle,
    state: State<'_, LocalRoots>,
) -> Result<Option<LocalFileInfo>, String> {
    let temp = crate::commands::media_temp_dir(&app)?;
    let src = resolve_in_roots(&[temp], Path::new(&temp_path))
        .map_err(|_| "Media files must be in the app's temporary media folder".to_string())?;
    let name = valid_file_name(&file_name)?.to_string();

    let dest = match folder {
        Some(dir) => {
            let dir = resolve_in_roots(&snapshot(&state), Path::new(&dir))?;
            if !dir.is_dir() {
                return Err("That is not a folder".into());
            }
            unique_destination(&dir, &name)
        }
        None => {
            let dialog_app = app.clone();
            let picked = tauri::async_runtime::spawn_blocking(move || {
                dialog_app.dialog().file().set_file_name(name).blocking_save_file()
            })
            .await
            .map_err(|e| e.to_string())?;
            let Some(picked) = picked else { return Ok(None) };
            picked.into_path().map_err(|e| e.to_string())?
        }
    };
    copy_atomic(&src, &dest)?;
    info_for(&dest).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Tmp(PathBuf);
    impl Tmp {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!("cloudbreak-localfs-{}", uuid::Uuid::new_v4()));
            fs::create_dir_all(&dir).unwrap();
            Tmp(fs::canonicalize(dir).unwrap())
        }
    }
    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn sample_tree(root: &Path) {
        fs::create_dir_all(root.join("sub/deeper")).unwrap();
        fs::write(root.join("a.txt"), "hello").unwrap();
        fs::write(root.join("sub/b.md"), "# b").unwrap();
        fs::write(root.join("sub/deeper/c.png"), [1u8, 2, 3]).unwrap();
        fs::write(root.join(".hidden"), "x").unwrap();
    }

    #[test]
    fn scan_lists_files_and_folders_and_skips_hidden() {
        let t = Tmp::new();
        sample_tree(&t.0);
        let scan = scan_dir(&t.0).unwrap();
        let names: Vec<_> = scan.entries.iter().map(|e| e.relative_path.as_str()).collect();
        assert!(names.contains(&"a.txt"));
        assert!(names.contains(&"sub"));
        assert!(names.contains(&"sub/b.md"));
        assert!(names.contains(&"sub/deeper/c.png"));
        assert!(!names.iter().any(|n| n.contains(".hidden")));
        let a = scan.entries.iter().find(|e| e.name == "a.txt").unwrap();
        assert_eq!(a.size_bytes, 5);
        assert!(!a.is_dir);
        assert!(!scan.truncated);
    }

    #[test]
    fn scan_lists_app_bundle_but_does_not_recurse() {
        let t = Tmp::new();
        let app = t.0.join("Demo.app");
        fs::create_dir_all(app.join("Contents/MacOS")).unwrap();
        fs::write(app.join("Contents/Info.plist"), "plist").unwrap();
        fs::write(t.0.join("readme.txt"), "hi").unwrap();
        let scan = scan_dir(&t.0).unwrap();
        let names: Vec<_> = scan.entries.iter().map(|e| e.relative_path.as_str()).collect();
        assert!(names.contains(&"Demo.app"));
        assert!(names.contains(&"readme.txt"));
        assert!(!names.iter().any(|n| n.contains("Contents")));
        assert!(!scan.truncated);
    }

    #[test]
    fn scan_lists_tvlibrary_but_does_not_recurse() {
        let t = Tmp::new();
        let lib = t.0.join("TV Library.tvlibrary");
        fs::create_dir_all(&lib).unwrap();
        fs::write(lib.join("Library.tvdb"), "db").unwrap();
        fs::write(t.0.join("clip.mp4"), "vid").unwrap();
        let scan = scan_dir(&t.0).unwrap();
        let names: Vec<_> = scan.entries.iter().map(|e| e.relative_path.as_str()).collect();
        assert!(names.contains(&"TV Library.tvlibrary"));
        assert!(names.contains(&"clip.mp4"));
        assert!(!names.iter().any(|n| n.contains("Library.tvdb")));
        assert!(!scan.truncated);
    }

    #[test]
    fn scan_lists_musiclibrary_but_walks_sibling_media() {
        let t = Tmp::new();
        let lib = t.0.join("Music Library.musiclibrary");
        fs::create_dir_all(&lib).unwrap();
        fs::write(lib.join("Library.musicdb"), "db").unwrap();
        let media = t.0.join("Media.localized/Music/Artist");
        fs::create_dir_all(&media).unwrap();
        fs::write(media.join("track.m4a"), "audio").unwrap();
        let scan = scan_dir(&t.0).unwrap();
        let names: Vec<_> = scan.entries.iter().map(|e| e.relative_path.as_str()).collect();
        assert!(names.contains(&"Music Library.musiclibrary"));
        assert!(names.contains(&"Media.localized/Music/Artist/track.m4a"));
        assert!(!names.iter().any(|n| n.contains("Library.musicdb")));
        assert!(!scan.truncated);
    }

    #[test]
    fn scan_photos_library_walks_originals_only() {
        let t = Tmp::new();
        let library = t.0.join("Photos Library.photoslibrary");
        fs::create_dir_all(library.join("originals/0A")).unwrap();
        fs::create_dir_all(library.join("database")).unwrap();
        fs::write(library.join("originals/0A/shot.jpg"), "img").unwrap();
        fs::write(library.join("database/Photos.sqlite"), "db").unwrap();
        fs::write(t.0.join("loose.png"), "p").unwrap();

        let scan = scan_dir(&t.0).unwrap();
        let names: Vec<_> = scan.entries.iter().map(|e| e.relative_path.as_str()).collect();
        assert!(names.contains(&"Photos Library.photoslibrary"));
        assert!(names.contains(&"Photos Library.photoslibrary/originals"));
        assert!(names.contains(&"Photos Library.photoslibrary/originals/0A"));
        assert!(names.contains(&"Photos Library.photoslibrary/originals/0A/shot.jpg"));
        assert!(names.contains(&"loose.png"));
        assert!(!names.iter().any(|n| n.contains("database")));
        assert!(!scan.truncated);
    }

    #[test]
    fn applications_root_uses_shallow_scan_limits() {
        let t = Tmp::new();
        let apps = t.0.join("Applications");
        let foo = apps.join("Foo.app");
        let bar = apps.join("Utilities").join("Bar.app");
        fs::create_dir_all(foo.join("Contents")).unwrap();
        fs::write(foo.join("Contents").join("Info.plist"), "x").unwrap();
        fs::create_dir_all(bar.join("Contents")).unwrap();
        fs::write(bar.join("Contents").join("Info.plist"), "x").unwrap();
        fs::create_dir_all(apps.join("Utilities").join("nested")).unwrap();
        fs::write(apps.join("Utilities").join("nested").join("deep.txt"), "x").unwrap();

        let scan = scan_dir(&apps).unwrap();
        let rels: Vec<_> = scan.entries.iter().map(|e| e.relative_path.as_str()).collect();
        assert!(rels.contains(&"Foo.app"));
        assert!(rels.contains(&"Utilities"));
        assert!(rels.contains(&"Utilities/Bar.app"));
        assert!(
            !rels.iter().any(|r| r.contains("deep.txt")),
            "nested files under Applications/Utilities must be skipped"
        );
        assert!(
            !rels.iter().any(|r| r.contains("Contents")),
            ".app packages must stay opaque"
        );
    }

    #[test]
    fn scan_continues_after_max_depth_in_one_branch() {
        let t = Tmp::new();
        // Deep tree sorts before "zebra.txt", so a depth abort must not skip the sibling file.
        let mut deep = t.0.join("deep");
        for _ in 0..=MAX_DEPTH + 2 {
            deep = deep.join("d");
        }
        fs::create_dir_all(&deep).unwrap();
        fs::write(deep.join("buried.txt"), "x").unwrap();
        fs::write(t.0.join("zebra.txt"), "z").unwrap();
        let scan = scan_dir(&t.0).unwrap();
        let names: Vec<_> = scan.entries.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"zebra.txt"), "sibling after a deep folder must still be listed");
        assert!(scan.truncated);
    }

    #[test]
    fn scan_lists_all_top_level_before_filling_deep_budget() {
        let t = Tmp::new();
        // Early bulky folder sorts before zebra.txt; with a tight budget, depth-first
        // would never reach zebra. Sibling-first must still list it.
        let bulky = t.0.join("aadir");
        fs::create_dir_all(&bulky).unwrap();
        for i in 0..80 {
            fs::write(bulky.join(format!("f{i:04}.txt")), "x").unwrap();
        }
        fs::write(t.0.join("zebra.txt"), "z").unwrap();

        let scan = scan_dir_limited(&t.0, 40, MAX_DEPTH).unwrap();
        let top: Vec<_> = scan
            .entries
            .iter()
            .filter(|e| !e.relative_path.contains('/'))
            .map(|e| e.name.as_str())
            .collect();
        assert!(top.contains(&"zebra.txt"), "top-level sibling must survive entry budget");
        assert!(top.contains(&"aadir"));
        assert!(scan.truncated);
        assert!(scan.entries.len() <= 40);
    }

    #[cfg(unix)]
    #[test]
    fn scan_lists_symlinks_but_does_not_follow_them() {
        let t = Tmp::new();
        let outside = Tmp::new();
        fs::write(outside.0.join("secret.txt"), "nope").unwrap();
        sample_tree(&t.0);
        std::os::unix::fs::symlink(&outside.0, t.0.join("link")).unwrap();
        // Application symlinks (e.g. Safari.app → system) must appear in listings.
        std::os::unix::fs::symlink(&outside.0, t.0.join("Safari.app")).unwrap();
        let scan = scan_dir(&t.0).unwrap();
        assert!(scan.entries.iter().any(|e| e.name == "link"));
        assert!(scan.entries.iter().any(|e| e.name == "Safari.app" && e.is_dir));
        assert!(!scan.entries.iter().any(|e| e.relative_path.contains("secret.txt")));
    }

    #[test]
    fn resolve_allows_inside_and_rejects_outside() {
        let t = Tmp::new();
        let outside = Tmp::new();
        sample_tree(&t.0);
        fs::write(outside.0.join("x.txt"), "x").unwrap();
        let roots = vec![t.0.clone()];
        assert!(resolve_in_roots(&roots, &t.0.join("a.txt")).is_ok());
        assert!(resolve_in_roots(&roots, &outside.0.join("x.txt")).is_err());
        assert!(resolve_in_roots(&roots, Path::new("relative.txt")).is_err());
    }

    #[test]
    fn resolve_rejects_parent_dir_escape() {
        let t = Tmp::new();
        let outside = Tmp::new();
        fs::write(outside.0.join("x.txt"), "x").unwrap();
        let roots = vec![t.0.clone()];
        let sneaky = t.0.join("..").join(outside.0.file_name().unwrap()).join("x.txt");
        assert!(resolve_in_roots(&roots, &sneaky).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn resolve_rejects_symlink_escape() {
        let t = Tmp::new();
        let outside = Tmp::new();
        fs::write(outside.0.join("x.txt"), "x").unwrap();
        std::os::unix::fs::symlink(&outside.0, t.0.join("link")).unwrap();
        let roots = vec![t.0.clone()];
        assert!(resolve_in_roots(&roots, &t.0.join("link/x.txt")).is_err());
        assert!(resolve_in_roots(&roots, &t.0.join("link/new.txt")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn resolve_app_bundle_allows_symlink_stub_under_root() {
        let t = Tmp::new();
        let outside = Tmp::new();
        fs::create_dir_all(outside.0.join("Contents")).unwrap();
        let stub = t.0.join("Safari.app");
        std::os::unix::fs::symlink(&outside.0, &stub).unwrap();
        // Full canonicalize leaves the allowed root — resolve_in_roots must fail.
        assert!(resolve_in_roots(&[t.0.clone()], &stub).is_err());
        let state = LocalRoots {
            roots: Mutex::new(vec![t.0.clone()]),
            session_only: Mutex::new(Vec::new()),
            search_allowed: Mutex::new(std::collections::HashSet::new()),
        };
        let resolved = resolve_app_bundle(&state, &stub).unwrap();
        assert_eq!(resolved, stub);
    }

    #[test]
    fn resolve_allows_new_file_in_a_picked_folder() {
        let t = Tmp::new();
        let roots = vec![t.0.clone()];
        let resolved = resolve_in_roots(&roots, &t.0.join("new.txt")).unwrap();
        assert_eq!(resolved, t.0.join("new.txt"));
        assert!(resolve_in_roots(&roots, &t.0.join("missing-dir/new.txt")).is_err());
    }

    #[test]
    fn write_replaces_contents_and_leaves_no_temp_file() {
        let t = Tmp::new();
        let file = t.0.join("doc.txt");
        fs::write(&file, "old").unwrap();
        write_atomic(&file, b"new contents").unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "new contents");
        let leftovers: Vec<_> = fs::read_dir(&t.0).unwrap().filter_map(Result::ok).collect();
        assert_eq!(leftovers.len(), 1);
    }

    #[test]
    fn write_creates_a_new_file() {
        let t = Tmp::new();
        let file = t.0.join("fresh.bin");
        write_atomic(&file, &[9, 8, 7]).unwrap();
        assert_eq!(fs::read(&file).unwrap(), vec![9, 8, 7]);
    }

    #[test]
    fn rename_works_and_refuses_unsafe_or_existing_names() {
        let t = Tmp::new();
        sample_tree(&t.0);
        let a = t.0.join("a.txt");
        let renamed = rename_in_place(&a, "renamed.txt").unwrap();
        assert!(renamed.exists() && !a.exists());
        assert!(rename_in_place(&renamed, "../escape.txt").is_err());
        assert!(rename_in_place(&renamed, "sub/x.txt").is_err());
        assert!(rename_in_place(&renamed, "").is_err());
        fs::write(t.0.join("taken.txt"), "t").unwrap();
        assert!(rename_in_place(&renamed, "taken.txt").is_err());
    }

    #[test]
    fn roots_persist_and_drop_missing_folders() {
        let t = Tmp::new();
        let keep = t.0.join("keep");
        let gone = t.0.join("gone");
        fs::create_dir_all(&keep).unwrap();
        fs::create_dir_all(&gone).unwrap();
        let file = t.0.join(ROOTS_FILE);
        save_roots(&file, &[keep.clone(), gone.clone()]).unwrap();
        fs::remove_dir_all(&gone).unwrap();
        assert_eq!(load_roots(&file), vec![keep]);
    }

    #[test]
    fn save_new_never_overwrites_an_existing_file() {
        let tmp = Tmp::new();
        let first = save_new_in(&tmp.0, "a.zip", b"one").unwrap();
        let second = save_new_in(&tmp.0, "a.zip", b"two").unwrap();
        assert_ne!(first, second);
        assert!(second.ends_with("a 2.zip"));
        assert_eq!(fs::read(&first).unwrap(), b"one");
        assert!(save_new_in(&tmp.0, "../escape.zip", b"x").is_err());
    }

    #[test]
    fn unique_destination_adds_a_number_when_the_name_is_taken() {
        let t = Tmp::new();
        assert_eq!(unique_destination(&t.0, "clip.mp4"), t.0.join("clip.mp4"));
        fs::write(t.0.join("clip.mp4"), "x").unwrap();
        assert_eq!(unique_destination(&t.0, "clip.mp4"), t.0.join("clip 2.mp4"));
        fs::write(t.0.join("clip 2.mp4"), "x").unwrap();
        assert_eq!(unique_destination(&t.0, "clip.mp4"), t.0.join("clip 3.mp4"));
        fs::write(t.0.join("README"), "x").unwrap();
        assert_eq!(unique_destination(&t.0, "README"), t.0.join("README 2"));
    }

    #[test]
    fn copy_atomic_copies_and_leaves_no_temp_file() {
        let t = Tmp::new();
        let src = t.0.join("src.bin");
        fs::write(&src, [5u8; 1000]).unwrap();
        let dest = t.0.join("out.bin");
        copy_atomic(&src, &dest).unwrap();
        assert_eq!(fs::read(&dest).unwrap(), vec![5u8; 1000]);
        assert!(src.exists());
        let names: Vec<_> = fs::read_dir(&t.0).unwrap().filter_map(Result::ok).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        assert!(!names.iter().any(|n| n.contains("cloudbreak-tmp")));
    }

    #[test]
    fn copy_atomic_failure_leaves_nothing_behind() {
        let t = Tmp::new();
        let missing = t.0.join("nope.bin");
        assert!(copy_atomic(&missing, &t.0.join("out.bin")).is_err());
        assert_eq!(fs::read_dir(&t.0).unwrap().count(), 0);
    }

    #[test]
    fn session_only_folders_are_allowed_but_not_listed_as_remembered() {
        let t = Tmp::new();
        let state = LocalRoots::default();
        state.roots.lock().unwrap().push(t.0.join("keep"));
        state.session_only.lock().unwrap().push(t.0.join("scratch"));
        let all = snapshot(&state);
        assert_eq!(all.len(), 2);
        assert!(all.contains(&t.0.join("scratch")));
        assert_eq!(state.roots.lock().unwrap().len(), 1);
    }

    #[test]
    #[ignore = "moves a real file to the user's Trash; run by hand with --ignored"]
    fn trash_moves_a_file_out_of_its_folder() {
        let t = Tmp::new();
        let file = t.0.join("cloudbreak-trash-test.txt");
        fs::write(&file, "bye").unwrap();
        move_to_trash(&file).unwrap();
        assert!(!file.exists());
    }

    #[test]
    fn folder_of_uses_the_last_path_segment() {
        let f = folder_of(Path::new("/Users/someone/Photos"));
        assert_eq!(f.name, "Photos");
        assert_eq!(f.path, "/Users/someone/Photos");
    }
}
