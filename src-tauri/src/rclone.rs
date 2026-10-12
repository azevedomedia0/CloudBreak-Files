//! Google Drive through a bundled `rclone` sidecar.
//!
//! This is the "no setup" sign-in: rclone brings its own Google OAuth client, so nobody has to
//! create a Google Cloud project. rclone does the browser sign-in (`rclone authorize drive`),
//! Cloudbreak keeps the resulting token in the OS keychain, and listing runs `rclone lsjson`
//! against a remote that exists only in environment variables for the one command.
//!
//! Opening or saving a file runs `rclone copyto` into the app's media temp folder, where the web
//! view reads it through the asset protocol and the save dialog copies it out.
//!
//! Nothing is written to the user's own rclone config: every run uses a private, throwaway
//! config path that is deleted afterwards.

use crate::oauth_google::random_urlsafe;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tokio::process::Command;
use tokio::time::timeout;

/// Name of the in-memory remote built from environment variables.
const REMOTE: &str = "CBDRIVE";
const AUTH_TIMEOUT: Duration = Duration::from_secs(300);
const CALL_TIMEOUT: Duration = Duration::from_secs(180);
/// Same cap the other cloud adapters use.
const MAX_ENTRIES: usize = 400;
/// A file is fetched whole into the temp folder, so there is a ceiling on what the app will pull down.
const MAX_FETCH_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const FETCH_TIMEOUT: Duration = Duration::from_secs(1200);
const INSTALL_HINT: &str =
    "Install rclone with Homebrew: brew install rclone. Release builds of Cloudbreak Files ship a bundled copy.";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RcloneStatus {
    pub available: bool,
    pub path: Option<String>,
    /// `bundled` | `env` | `homebrew` | `path` | `missing`
    pub source: String,
    pub install_hint: String,
}

fn binary_name() -> &'static str {
    if cfg!(windows) {
        "rclone.exe"
    } else {
        "rclone"
    }
}

/// Sidecar next to the app binary (Tauri `externalBin`), then Homebrew, then PATH.
fn find_rclone() -> Option<(PathBuf, &'static str)> {
    if let Ok(p) = std::env::var("RCLONE_PATH") {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Some((path, "env"));
        }
    }
    let name = binary_name();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for candidate in [dir.join(name), dir.join("binaries").join(name)] {
                if candidate.is_file() {
                    return Some((candidate, "bundled"));
                }
            }
        }
    }
    for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        let candidate = PathBuf::from(dir).join(name);
        if candidate.is_file() {
            return Some((candidate, "homebrew"));
        }
    }
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join(name))
            .find(|c| c.is_file())
            .map(|c| (c, "path"))
    })
}

fn require_rclone() -> Result<PathBuf, String> {
    find_rclone()
        .map(|(p, _)| p)
        .ok_or_else(|| format!("rclone was not found. {INSTALL_HINT}"))
}

#[tauri::command]
pub fn rclone_status() -> RcloneStatus {
    match find_rclone() {
        Some((path, source)) => RcloneStatus {
            available: true,
            path: Some(path.to_string_lossy().into_owned()),
            source: source.into(),
            install_hint: String::new(),
        },
        None => RcloneStatus {
            available: false,
            path: None,
            source: "missing".into(),
            install_hint: INSTALL_HINT.into(),
        },
    }
}

/// A private config directory that is removed when dropped.
struct ScratchConfig {
    dir: PathBuf,
}

impl ScratchConfig {
    fn new() -> Result<Self, String> {
        let dir = std::env::temp_dir().join(format!("cloudbreak-rclone-{}", random_urlsafe(9)));
        fs::create_dir(&dir).map_err(|e| format!("Could not create a temporary folder: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
        }
        Ok(Self { dir })
    }

    fn file(&self) -> PathBuf {
        self.dir.join("rclone.conf")
    }
}

impl Drop for ScratchConfig {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.dir);
    }
}

/// Drop any copy of the secret from text that may be shown to the user.
fn redact(text: &str, secret: Option<&str>) -> String {
    let mut out = text.to_string();
    if let Some(secret) = secret.filter(|s| !s.is_empty()) {
        out = out.replace(secret, "[token]");
    }
    out
}

fn last_error_line(stderr: &str, secret: Option<&str>) -> String {
    let line = stderr
        .lines()
        .rev()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.contains("NOTICE:"))
        .unwrap_or("rclone failed");
    let line = redact(line, secret);
    line.chars().take(300).collect()
}

/// Run rclone with a throwaway config. `token` (rclone's JSON token) defines the Drive remote.
async fn run(args: &[&str], token: Option<&str>, limit: Duration) -> Result<String, String> {
    let rclone = require_rclone()?;
    let scratch = ScratchConfig::new()?;

    let mut cmd = Command::new(&rclone);
    cmd.args(args)
        .env("RCLONE_CONFIG", scratch.file())
        .env("RCLONE_ASK_PASSWORD", "false")
        .env("RCLONE_NO_CHECK_UPDATE", "true")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(token) = token {
        cmd.env(format!("RCLONE_CONFIG_{REMOTE}_TYPE"), "drive")
            .env(format!("RCLONE_CONFIG_{REMOTE}_SCOPE"), "drive")
            .env(format!("RCLONE_CONFIG_{REMOTE}_TOKEN"), token);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Could not start rclone ({}): {e}", rclone.display()))?;
    let output = timeout(limit, child.wait_with_output())
        .await
        .map_err(|_| "rclone took too long. Try again.".to_string())?
        .map_err(|e| format!("rclone failed: {e}"))?;

    if !output.status.success() {
        return Err(last_error_line(&String::from_utf8_lossy(&output.stderr), token));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// rclone prints the token between "--->" and "<---End paste". Returns it as compact JSON.
fn parse_authorize_output(stdout: &str) -> Result<String, String> {
    let line = stdout
        .lines()
        .map(str::trim)
        .find(|l| l.starts_with('{') && l.ends_with('}'))
        .ok_or("rclone did not return a sign-in token. Try again.")?;
    let value: serde_json::Value =
        serde_json::from_str(line).map_err(|_| "rclone returned an unreadable sign-in token.".to_string())?;
    let has = |key: &str| value.get(key).and_then(|v| v.as_str()).is_some_and(|s| !s.is_empty());
    if !has("access_token") || !has("refresh_token") {
        return Err("Google did not return a refresh token. Remove Cloudbreak/rclone under your Google Account → Security → Third-party access, then sign in again.".into());
    }
    serde_json::to_string(&value).map_err(|e| e.to_string())
}

/// Browser sign-in for Google Drive using rclone's built-in OAuth client.
/// Returns rclone's token JSON, to be kept in the OS keychain.
#[tauri::command]
pub async fn rclone_google_authorize() -> Result<String, String> {
    let stdout = run(&["authorize", "drive"], None, AUTH_TIMEOUT).await?;
    parse_authorize_output(&stdout)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub used_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Deserialize)]
struct About {
    #[serde(default)]
    total: Option<i64>,
    #[serde(default)]
    used: Option<i64>,
}

fn non_negative(value: Option<i64>) -> u64 {
    value.filter(|v| *v > 0).map(|v| v as u64).unwrap_or(0)
}

fn validate_token(token: &str) -> Result<(), String> {
    let value: serde_json::Value =
        serde_json::from_str(token).map_err(|_| "The saved Google sign-in is unreadable. Sign in again.".to_string())?;
    if value.get("refresh_token").and_then(|v| v.as_str()).is_none() {
        return Err("The saved Google sign-in has no refresh token. Sign in again.".into());
    }
    Ok(())
}

/// Account name and storage use for a signed-in Drive.
#[tauri::command]
pub async fn rclone_drive_info(token: String) -> Result<DriveInfo, String> {
    validate_token(&token)?;
    let target = format!("{REMOTE}:");
    let about_args = ["about", target.as_str(), "--json"];
    let user_args = ["config", "userinfo", target.as_str(), "--json"];
    let (about, user) = tokio::join!(
        run(&about_args, Some(&token), CALL_TIMEOUT),
        run(&user_args, Some(&token), CALL_TIMEOUT),
    );
    let about: About = serde_json::from_str(&about?).map_err(|_| "Unexpected reply from rclone.".to_string())?;

    // Account name is best effort: older rclone builds lack `config userinfo` for Drive.
    let user: serde_json::Value = user
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let text = |key: &str| user.get(key).and_then(|v| v.as_str()).map(str::to_string);

    Ok(DriveInfo {
        email: text("emailAddress").or_else(|| text("email")),
        display_name: text("displayName"),
        used_bytes: non_negative(about.used),
        total_bytes: non_negative(about.total),
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct LsEntry {
    path: String,
    name: String,
    #[serde(default)]
    size: i64,
    #[serde(default)]
    mime_type: String,
    #[serde(default)]
    mod_time: String,
    #[serde(default)]
    is_dir: bool,
    #[serde(default, rename = "ID")]
    id: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DriveEntry {
    pub id: String,
    pub name: String,
    /// Absolute-style path, e.g. `/Photos/2024/a.jpg`.
    pub path: String,
    pub is_folder: bool,
    pub size_bytes: u64,
    pub mime_type: String,
    pub modified_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveListing {
    pub entries: Vec<DriveEntry>,
    pub truncated: bool,
}

fn map_listing(json: &str) -> Result<DriveListing, String> {
    let raw: Vec<LsEntry> = serde_json::from_str(json).map_err(|_| "Unexpected file list from rclone.".to_string())?;
    let truncated = raw.len() > MAX_ENTRIES;
    let entries = raw
        .into_iter()
        .take(MAX_ENTRIES)
        .map(|e| DriveEntry {
            // Google-native files (Docs, Sheets) report size -1.
            size_bytes: e.size.max(0) as u64,
            id: e.id,
            path: format!("/{}", e.path.trim_start_matches('/')),
            name: e.name,
            is_folder: e.is_dir,
            mime_type: e.mime_type,
            modified_at: e.mod_time,
        })
        .collect();
    Ok(DriveListing { entries, truncated })
}

/// Files and folders (three levels deep, capped like the other cloud adapters).
#[tauri::command]
pub async fn rclone_drive_list(token: String) -> Result<DriveListing, String> {
    validate_token(&token)?;
    let target = format!("{REMOTE}:");
    let stdout = run(
        &["lsjson", target.as_str(), "--recursive", "--max-depth", "3", "--fast-list"],
        Some(&token),
        CALL_TIMEOUT,
    )
    .await?;
    map_listing(&stdout)
}

/// A downloaded copy of a Drive file, in the app's temp folder.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FetchedFile {
    pub path: String,
    pub size_bytes: u64,
}

/// The part of a listing path rclone is given: relative, with no `.` or `..` segments and no control
/// characters, so the web view cannot steer the command anywhere but down into the signed-in Drive.
fn remote_relative_path(path: &str) -> Result<String, String> {
    let trimmed = path.trim().trim_start_matches('/');
    if trimmed.is_empty() {
        return Err("No file was named.".into());
    }
    if trimmed.chars().any(char::is_control) {
        return Err("That file path has characters Cloudbreak will not pass to rclone.".into());
    }
    if trimmed.split('/').any(|segment| segment == ".." || segment == ".") {
        return Err("That file path is not allowed.".into());
    }
    Ok(trimmed.to_string())
}

/// A stable, filesystem-safe name for the downloaded copy. The tag keeps two files with the same
/// name in different folders apart, and the same file reuses its name between opens.
fn staged_name(relative: &str) -> String {
    let leaf = relative.rsplit('/').next().unwrap_or(relative);
    let safe: String = leaf
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' })
        .collect();
    let safe = safe.trim_start_matches('.');
    // Keep the end, where the extension is, when a name is very long.
    let chars: Vec<char> = safe.chars().collect();
    let tail: String = chars[chars.len().saturating_sub(80)..].iter().collect();
    let tail = if tail.is_empty() { "file".to_string() } else { tail };
    let tag = hex::encode(&Sha256::digest(relative.as_bytes())[..6]);
    format!("rclone_{tag}_{tail}")
}

fn human_size(bytes: u64) -> String {
    const GIB: f64 = 1024.0 * 1024.0 * 1024.0;
    const MIB: f64 = 1024.0 * 1024.0;
    if bytes as f64 >= GIB {
        format!("{:.1} GB", bytes as f64 / GIB)
    } else {
        format!("{:.0} MB", bytes as f64 / MIB)
    }
}

/// Download one Drive file into `dir`. The copy is written to a `.part` file and renamed when
/// rclone finishes, so a cancelled or failed run never leaves a half-file that looks complete.
/// A copy already there with the size the listing reported is reused.
async fn fetch_into(dir: &Path, token: &str, path: &str, expected_bytes: u64) -> Result<FetchedFile, String> {
    let relative = remote_relative_path(path)?;
    if expected_bytes > MAX_FETCH_BYTES {
        return Err(format!(
            "This file is {}, over the {} Cloudbreak will download to open or save it.",
            human_size(expected_bytes),
            human_size(MAX_FETCH_BYTES)
        ));
    }
    fs::create_dir_all(dir).map_err(|e| format!("Could not create the download folder: {e}"))?;

    let dest = dir.join(staged_name(&relative));
    if expected_bytes > 0 {
        if let Ok(meta) = fs::metadata(&dest) {
            if meta.is_file() && meta.len() == expected_bytes {
                return Ok(FetchedFile { path: dest.to_string_lossy().into_owned(), size_bytes: meta.len() });
            }
        }
    }

    let part = PathBuf::from(format!("{}.part", dest.display()));
    let _ = fs::remove_file(&part);
    let source = format!("{REMOTE}:{relative}");
    let part_arg = part.to_string_lossy().into_owned();
    if let Err(e) = run(
        &["copyto", source.as_str(), part_arg.as_str(), "--retries", "1"],
        Some(token),
        FETCH_TIMEOUT,
    )
    .await
    {
        let _ = fs::remove_file(&part);
        return Err(e);
    }
    let size = fs::metadata(&part)
        .map_err(|_| "rclone finished but the file was not saved.".to_string())?
        .len();
    fs::rename(&part, &dest).map_err(|e| {
        let _ = fs::remove_file(&part);
        format!("Could not save the downloaded file: {e}")
    })?;
    Ok(FetchedFile { path: dest.to_string_lossy().into_owned(), size_bytes: size })
}

/// Download a Drive file (a path from `rclone_drive_list`) into the app's media temp folder and make
/// that folder readable by the web view. Google Docs, Sheets and Slides come down exported
/// (docx, xlsx, pptx), as rclone does by default.
#[tauri::command]
pub async fn rclone_drive_fetch(
    token: String,
    path: String,
    size_bytes: u64,
    app: AppHandle,
) -> Result<FetchedFile, String> {
    validate_token(&token)?;
    let dir = crate::commands::media_temp_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create the download folder: {e}"))?;
    let _ = app.asset_protocol_scope().allow_directory(&dir, true);
    fetch_into(&dir, &token, &path, size_bytes).await
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = r#"{"access_token":"ya29.a","token_type":"Bearer","refresh_token":"1//r","expiry":"2026-10-10T10:00:00Z"}"#;

    #[test]
    fn authorize_output_yields_the_token() {
        let out = format!("Paste the following into your remote machine --->\n{TOKEN}\n<---End paste\n");
        let parsed = parse_authorize_output(&out).unwrap();
        let v: serde_json::Value = serde_json::from_str(&parsed).unwrap();
        assert_eq!(v["refresh_token"], "1//r");
    }

    #[test]
    fn authorize_output_without_refresh_token_is_an_error() {
        let out = r#"{"access_token":"ya29.a","token_type":"Bearer"}"#;
        assert!(parse_authorize_output(out).unwrap_err().contains("refresh token"));
        assert!(parse_authorize_output("nothing here").is_err());
    }

    #[test]
    fn listing_maps_folders_files_and_native_docs() {
        let json = r#"[
          {"Path":"Photos","Name":"Photos","Size":-1,"MimeType":"inode/directory","ModTime":"2026-01-02T03:04:05Z","IsDir":true,"ID":"d1"},
          {"Path":"Photos/a.jpg","Name":"a.jpg","Size":1234,"MimeType":"image/jpeg","ModTime":"2026-01-02T03:04:05Z","IsDir":false,"ID":"f1"},
          {"Path":"Notes","Name":"Notes","Size":-1,"MimeType":"application/vnd.google-apps.document","ModTime":"2026-01-02T03:04:05Z","IsDir":false,"ID":"f2"}
        ]"#;
        let listing = map_listing(json).unwrap();
        assert!(!listing.truncated);
        assert_eq!(listing.entries.len(), 3);
        assert!(listing.entries[0].is_folder);
        assert_eq!(listing.entries[1].path, "/Photos/a.jpg");
        assert_eq!(listing.entries[1].size_bytes, 1234);
        assert_eq!(listing.entries[2].size_bytes, 0);
    }

    #[test]
    fn listing_is_capped() {
        let one = r#"{"Path":"a","Name":"a","Size":1,"MimeType":"text/plain","ModTime":"","IsDir":false,"ID":"x"}"#;
        let json = format!("[{}]", vec![one; MAX_ENTRIES + 5].join(","));
        let listing = map_listing(&json).unwrap();
        assert_eq!(listing.entries.len(), MAX_ENTRIES);
        assert!(listing.truncated);
    }

    #[test]
    fn errors_never_echo_the_token() {
        let stderr = format!("NOTICE: hi\nERROR : bad token {TOKEN} rejected\n");
        let line = last_error_line(&stderr, Some(TOKEN));
        assert!(!line.contains("ya29"));
        assert!(line.contains("[token]"));
    }

    #[test]
    fn token_validation_requires_a_refresh_token() {
        assert!(validate_token(TOKEN).is_ok());
        assert!(validate_token(r#"{"access_token":"x"}"#).is_err());
        assert!(validate_token("not json").is_err());
    }

    #[test]
    fn remote_paths_stay_inside_the_drive() {
        assert_eq!(remote_relative_path("/Photos/2024/a.jpg").unwrap(), "Photos/2024/a.jpg");
        assert_eq!(remote_relative_path("a.txt").unwrap(), "a.txt");
        assert!(remote_relative_path("").is_err());
        assert!(remote_relative_path("/").is_err());
        assert!(remote_relative_path("/Photos/../../etc/passwd").is_err());
        assert!(remote_relative_path("/./a").is_err());
        assert!(remote_relative_path("/a\nb").is_err());
    }

    #[test]
    fn staged_names_are_safe_distinct_and_stable() {
        let a = staged_name("Photos/a b.jpg");
        assert!(a.starts_with("rclone_") && a.ends_with("a_b.jpg"), "{a}");
        assert_eq!(a, staged_name("Photos/a b.jpg"));
        assert_ne!(a, staged_name("Other/a b.jpg"));
        assert!(!a.contains('/') && !a.contains(' '));
        assert!(staged_name("..hidden").ends_with("_hidden"));
        let long = staged_name(&format!("x/{}.mp4", "n".repeat(300)));
        assert!(long.len() < 120 && long.ends_with(".mp4"), "{long}");
        assert!(staged_name("dir/").ends_with("_file"));
    }

    #[tokio::test]
    async fn files_over_the_ceiling_are_refused_before_anything_runs() {
        let dir = std::env::temp_dir().join(format!("cb-fetch-{}", random_urlsafe(6)));
        let err = fetch_into(&dir, TOKEN, "/big.mov", MAX_FETCH_BYTES + 1).await.unwrap_err();
        assert!(err.contains("over the 2.0 GB"), "{err}");
        assert!(!dir.exists());
    }

    /// The fake rclone below stands in for the real one: it copies nothing, it writes what it was asked for.
    #[cfg(unix)]
    mod with_fake_rclone {
        use super::*;
        use std::os::unix::fs::PermissionsExt;
        use std::sync::Mutex;

        // RCLONE_PATH is process-wide, so the tests that set it take turns.
        static ENV: Mutex<()> = Mutex::new(());

        fn fake(dir: &Path, body: &str) {
            let script = dir.join("rclone");
            fs::write(&script, format!("#!/bin/sh\n{body}\n")).unwrap();
            fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
            std::env::set_var("RCLONE_PATH", &script);
        }

        fn scratch() -> PathBuf {
            let dir = std::env::temp_dir().join(format!("cb-fake-rclone-{}", random_urlsafe(6)));
            fs::create_dir_all(&dir).unwrap();
            dir
        }

        #[tokio::test]
        async fn downloads_through_a_part_file_and_returns_the_final_path() {
            let _guard = ENV.lock().unwrap_or_else(|e| e.into_inner());
            let work = scratch();
            // args: copyto CBDRIVE:<path> <dest> --retries 1
            fake(&work, r#"[ "$1" = copyto ] || exit 2; printf 'from %s' "$2" > "$3""#);
            let out = work.join("out");
            let got = fetch_into(&out, TOKEN, "/Photos/a b.jpg", 0).await.unwrap();
            assert_eq!(fs::read_to_string(&got.path).unwrap(), "from CBDRIVE:Photos/a b.jpg");
            assert_eq!(got.size_bytes, 27);
            assert!(!Path::new(&format!("{}.part", got.path)).exists());
            let _ = fs::remove_dir_all(&work);
        }

        #[tokio::test]
        async fn a_copy_of_the_listed_size_is_reused() {
            let _guard = ENV.lock().unwrap_or_else(|e| e.into_inner());
            let work = scratch();
            fake(&work, r#"printf 'NEW' > "$3""#);
            let out = work.join("out");
            let first = fetch_into(&out, TOKEN, "/a.txt", 0).await.unwrap();
            fs::write(&first.path, b"cached-bytes").unwrap();
            let again = fetch_into(&out, TOKEN, "/a.txt", 12).await.unwrap();
            assert_eq!(fs::read(&again.path).unwrap(), b"cached-bytes");
            // A different reported size means the file changed: fetch again.
            let changed = fetch_into(&out, TOKEN, "/a.txt", 99).await.unwrap();
            assert_eq!(fs::read(&changed.path).unwrap(), b"NEW");
            let _ = fs::remove_dir_all(&work);
        }

        #[tokio::test]
        async fn a_failed_run_leaves_no_file_and_never_echoes_the_token() {
            let _guard = ENV.lock().unwrap_or_else(|e| e.into_inner());
            let work = scratch();
            fake(&work, &format!("printf 'partial' > \"$3\"; echo 'ERROR : bad {TOKEN}' >&2; exit 1"));
            let out = work.join("out");
            let err = fetch_into(&out, TOKEN, "/a.txt", 0).await.unwrap_err();
            assert!(!err.contains("ya29") && err.contains("[token]"), "{err}");
            let left: Vec<_> = fs::read_dir(&out).unwrap().flatten().collect();
            assert!(left.is_empty(), "{left:?}");
            let _ = fs::remove_dir_all(&work);
        }
    }
}
