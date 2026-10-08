//! Saves the vault passphrase verifier to disk. It holds a salted hash only, never the passphrase or a key.
use crate::crypto::PassphraseVerifier;
use std::fs;
use std::io::Write;
use std::path::Path;

pub const VAULT_FILE: &str = "vault.json";

/// Returns `Ok(None)` when no vault file exists yet. A corrupt file is an error, so it is never silently replaced.
pub fn load(path: &Path) -> Result<Option<PassphraseVerifier>, String> {
    match fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text)
            .map(Some)
            .map_err(|_| "Vault file is corrupted. Restore it from a backup or delete it to reset the vault.".to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read the vault file: {e}")),
    }
}

/// Writes to a temp file first, then renames, so a crash cannot leave a half-written file.
pub fn save(path: &Path, verifier: &PassphraseVerifier) -> Result<(), String> {
    let json = serde_json::to_string_pretty(verifier).map_err(|e| e.to_string())?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Could not create the vault folder: {e}"))?;
    }
    let tmp = path.with_extension("json.tmp");
    let write = || -> std::io::Result<()> {
        let mut file = fs::File::create(&tmp)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(fs::Permissions::from_mode(0o600))?;
        }
        file.write_all(json.as_bytes())?;
        file.sync_all()?;
        fs::rename(&tmp, path)
    };
    write().map_err(|e| format!("Could not save the vault file: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::{create_verifier, verify_passphrase};

    fn temp_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir()
            .join(format!("cloudbreak-vault-test-{}-{name}", uuid::Uuid::new_v4()))
            .join(VAULT_FILE)
    }

    #[test]
    fn missing_file_is_none() {
        assert!(load(&temp_path("missing")).unwrap().is_none());
    }

    #[test]
    fn save_then_load() {
        let path = temp_path("roundtrip");
        let v = create_verifier("correct horse battery").unwrap();
        save(&path, &v).unwrap();
        let loaded = load(&path).unwrap().unwrap();
        assert!(verify_passphrase(&loaded, "correct horse battery"));
        assert!(!verify_passphrase(&loaded, "wrong passphrase"));
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn corrupt_file_is_an_error() {
        let path = temp_path("corrupt");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "not json").unwrap();
        assert!(load(&path).is_err());
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }
}
