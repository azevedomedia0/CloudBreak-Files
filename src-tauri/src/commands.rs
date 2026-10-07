use crate::crypto::{self, EncryptedAsset, PassphraseVerifier};
use crate::media::{MediaProcessResult, PhotoAdjustments, VideoTrimRequest};
use crate::storage::{CloudAccount, StorageManager, StorageStats};
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager, State};
use crate::vault_store;

/// Vault state. The verifier is saved in the app data folder. The first unlock ever sets the passphrase.
#[derive(Default)]
pub struct VaultState {
    pub verifier: Option<PassphraseVerifier>,
    pub unlocked: bool,
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
        }
        None => {
            let verifier = crypto::create_verifier(&passphrase).map_err(|e| e.to_string())?;
            // Save first, so the vault is never unlocked with a passphrase that was not stored.
            vault_store::save(&path, &verifier)?;
            vault.verifier = Some(verifier);
        }
    }
    vault.unlocked = true;
    Ok(true)
}

#[tauri::command]
pub fn lock_sovereign_vault(state: State<'_, AppState>) -> bool {
    lock(&state.vault).unlocked = false;
    false
}

#[tauri::command]
pub fn check_vault_status(state: State<'_, AppState>) -> bool {
    lock(&state.vault).unlocked
}

/// Not implemented yet. It returns an error instead of a fake success.
#[tauri::command]
pub fn process_photo_render(_adjustments: PhotoAdjustments) -> Result<String, String> {
    Err("Native photo rendering is not implemented yet".into())
}

/// Not implemented yet. It returns an error instead of a fake success.
#[tauri::command]
pub fn trim_video_stream(_req: VideoTrimRequest) -> Result<MediaProcessResult, String> {
    Err("Native video trimming is not implemented yet".into())
}
