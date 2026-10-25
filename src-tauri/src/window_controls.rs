//! Show or hide the native window buttons (close, minimize, zoom) on macOS.
//!
//! Full-screen panels such as the video player and photo editor draw their own header, and the
//! overlay title bar leaves the real buttons floating over it. The web view hides them while such a
//! panel is open and shows them again afterwards.

use tauri::AppHandle;

#[tauri::command]
pub fn set_window_controls_hidden(app: AppHandle, hidden: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSWindow, NSWindowButton};
        use tauri::Manager;

        let window = app.get_webview_window("main").ok_or("no main window")?;
        let ns_window = window.ns_window().map_err(|e| e.to_string())? as usize;
        window
            .run_on_main_thread(move || {
                // AppKit must be used on the main thread, which is where this closure runs.
                let ns: &NSWindow = unsafe { &*(ns_window as *mut NSWindow) };
                for kind in [
                    NSWindowButton::CloseButton,
                    NSWindowButton::MiniaturizeButton,
                    NSWindowButton::ZoomButton,
                ] {
                    if let Some(button) = ns.standardWindowButton(kind) {
                        button.setHidden(hidden);
                    }
                }
            })
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, hidden);
        Ok(())
    }
}
