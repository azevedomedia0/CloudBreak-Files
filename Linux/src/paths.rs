//! XDG paths for Cloudbreak Files on Linux.

use std::fs;
use std::path::PathBuf;

const APP_DIR: &str = "cloudbreak-files";

pub fn app_data_dir() -> PathBuf {
    let dir = dirs::data_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(APP_DIR);
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn app_config_dir() -> PathBuf {
    let dir = dirs::config_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(APP_DIR);
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn vault_path() -> PathBuf {
    app_config_dir().join(crate::vault_store::VAULT_FILE)
}
