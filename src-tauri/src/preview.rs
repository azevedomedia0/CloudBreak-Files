//! Local file thumbnails and system open (macOS Quick Look / sips).
//!
//! Generates web-viewable JPEG previews for PDF, Office, Pages, HEIC/RAW, etc.
//! Cached under the app temp folder and exposed via the asset protocol.

use serde::Serialize;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::SystemTime;
use tauri::{AppHandle, Manager, State};

use crate::local_fs::{self, LocalRoots};

const DEFAULT_EDGE: u32 = 512;
const MAX_EDGE: u32 = 4096;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResult {
    pub path: String,
    pub width_hint: u32,
}

fn thumbs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .temp_dir()
        .map_err(|e| format!("Could not find temp dir: {e}"))?
        .join("cloudbreak-thumbs");
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create thumbnail cache: {e}"))?;
    let _ = app.asset_protocol_scope().allow_directory(&dir, true);
    Ok(dir)
}

fn file_fingerprint(path: &Path) -> Result<u64, String> {
    let meta = fs::metadata(path).map_err(|e| format!("Could not read file: {e}"))?;
    let modified = meta
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.to_string_lossy().hash(&mut hasher);
    meta.len().hash(&mut hasher);
    modified.hash(&mut hasher);
    Ok(hasher.finish())
}

fn cache_path(cache: &Path, source: &Path, edge: u32) -> Result<PathBuf, String> {
    let fp = file_fingerprint(source)?;
    let stem = source
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".into())
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .take(48)
        .collect::<String>();
    Ok(cache.join(format!("{stem}_{fp:x}_{edge}.jpg")))
}

fn extension_lower(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn is_raster_candidate(ext: &str) -> bool {
    matches!(
        ext,
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "tif" | "tiff"
            | "heic" | "heif" | "avif" | "ico"
            | "raw" | "dng" | "cr2" | "nef" | "arw" | "orf" | "rw2" | "raf" | "pef"
    )
}

/// Prefer `sips` for camera/image formats (fast embedded-preview path for RAW/HEIC).
fn try_sips(source: &Path, dest: &Path, edge: u32) -> bool {
    if !is_raster_candidate(&extension_lower(source)) {
        return false;
    }
    let status = Command::new("sips")
        .args([
            "-s",
            "format",
            "jpeg",
            "-Z",
            &edge.to_string(),
            source.to_string_lossy().as_ref(),
            "--out",
            dest.to_string_lossy().as_ref(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    matches!(status, Ok(s) if s.success()) && dest.is_file() && fs::metadata(dest).map(|m| m.len() > 32).unwrap_or(false)
}

/// Quick Look thumbnailing covers PDF, Office, Pages, and image formats sips misses.
#[cfg(target_os = "macos")]
fn try_qlmanage(source: &Path, dest: &Path, edge: u32) -> bool {
    let Ok(tmp) = tempfile_dir_beside(dest) else {
        return false;
    };
    let status = Command::new("qlmanage")
        .args([
            "-t",
            "-s",
            &edge.to_string(),
            "-o",
            tmp.to_string_lossy().as_ref(),
            source.to_string_lossy().as_ref(),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    if !matches!(status, Ok(s) if s.success()) {
        let _ = fs::remove_dir_all(&tmp);
        return false;
    }
    // qlmanage names output like "Report.docx.png"
    let found = fs::read_dir(&tmp).ok().and_then(|entries| {
        entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .find(|p| {
                p.is_file()
                    && p
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e.eq_ignore_ascii_case("png") || e.eq_ignore_ascii_case("jpg") || e.eq_ignore_ascii_case("jpeg"))
                        .unwrap_or(false)
            })
    });
    let Some(png) = found else {
        let _ = fs::remove_dir_all(&tmp);
        return false;
    };
    // Normalize to JPEG for the web view / CSP.
    let converted = if png
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("jpg") || e.eq_ignore_ascii_case("jpeg"))
        .unwrap_or(false)
    {
        fs::copy(&png, dest).is_ok()
    } else {
        try_sips(&png, dest, edge) || fs::copy(&png, dest).is_ok()
    };
    let _ = fs::remove_dir_all(&tmp);
    converted && dest.is_file()
}

#[cfg(not(target_os = "macos"))]
fn try_qlmanage(_source: &Path, _dest: &Path, _edge: u32) -> bool {
    false
}

fn tempfile_dir_beside(dest: &Path) -> Result<PathBuf, String> {
    let parent = dest.parent().unwrap_or_else(|| Path::new("."));
    let dir = parent.join(format!(".ql-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn resolve_allowed(path: &str, roots: &LocalRoots) -> Result<PathBuf, String> {
    local_fs::resolve_accessible(roots, Path::new(path))
}

fn path_looks_like_app(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("app"))
        .unwrap_or(false)
}

fn is_app_bundle(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("app"))
        .unwrap_or(false)
        && match fs::symlink_metadata(path) {
            Ok(m) => m.is_dir() || m.file_type().is_symlink(),
            Err(_) => path.is_dir(),
        }
}

fn resolve_for_preview(path: &str, roots: &LocalRoots) -> Result<PathBuf, String> {
    if path_looks_like_app(path) {
        local_fs::resolve_app_bundle(roots, Path::new(path))
            .or_else(|_| resolve_allowed(path, roots))
    } else {
        resolve_allowed(path, roots)
    }
}

fn is_thumbnailable(path: &Path) -> bool {
    path.is_file() || is_app_bundle(path)
}

/// Build (or reuse) a JPEG preview for a local file (or .app icon) inside an allowed folder.
#[tauri::command]
pub fn local_file_thumbnail(
    path: String,
    max_edge: Option<u32>,
    app: AppHandle,
    roots: State<'_, LocalRoots>,
) -> Result<PreviewResult, String> {
    let source = resolve_for_preview(&path, &roots)?;
    if !is_thumbnailable(&source) {
        return Err("That path is not a file".into());
    }
    let edge = max_edge.unwrap_or(DEFAULT_EDGE).clamp(64, MAX_EDGE);
    let cache = thumbs_dir(&app)?;
    let dest = cache_path(&cache, &source, edge)?;
    if dest.is_file() {
        return Ok(PreviewResult {
            path: dest.to_string_lossy().into_owned(),
            width_hint: edge,
        });
    }

    // .app bundles: Quick Look / Spotlight icon. Regular images: sips then QL.
    let ok = if is_app_bundle(&source) {
        try_qlmanage(&source, &dest, edge) || try_sips(&source, &dest, edge)
    } else {
        try_sips(&source, &dest, edge) || try_qlmanage(&source, &dest, edge)
    };
    if !ok {
        let _ = fs::remove_file(&dest);
        return Err(format!(
            "Could not generate a preview for {}",
            source.file_name().and_then(|s| s.to_str()).unwrap_or("file")
        ));
    }
    Ok(PreviewResult {
        path: dest.to_string_lossy().into_owned(),
        width_hint: edge,
    })
}

/// Rasterize a local image (HEIC/RAW/TIFF/…) to a larger JPEG for in-app viewing / Photo Studio.
#[tauri::command]
pub fn local_file_raster(
    path: String,
    max_edge: Option<u32>,
    app: AppHandle,
    roots: State<'_, LocalRoots>,
) -> Result<PreviewResult, String> {
    local_file_thumbnail(path, Some(max_edge.unwrap_or(2048)), app, roots)
}

/// Open a local file (or launch a .app bundle) with the macOS default handler.
#[tauri::command]
pub fn local_open_with_default(path: String, roots: State<'_, LocalRoots>) -> Result<(), String> {
    let source = resolve_for_preview(&path, &roots)?;
    if !source.is_file() && !is_app_bundle(&source) {
        return Err("That path is not a file".into());
    }
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg(&source)
            .status()
            .map_err(|e| format!("Could not open file: {e}"))?;
        if status.success() {
            return Ok(());
        }
        return Err("Could not open that file with the default app".into());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = source;
        Err("Opening with the default app is only available on macOS".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn raster_candidates_cover_requested_formats() {
        for ext in ["heic", "heif", "avif", "tiff", "tif", "raw", "dng"] {
            assert!(is_raster_candidate(ext), "{ext}");
        }
        assert!(!is_raster_candidate("pdf"));
        assert!(!is_raster_candidate("docx"));
    }
}
