pub mod commands;
pub mod crypto;
pub mod media;
pub mod storage;
pub mod vault_store;

use commands::{AppState, VaultState};
use std::sync::Mutex;
use storage::StorageManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            storage: Mutex::new(StorageManager::new()),
            vault: Mutex::new(VaultState::default()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::encrypt_data,
            commands::decrypt_data,
            commands::compute_sha256_checksum,
            commands::get_storage_overview,
            commands::list_cloud_accounts,
            commands::unlock_sovereign_vault,
            commands::lock_sovereign_vault,
            commands::check_vault_status,
            commands::process_photo_render,
            commands::trim_video_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AetherCloud Vault application");
}
