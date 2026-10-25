//! Screen & System Audio Recording (System Settings → Privacy & Security).
//!
//! Needed for the screenshot and screen recording shortcuts. macOS shows its prompt once; after a
//! refusal the user has to turn Cloudbreak Files on in System Settings.

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

/// True when Cloudbreak Files may capture the screen and system audio.
pub fn has_screen_recording_access() -> bool {
    #[cfg(target_os = "macos")]
    {
        unsafe { CGPreflightScreenCaptureAccess() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Shows the system prompt (first time only). Returns true when access is already granted.
pub fn request_screen_recording_access() -> bool {
    #[cfg(target_os = "macos")]
    {
        unsafe { CGRequestScreenCaptureAccess() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[cfg(target_os = "macos")]
fn open_settings() -> Result<(), String> {
    let urls = [
        "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture",
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    ];
    for url in urls {
        let status = std::process::Command::new("open")
            .arg(url)
            .status()
            .map_err(|e| format!("Could not open System Settings: {e}"))?;
        if status.success() {
            return Ok(());
        }
    }
    Err("Could not open Screen & System Audio Recording in System Settings".into())
}

#[tauri::command]
pub fn macos_screen_recording_status() -> bool {
    has_screen_recording_access()
}

/// Asks macOS for access; when it was refused before, opens System Settings instead.
#[tauri::command]
pub fn macos_request_screen_recording() -> Result<bool, String> {
    if request_screen_recording_access() {
        return Ok(true);
    }
    #[cfg(target_os = "macos")]
    open_settings()?;
    Ok(false)
}
