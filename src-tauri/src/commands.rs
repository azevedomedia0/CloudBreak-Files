use crate::crypto::{
    self, EncryptedAsset, PassphraseVerifier, StreamEncryptResult, KEY_LEN, MAX_SESSION_BYTES,
};
use crate::local_fs::{self, LocalRoots};
use std::path::Path;
use crate::media::{
    self, FfmpegStatus, MediaProcessResult, PhotoRenderRequest, PhotoRenderResult, VideoTrimRequest,
};
use crate::storage::{CloudAccount, StorageManager, StorageStats};
use crate::vault_store;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager, State};
use zeroize::Zeroize;

/// Vault state. The verifier is saved in the app data folder. The first unlock ever sets the passphrase.
/// After unlock, a file-encryption session key stays in Rust memory only (never sent to JS).
#[derive(Default)]
pub struct VaultState {
    pub verifier: Option<PassphraseVerifier>,
    pub unlocked: bool,
    session_key: Option<[u8; KEY_LEN]>,
}

impl VaultState {
    fn clear_session(&mut self) {
        if let Some(ref mut key) = self.session_key {
            key.zeroize();
        }
        self.session_key = None;
        self.unlocked = false;
    }

    fn set_session(&mut self, key: [u8; KEY_LEN]) {
        if let Some(ref mut old) = self.session_key {
            old.zeroize();
        }
        self.session_key = Some(key);
        self.unlocked = true;
    }
}

pub struct AppState {
    pub storage: Mutex<StorageManager>,
    pub vault: Mutex<VaultState>,
}

/// Recover the data if another thread panicked while it held the lock.
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Serialize, Deserialize)]
pub struct EncryptRequest {
    pub plaintext: String,
    pub passphrase: String,
}

#[derive(Serialize, Deserialize)]
pub struct DecryptRequest {
    pub ciphertext: String,
    pub nonce: String,
    pub salt: String,
    pub passphrase: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEncryptRequest {
    pub plaintext_base64: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDecryptRequest {
    pub ciphertext: String,
    pub nonce: String,
    pub salt: String,
}

#[tauri::command]
pub fn encrypt_data(req: EncryptRequest) -> Result<EncryptedAsset, String> {
    crypto::encrypt_bytes(req.plaintext.as_bytes(), &req.passphrase).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn decrypt_data(req: DecryptRequest) -> Result<String, String> {
    let asset = EncryptedAsset {
        ciphertext: req.ciphertext,
        nonce: req.nonce,
        salt: req.salt,
        key_fingerprint: String::new(),
        sha256_checksum: String::new(),
    };
    let bytes = crypto::decrypt_bytes(&asset, &req.passphrase).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|_| "Decrypted data is not valid UTF-8".to_string())
}

#[tauri::command]
pub fn encrypt_session_data(
    req: SessionEncryptRequest,
    state: State<'_, AppState>,
) -> Result<EncryptedAsset, String> {
    let vault = lock(&state.vault);
    let key = vault
        .session_key
        .as_ref()
        .ok_or_else(|| "Vault is locked — unlock to encrypt files".to_string())?;
    let data = B64
        .decode(req.plaintext_base64.as_bytes())
        .map_err(|_| "Invalid base64 plaintext".to_string())?;
    if data.len() > MAX_SESSION_BYTES {
        return Err(format!(
            "File is too large to encrypt in-session (max {} MB)",
            MAX_SESSION_BYTES / (1024 * 1024)
        ));
    }
    crypto::encrypt_with_key(&data, key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn decrypt_session_data(
    req: SessionDecryptRequest,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let vault = lock(&state.vault);
    let key = vault
        .session_key
        .as_ref()
        .ok_or_else(|| "Vault is locked — unlock to decrypt files".to_string())?;
    let asset = EncryptedAsset {
        ciphertext: req.ciphertext,
        nonce: req.nonce,
        salt: req.salt,
        key_fingerprint: String::new(),
        sha256_checksum: String::new(),
    };
    let plain = crypto::decrypt_with_key(&asset, key).map_err(|e| e.to_string())?;
    Ok(B64.encode(plain))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEncryptFileRequest {
    pub path: String,
    /// Optional output path; default is `<path>.cbenc` beside the source.
    pub output_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDecryptFileRequest {
    pub path: String,
    pub output_path: String,
}

/// Stream-encrypt a local file with the vault session key (no 32 MB / base64 IPC limit).
#[tauri::command]
pub fn encrypt_session_file(
    req: SessionEncryptFileRequest,
    state: State<'_, AppState>,
    roots: State<'_, LocalRoots>,
) -> Result<StreamEncryptResult, String> {
    let vault = lock(&state.vault);
    let key = vault
        .session_key
        .as_ref()
        .ok_or_else(|| "Vault is locked — unlock to encrypt files".to_string())?;
    let rootsnap = local_fs::snapshot(&roots);
    let src = local_fs::resolve_in_roots(&rootsnap, Path::new(&req.path))?;
    let dst = if let Some(out) = req.output_path.filter(|p| !p.is_empty()) {
        local_fs::resolve_in_roots(&rootsnap, Path::new(&out))?
    } else {
        let name = format!(
            "{}.cbenc",
            src.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("file")
        );
        local_fs::resolve_in_roots(&rootsnap, &src.with_file_name(name))?
    };
    crypto::encrypt_file_stream(&src, &dst, key).map_err(|e| e.to_string())
}

/// Stream-decrypt a CBSTRM01 vault file to an allowed local path.
#[tauri::command]
pub fn decrypt_session_file(
    req: SessionDecryptFileRequest,
    state: State<'_, AppState>,
    roots: State<'_, LocalRoots>,
) -> Result<StreamEncryptResult, String> {
    let vault = lock(&state.vault);
    let key = vault
        .session_key
        .as_ref()
        .ok_or_else(|| "Vault is locked — unlock to decrypt files".to_string())?;
    let src = local_fs::resolve_in_roots(&local_fs::snapshot(&roots), Path::new(&req.path))?;
    let dst = local_fs::resolve_in_roots(&local_fs::snapshot(&roots), Path::new(&req.output_path))?;
    let (size, hash) = crypto::decrypt_file_stream(&src, &dst, key).map_err(|e| e.to_string())?;
    Ok(StreamEncryptResult {
        output_path: dst.to_string_lossy().into_owned(),
        salt: String::new(),
        key_fingerprint: crypto::compute_key_fingerprint(key),
        sha256_checksum: hash,
        size_bytes: size,
        chunk_count: 0,
        algorithm: "AES-256-GCM-STREAM".into(),
    })
}

#[tauri::command]
pub fn compute_sha256_checksum(content: String) -> String {
    crypto::compute_sha256(content.as_bytes())
}

#[tauri::command]
pub fn get_storage_overview(state: State<'_, AppState>) -> StorageStats {
    let storage = lock(&state.storage);
    storage.get_stats()
}

#[tauri::command]
pub fn list_cloud_accounts(state: State<'_, AppState>) -> Vec<CloudAccount> {
    let storage = lock(&state.storage);
    storage.accounts.clone()
}

fn vault_file(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(vault_store::VAULT_FILE))
        .map_err(|e| format!("Could not find the app data folder: {e}"))
}

#[tauri::command]
pub fn unlock_sovereign_vault(
    passphrase: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    crypto::validate_passphrase(&passphrase).map_err(|e| e.to_string())?;
    let path = vault_file(&app)?;
    let mut vault = lock(&state.vault);

    if vault.verifier.is_none() {
        vault.verifier = vault_store::load(&path)?;
    }

    match &vault.verifier {
        Some(verifier) => {
            if !crypto::verify_passphrase(verifier, &passphrase) {
                return Err("Incorrect passphrase".into());
            }
            let key = crypto::derive_session_key(&passphrase, verifier.salt(), verifier.iterations());
            vault.set_session(key);
        }
        None => {
            let verifier = crypto::create_verifier(&passphrase).map_err(|e| e.to_string())?;
            // Save first, so the vault is never unlocked with a passphrase that was not stored.
            vault_store::save(&path, &verifier)?;
            let key = crypto::derive_session_key(&passphrase, verifier.salt(), verifier.iterations());
            vault.verifier = Some(verifier);
            vault.set_session(key);
        }
    }
    Ok(true)
}

#[tauri::command]
pub fn lock_sovereign_vault(state: State<'_, AppState>) -> bool {
    lock(&state.vault).clear_session();
    false
}

#[tauri::command]
pub fn check_vault_status(state: State<'_, AppState>) -> bool {
    lock(&state.vault).unlocked
}

#[tauri::command]
pub fn process_photo_render(req: PhotoRenderRequest) -> Result<PhotoRenderResult, String> {
    let data = B64
        .decode(req.image_base64.as_bytes())
        .map_err(|_| "Invalid base64 image data".to_string())?;
    media::process_photo_bytes(&data, &req.adjustments, &req.output_format, req.quality)
        .map_err(|e| e.to_string())
}

/// The only folder the media commands may read, write or delete in.
pub fn media_temp_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .temp_dir()
        .map_err(|e| format!("Could not find temp dir: {e}"))?
        .join("cloudbreak-media"))
}

/// Require `path` to be inside the media temp folder, so the web view cannot point these commands at other files.
fn in_media_temp(app: &AppHandle, path: &str) -> Result<std::path::PathBuf, String> {
    let temp = media_temp_dir(app)?;
    crate::local_fs::resolve_in_roots(&[temp], std::path::Path::new(path))
        .map_err(|_| "Media files must be in the app's temporary media folder".to_string())
}

/// Whether ffmpeg is available (bundled sidecar, Homebrew, or PATH).
#[tauri::command]
pub fn ffmpeg_status() -> FfmpegStatus {
    media::ffmpeg_status()
}

#[tauri::command]
pub fn trim_video_stream(
    mut req: VideoTrimRequest,
    app: AppHandle,
    roots: State<'_, crate::local_fs::LocalRoots>,
) -> Result<MediaProcessResult, String> {
    // The source is a staged copy, or a file in a folder the user added (so big videos are not copied around).
    let input = in_media_temp(&app, &req.input_path).or_else(|_| {
        crate::local_fs::resolve_in_roots(&crate::local_fs::snapshot(&roots), std::path::Path::new(&req.input_path))
            .map_err(|_| "The video must be in an added folder".to_string())
    })?;
    req.input_path = input.to_string_lossy().into_owned();
    req.output_path = in_media_temp(&app, &req.output_path)?.to_string_lossy().into_owned();
    media::trim_video_stream(&req).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageTempRequest {
    pub data_base64: String,
    pub extension: String,
}

/// Write media bytes into the app temp folder. Used to stage blob/URL downloads for ffmpeg.
#[tauri::command]
pub fn media_stage_temp(req: StageTempRequest, app: AppHandle) -> Result<String, String> {
    let data = B64
        .decode(req.data_base64.as_bytes())
        .map_err(|_| "Invalid base64 media data".to_string())?;
    if data.len() > 200 * 1024 * 1024 {
        return Err("Media file exceeds the 200 MB staging limit".into());
    }
    let temp = media_temp_dir(&app)?;
    let path = media::stage_temp_file(&temp, &data, &req.extension).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadTempRequest {
    pub path: String,
}

/// Read a staged/output media file as base64 (capped at 200 MB).
#[tauri::command]
pub fn media_read_temp(req: ReadTempRequest, app: AppHandle) -> Result<String, String> {
    let path = in_media_temp(&app, &req.path)?;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 200 * 1024 * 1024 {
        return Err("Output file exceeds the 200 MB read limit".into());
    }
    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(B64.encode(data))
}

#[tauri::command]
pub fn media_cleanup_temp(req: ReadTempRequest, app: AppHandle) -> Result<(), String> {
    let path = in_media_temp(&app, &req.path)?;
    if path.is_file() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
