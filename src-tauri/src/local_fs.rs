//! Local file access for the desktop app.
//!
//! The user picks a folder with the native dialog. Every scan, read, write and rename is checked
//! against the folders picked so far, so the web view can never reach files outside them.
//! Symlinks are never followed while scanning, and a path is resolved before it is compared, so
//! `..` segments and links cannot escape a picked folder.

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

pub const ROOTS_FILE: &str = "local_roots.json";
const MAX_DEPTH: usize = 6;
const MAX_ENTRIES: usize = 2000;
const MAX_READ_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Default)]
pub struct LocalRoots {
    roots: Mutex<Vec<PathBuf>>,
    /// Folders allowed for this session only (save destinations). Never written to disk.
    session_only: Mutex<Vec<PathBuf>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalFolder {
    pub path: String,
    pub name: String,
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

fn valid_file_name(name: &str) -> Result<&str, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." || trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains('\0') {
        return Err("That file name is not allowed".into());
    }
    Ok(trimmed)
}

pub fn scan_dir(root: &Path) -> Result<LocalScan, String> {
    let mut entries = Vec::new();
    let mut truncated = false;
    walk(root, root, 0, &mut entries, &mut truncated)?;
    Ok(LocalScan { entries, truncated })
}

fn walk(
    root: &Path,
    dir: &Path,
    depth: usize,
    out: &mut Vec<LocalEntry>,
    truncated: &mut bool,
) -> Result<(), String> {
    if depth > MAX_DEPTH {
        return Ok(());
    }
    let read = fs::read_dir(dir).map_err(|e| format!("Could not open {}: {e}", dir.display()))?;
    let mut children: Vec<_> = read.filter_map(Result::ok).collect();
    children.sort_by_key(|e| e.file_name());
    for child in children {
        let name = child.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        // `symlink_metadata` does not follow links, so a link is skipped instead of walked.
        let Ok(meta) = fs::symlink_metadata(child.path()) else { continue };
        if meta.file_type().is_symlink() {
            continue;
        }
        if out.len() >= MAX_ENTRIES {
            *truncated = true;
            return Ok(());
        }
        let path = child.path();
        let relative = path
            .strip_prefix(root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| name.clone());
        out.push(LocalEntry {
            name,
            path: path.to_string_lossy().into_owned(),
            relative_path: relative,
            is_dir: meta.is_dir(),
            size_bytes: if meta.is_dir() { 0 } else { meta.len() },
            modified_ms: modified_ms(&meta),
        });
        if meta.is_dir() {
            walk(root, &path, depth + 1, out, truncated)?;
            if *truncated {
                return Ok(());
            }
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
fn add_root(app: &AppHandle, state: &LocalRoots, root: PathBuf, remember: bool) -> Result<LocalFolder, String> {
    let root = fs::canonicalize(&root).map_err(|e| format!("Could not open that folder: {e}"))?;
    if !root.is_dir() {
        return Err("That is not a folder".into());
    }
    if remember {
        app.asset_protocol_scope()
            .allow_directory(&root, true)
            .map_err(|e| format!("Could not allow that folder: {e}"))?;
        let mut guard = state.roots.lock().map_err(|_| "Local folder list is unavailable".to_string())?;
        if !guard.contains(&root) {
            guard.push(root.clone());
        }
        save_roots(&roots_file(app)?, &guard)?;
    } else if let Ok(mut guard) = state.session_only.lock() {
        if !guard.contains(&root) {
            guard.push(root.clone());
        }
    }
    Ok(folder_of(&root))
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
#[tauri::command]
pub fn local_ensure_standard_folders(app: AppHandle, state: State<'_, LocalRoots>) -> Vec<LocalFolder> {
    let mut added = Vec::new();
    for (display_name, path) in standard_folder_candidates() {
        if !path.is_dir() {
            continue;
        }
        match add_root(&app, &state, path, true) {
            Ok(folder) => added.push(LocalFolder {
                path: folder.path,
                name: display_name,
            }),
            Err(_) => {
                // Permission denied or unreadable — keep the empty sidebar stub.
            }
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
    let resolved = resolve_in_roots(&snapshot(&state), Path::new(&path))?;
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

    #[cfg(unix)]
    #[test]
    fn scan_does_not_follow_symlinks() {
        let t = Tmp::new();
        let outside = Tmp::new();
        fs::write(outside.0.join("secret.txt"), "nope").unwrap();
        sample_tree(&t.0);
        std::os::unix::fs::symlink(&outside.0, t.0.join("link")).unwrap();
        let scan = scan_dir(&t.0).unwrap();
        assert!(!scan.entries.iter().any(|e| e.relative_path.contains("secret.txt") || e.name == "link"));
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
