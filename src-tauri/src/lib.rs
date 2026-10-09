pub mod cloud_http;
pub mod commands;
pub mod crypto;
pub mod local_fs;
pub mod media;
pub mod p2p;
pub mod storage;
pub mod terminal;
pub mod tray;
pub mod vault_store;

use commands::{AppState, VaultState};
use tauri::Manager;
use local_fs::LocalRoots;
use p2p::P2pState;
use std::sync::Mutex;
use storage::StorageManager;
use terminal::TerminalState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            storage: Mutex::new(StorageManager::new()),
            vault: Mutex::new(VaultState::default()),
        })
        .manage(P2pState::default())
        .manage(TerminalState::default())
        .manage(LocalRoots::default())
        .setup(|app| {
            local_fs::restore_roots(app.handle(), &app.state::<LocalRoots>());
            #[cfg(desktop)]
            {
                if let Err(err) = tray::build_tray(app.handle()) {
                    eprintln!("tray icon failed: {err}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::encrypt_data,
            commands::decrypt_data,
            commands::encrypt_session_data,
            commands::decrypt_session_data,
            commands::compute_sha256_checksum,
            commands::get_storage_overview,
            commands::list_cloud_accounts,
            commands::unlock_sovereign_vault,
            commands::lock_sovereign_vault,
            commands::check_vault_status,
            commands::process_photo_render,
            commands::trim_video_stream,
            commands::media_stage_temp,
            commands::media_read_temp,
            commands::media_cleanup_temp,
            cloud_http::cloud_http,
            local_fs::local_pick_folder,
            local_fs::local_list_folders,
            local_fs::local_forget_folder,
            local_fs::local_scan_folder,
            local_fs::local_read_file,
            local_fs::local_write_file,
            local_fs::local_write_text,
            local_fs::local_rename_file,
            p2p::commands::p2p_get_identity,
            p2p::commands::p2p_create_library,
            p2p::commands::p2p_accept_invite,
            p2p::commands::p2p_export_invite,
            p2p::commands::p2p_list_libraries,
            p2p::commands::p2p_start_seeding,
            p2p::commands::p2p_swarm_status,
            p2p::commands::p2p_read_file,
            p2p::commands::p2p_stream_chunk,
            p2p::commands::p2p_fetch_manifest,
            tray::tray_refresh_status,
            terminal::terminal_create,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cloudbreak Files");
}
