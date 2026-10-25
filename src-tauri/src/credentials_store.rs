//! Cloud provider credentials in the OS keychain (macOS Keychain, Windows Credential Manager, etc.).
//!
//! Layout:
//! - `cloudbreak.provider.index` — JSON array of account ids
//! - `cloudbreak.provider.{accountId}` — JSON `ProviderCredentials` blob

use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const SERVICE: &str = "com.cloudbreak.files";
const INDEX_ACCOUNT: &str = "cloudbreak.provider.index";

fn entry(account: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, account).map_err(map_err)
}

fn map_err(err: KeyringError) -> String {
    match err {
        KeyringError::NoEntry => "No credential entry".into(),
        KeyringError::Ambiguous(_) => "Ambiguous credential entry".into(),
        other => format!("Keychain error: {other}"),
    }
}

fn read_secret(account: &str) -> Result<Option<String>, String> {
    match entry(account)?.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(map_err(e)),
    }
}

fn write_secret(account: &str, value: &str) -> Result<(), String> {
    entry(account)?
        .set_password(value)
        .map_err(map_err)
}

fn delete_secret(account: &str) -> Result<(), String> {
    match entry(account)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(map_err(e)),
    }
}

fn cred_account(account_id: &str) -> String {
    format!("cloudbreak.provider.{account_id}")
}

fn load_index() -> Result<Vec<String>, String> {
    match read_secret(INDEX_ACCOUNT)? {
        None => Ok(Vec::new()),
        Some(raw) => serde_json::from_str(&raw).map_err(|e| format!("Corrupt credential index: {e}")),
    }
}

fn save_index(ids: &[String]) -> Result<(), String> {
    let raw = serde_json::to_string(ids).map_err(|e| e.to_string())?;
    write_secret(INDEX_ACCOUNT, &raw)
}

/// Same shape as the TypeScript `ProviderCredentials` type (camelCase).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCredentials {
    pub account_id: String,
    pub provider: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    /// Google OAuth refresh token (and future providers).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    /// ISO-8601 expiry for `access_token` when known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    /// rclone's JSON token for a Google Drive account signed in through the bundled rclone.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rclone_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    pub updated_at: String,
}

#[tauri::command]
pub fn credentials_list() -> Result<Vec<ProviderCredentials>, String> {
    let ids = load_index()?;
    let mut out = Vec::with_capacity(ids.len());
    let mut alive = Vec::new();
    for id in ids {
        match read_secret(&cred_account(&id))? {
            Some(raw) => {
                let creds: ProviderCredentials =
                    serde_json::from_str(&raw).map_err(|e| format!("Corrupt credentials for {id}: {e}"))?;
                alive.push(id);
                out.push(creds);
            }
            None => {
                // Stale index entry — dropped when we rewrite the index below.
            }
        }
    }
    if alive.len() != load_index()?.len() {
        let _ = save_index(&alive);
    }
    Ok(out)
}

#[tauri::command]
pub fn credentials_get(account_id: String) -> Result<Option<ProviderCredentials>, String> {
    match read_secret(&cred_account(&account_id))? {
        None => Ok(None),
        Some(raw) => {
            let creds: ProviderCredentials =
                serde_json::from_str(&raw).map_err(|e| format!("Corrupt credentials: {e}"))?;
            Ok(Some(creds))
        }
    }
}

#[tauri::command]
pub fn credentials_save(creds: ProviderCredentials) -> Result<(), String> {
    if creds.account_id.trim().is_empty() {
        return Err("accountId is required".into());
    }
    // Reject unexpected large blobs (tokens shouldn't be megabytes).
    let raw = serde_json::to_string(&creds).map_err(|e| e.to_string())?;
    if raw.len() > 64 * 1024 {
        return Err("Credential payload is too large for the keychain".into());
    }
    write_secret(&cred_account(&creds.account_id), &raw)?;
    let mut ids = load_index()?;
    if !ids.iter().any(|id| id == &creds.account_id) {
        ids.push(creds.account_id.clone());
        save_index(&ids)?;
    }
    Ok(())
}

#[tauri::command]
pub fn credentials_remove(account_id: String) -> Result<(), String> {
    delete_secret(&cred_account(&account_id))?;
    let ids: Vec<String> = load_index()?
        .into_iter()
        .filter(|id| id != &account_id)
        .collect();
    save_index(&ids)?;
    Ok(())
}

#[tauri::command]
pub fn credentials_has(account_id: String) -> Result<bool, String> {
    Ok(read_secret(&cred_account(&account_id))?.is_some())
}

/// Probe whether the OS keychain is usable (used by the frontend to choose backends).
#[tauri::command]
pub fn credentials_keychain_available() -> bool {
    // Writing and deleting a throwaway probe is the most reliable check across platforms.
    let probe = "cloudbreak.provider.__probe__";
    match write_secret(probe, "ok") {
        Ok(()) => {
            let _ = delete_secret(probe);
            true
        }
        Err(_) => false,
    }
}

/// Import a JSON map (legacy localStorage dump) into the keychain. Returns how many were saved.
#[tauri::command]
pub fn credentials_import_map(map: Value) -> Result<u32, String> {
    let obj = map
        .as_object()
        .ok_or_else(|| "Expected a JSON object of credentials".to_string())?;
    let mut count = 0u32;
    for (_key, value) in obj {
        let creds: ProviderCredentials = serde_json::from_value(value.clone())
            .map_err(|e| format!("Invalid credential entry: {e}"))?;
        credentials_save(creds)?;
        count += 1;
    }
    Ok(count)
}
