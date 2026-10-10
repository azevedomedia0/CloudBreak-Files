pub mod cloud_http;
pub mod commands;
pub mod credentials_store;
pub mod crypto;
pub mod local_fs;
pub mod macos_full_disk_access;
#[cfg(target_os = "macos")]
pub mod macos_local_network;
pub mod mounted_volumes;
pub mod media;
pub mod preview;
pub mod p2p;
pub mod system_search;
pub mod selftest;
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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            storage: Mutex::new(StorageManager::new()),
            vault: Mutex::new(VaultState::default()),
        })
        .manage(P2pState::default())
        .manage(TerminalState::default())
        .manage(LocalRoots::default())
        .setup(|app| {
            local_fs::restore_roots(app.handle(), &app.state::<LocalRoots>());
            // Build the tray after the event loop starts so the main window can appear first.
            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                    let for_tray = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        if let Err(err) = tray::build_tray(&for_tray) {
                            eprintln!("tray icon failed: {err}");
                        }
                    });
                });
            }
            // macOS privacy: Local Network, Files and Folders prompts, then Full Disk Access Settings.
            // Delay past first paint so TCC dialogs do not compete with window show.
            #[cfg(target_os = "macos")]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    let data_dir = handle.path().app_data_dir().ok();
                    let write_marker = |name: &str| {
                        if let Some(dir) = &data_dir {
                            let _ = std::fs::create_dir_all(dir);
                            let _ = std::fs::write(dir.join(name), b"1");
                        }
                    };
                    let has_marker = |name: &str| -> bool {
                        data_dir.as_ref().map(|d| d.join(name).exists()).unwrap_or(false)
                    };

                    // Files and Folders: Desktop, Documents, Downloads, Movies, Photos, Applications.
                    if !has_marker("files_folders_nudged.flag") {
                        macos_full_disk_access::nudge_files_and_folders_prompts();
                        write_marker("files_folders_nudged.flag");
                    }

                    macos_local_network::request_access();
                    // Short-lived helpers can miss the Local Network alert; linger briefly.
                    std::thread::sleep(std::time::Duration::from_secs(2));

                    // Full Disk Access has no system dialog — open Settings once per install if missing.
                    if !macos_full_disk_access::has_full_disk_access()
                        && !has_marker("fda_settings_opened.flag")
                    {
                        let _ = macos_full_disk_access::open_settings();
                        write_marker("fda_settings_opened.flag");
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::encrypt_data,
            commands::decrypt_data,
            commands::encrypt_session_data,
            commands::decrypt_session_data,
            commands::encrypt_session_file,
            commands::decrypt_session_file,
            commands::compute_sha256_checksum,
            commands::get_storage_overview,
            commands::list_cloud_accounts,
            commands::unlock_sovereign_vault,
            commands::lock_sovereign_vault,
            commands::check_vault_status,
            commands::process_photo_render,
            commands::ffmpeg_status,
            commands::trim_video_stream,
            commands::media_stage_temp,
            commands::media_read_temp,
            commands::media_cleanup_temp,
            cloud_http::cloud_http,
            credentials_store::credentials_list,
            credentials_store::credentials_get,
            credentials_store::credentials_save,
            credentials_store::credentials_remove,
            credentials_store::credentials_has,
            credentials_store::credentials_keychain_available,
            credentials_store::credentials_import_map,
            selftest::selftest_dir,
            selftest::selftest_make_fixtures,
            selftest::selftest_allow_folder,
            selftest::selftest_read_app_file,
            selftest::selftest_app_data_dir,
            selftest::selftest_finish,
            selftest::selftest_window_buttons,
            local_fs::local_pick_folder,
            local_fs::local_pick_save_folder,
            local_fs::local_trash_file,
            local_fs::local_save_from_temp,
            local_fs::local_list_folders,
            local_fs::local_remember_folder,
            local_fs::local_ensure_standard_folders,
            local_fs::local_forget_folder,
            local_fs::local_scan_folder,
            local_fs::local_read_file,
            local_fs::local_write_file,
            local_fs::local_write_text,
            local_fs::local_rename_file,
            preview::local_file_thumbnail,
            preview::local_file_raster,
            preview::local_open_with_default,
            system_search::system_search,
            system_search::system_search_clear,
            mounted_volumes::list_sidebar_volumes,
            mounted_volumes::probe_network_server,
            mounted_volumes::open_network_share,
            mounted_volumes::eject_volume,
            macos_full_disk_access::macos_full_disk_access_status,
            macos_full_disk_access::macos_request_full_disk_access,
            p2p::commands::p2p_get_identity,
            p2p::commands::p2p_create_library,
            p2p::commands::p2p_accept_invite,
            p2p::commands::p2p_export_invite,
            p2p::commands::p2p_list_libraries,
            p2p::commands::p2p_start_seeding,
            p2p::commands::p2p_swarm_status,
            p2p::commands::p2p_read_file,
            p2p::commands::p2p_stream_chunk,
            p2p::commands::p2p_materialize_file,
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
