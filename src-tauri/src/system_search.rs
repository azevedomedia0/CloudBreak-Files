//! Whole-Mac file search via Spotlight (`mdfind`).

use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager, State};

use crate::local_fs::LocalRoots;

const MAX_RESULTS: usize = 150;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSearchHit {
    pub name: String,
    pub path: String,
    pub parent_path: String,
    pub size_bytes: u64,
    pub modified_ms: u64,
    pub is_dir: bool,
}

fn escape_spotlight(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn should_skip(path: &Path) -> bool {
    let s = path.to_string_lossy();
    s.contains("/node_modules/")
        || s.contains("/.git/")
        || s.contains("/.Trash/")
        || s.contains("/Library/Caches/")
        || s.contains("/Library/Developer/Xcode/DerivedData/")
        || s.contains("/.cargo/registry/")
        || s.contains("/cloudbreak-cargo-target/")
}

fn hit_from_path(path: &Path) -> Option<SystemSearchHit> {
    if should_skip(path) {
        return None;
    }
    let meta = fs::symlink_metadata(path).ok()?;
    // Spotlight may return broken aliases; only real files/dirs.
    if meta.file_type().is_symlink() {
        return None;
    }
    let name = path.file_name()?.to_string_lossy().into_owned();
    if name.starts_with('.') {
        return None;
    }
    Some(SystemSearchHit {
        name,
        path: path.to_string_lossy().into_owned(),
        parent_path: path
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default(),
        size_bytes: if meta.is_file() { meta.len() } else { 0 },
        modified_ms: modified_ms(&meta),
        is_dir: meta.is_dir(),
    })
}

/// Run Spotlight and return matching paths (files preferred; dirs included).
#[cfg(target_os = "macos")]
fn mdfind(query: &str) -> Result<Vec<PathBuf>, String> {
    let trimmed = query.trim();
    if trimmed.len() < 2 {
        return Ok(Vec::new());
    }
    if trimmed.len() > 200 {
        return Err("Search is too long".into());
    }
    let escaped = escape_spotlight(trimmed);
    // Name match (case/diacritic insensitive) or content match — same idea as Finder “This Mac”.
    let predicate = format!(
        "(kMDItemDisplayName == \"*{escaped}*\"cd) || (kMDItemFSName == \"*{escaped}*\"cd) || (kMDItemTextContent == \"{escaped}\"cd)"
    );

    let output = Command::new("mdfind")
        .arg(&predicate)
        .output()
        .map_err(|e| format!("Could not run Spotlight search: {e}"))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        // Fallback: simple filename search.
        let fallback = Command::new("mdfind")
            .args(["-name", trimmed])
            .output()
            .map_err(|e| format!("Could not run Spotlight search: {e}"))?;
        if !fallback.status.success() {
            return Err(if err.trim().is_empty() {
                "Spotlight search failed".into()
            } else {
                err.trim().to_string()
            });
        }
        return Ok(parse_mdfind_paths(&fallback.stdout));
    }
    Ok(parse_mdfind_paths(&output.stdout))
}

#[cfg(not(target_os = "macos"))]
fn mdfind(_query: &str) -> Result<Vec<PathBuf>, String> {
    Err("System-wide search is only available on macOS".into())
}

fn parse_mdfind_paths(stdout: &[u8]) -> Vec<PathBuf> {
    String::from_utf8_lossy(stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .map(PathBuf::from)
        .take(MAX_RESULTS * 3) // collect extra before filtering noise
        .collect()
}

/// Register Spotlight hits so preview / read / asset URLs work outside Local Folders.
pub fn allow_search_paths(app: &AppHandle, state: &LocalRoots, paths: &[PathBuf]) {
    let mut allowed = HashSet::new();
    for path in paths {
        let Ok(resolved) = fs::canonicalize(path) else { continue };
        let _ = app.asset_protocol_scope().allow_file(&resolved);
        if let Some(parent) = resolved.parent() {
            let _ = app.asset_protocol_scope().allow_directory(parent, false);
        }
        allowed.insert(resolved);
    }
    if let Ok(mut guard) = state.search_allowed.lock() {
        *guard = allowed;
    }
}

pub fn clear_search_paths(state: &LocalRoots) {
    if let Ok(mut guard) = state.search_allowed.lock() {
        guard.clear();
    }
}

#[tauri::command]
pub fn system_search(
    query: String,
    app: AppHandle,
    roots: State<'_, LocalRoots>,
) -> Result<Vec<SystemSearchHit>, String> {
    let trimmed = query.trim().to_string();
    if trimmed.len() < 2 {
        clear_search_paths(&roots);
        return Ok(Vec::new());
    }

    let paths = mdfind(&trimmed)?;
    let mut hits = Vec::new();
    let mut seen = HashSet::new();
    let mut allowed_paths = Vec::new();

    // Prefer files over folders when both appear.
    let mut files = Vec::new();
    let mut dirs = Vec::new();
    for path in paths {
        let Some(hit) = hit_from_path(&path) else { continue };
        if !seen.insert(hit.path.clone()) {
            continue;
        }
        if hit.is_dir {
            dirs.push(hit);
        } else {
            files.push(hit);
        }
    }

    for hit in files.into_iter().chain(dirs) {
        if hits.len() >= MAX_RESULTS {
            break;
        }
        allowed_paths.push(PathBuf::from(&hit.path));
        hits.push(hit);
    }

    allow_search_paths(&app, &roots, &allowed_paths);
    Ok(hits)
}

#[tauri::command]
pub fn system_search_clear(roots: State<'_, LocalRoots>) -> Result<(), String> {
    clear_search_paths(&roots);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_quotes_for_spotlight() {
        assert_eq!(escape_spotlight(r#"say "hi""#), r#"say \"hi\""#);
    }

    #[test]
    fn skips_noisy_paths() {
        assert!(should_skip(Path::new("/Users/a/proj/node_modules/x/index.js")));
        assert!(should_skip(Path::new("/Users/a/.Trash/old.txt")));
        assert!(!should_skip(Path::new("/Users/a/Documents/Report.pdf")));
    }
}
