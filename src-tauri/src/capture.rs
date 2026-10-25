//! System screenshot and screen recording.
//!
//! macOS uses `screencapture` and saves on the Desktop, like the system shortcuts. Linux uses the
//! first capture tool it finds (Wayland: grim/slurp, wf-recorder; X11: gnome-screenshot, spectacle,
//! scrot, ffmpeg) and saves in Pictures / Videos. A screenshot lets the user drag a region (Esc
//! cancels); a recording captures the screen until it is stopped.

use serde::Serialize;
use std::process::Child;
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Default)]
pub struct CaptureState {
    recording: Mutex<Option<(Child, String)>>,
}

#[derive(Serialize)]
pub struct RecordingToggle {
    pub recording: bool,
    /// Path of the finished movie; set when a recording was stopped.
    pub path: Option<String>,
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod platform {
    use std::process::Command;
    use tauri::{AppHandle, Manager};

    pub fn capture_path(app: &AppHandle, label: &str, extension: &str) -> Result<String, String> {
        let paths = app.path();
        #[cfg(target_os = "macos")]
        let dir = paths.desktop_dir();
        #[cfg(target_os = "linux")]
        let dir = if extension == "png" { paths.picture_dir() } else { paths.video_dir() };
        let dir = dir.or_else(|_| paths.home_dir()).map_err(|e| e.to_string())?;
        let stamp = chrono::Local::now().format("%Y-%m-%d at %H.%M.%S");
        Ok(dir.join(format!("{label} {stamp}.{extension}")).to_string_lossy().into_owned())
    }

    #[cfg(target_os = "macos")]
    pub const RECORDING_EXTENSION: &str = "mov";
    #[cfg(target_os = "linux")]
    pub const RECORDING_EXTENSION: &str = "mp4";

    #[cfg(target_os = "macos")]
    pub fn screenshot_command(path: &str) -> Result<Command, String> {
        let mut cmd = Command::new("/usr/sbin/screencapture");
        cmd.args(["-i", path]);
        Ok(cmd)
    }

    #[cfg(target_os = "macos")]
    pub fn recording_command(path: &str) -> Result<Command, String> {
        let mut cmd = Command::new("/usr/sbin/screencapture");
        cmd.args(["-v", path]);
        Ok(cmd)
    }

    #[cfg(target_os = "linux")]
    fn find_tool(name: &str) -> Option<std::path::PathBuf> {
        std::env::split_paths(&std::env::var_os("PATH")?)
            .map(|dir| dir.join(name))
            .find(|candidate| candidate.is_file())
    }

    #[cfg(target_os = "linux")]
    fn is_wayland() -> bool {
        std::env::var_os("WAYLAND_DISPLAY").is_some()
    }

    #[cfg(target_os = "linux")]
    pub fn in_flatpak() -> bool {
        std::env::var_os("FLATPAK").is_some() || std::path::Path::new("/.flatpak-info").exists()
    }

    #[cfg(target_os = "linux")]
    const FLATPAK_RECORDING_UNSUPPORTED: &str =
        "Screen recording is not available in the Flatpak build yet: the sandbox cannot reach a screen recorder.";

    /// `%XX` escapes in a `file://` URI back to bytes.
    #[cfg(target_os = "linux")]
    fn uri_to_path(uri: &str) -> String {
        let raw = uri.strip_prefix("file://").unwrap_or(uri).as_bytes();
        let mut out = Vec::with_capacity(raw.len());
        let mut i = 0;
        while i < raw.len() {
            if raw[i] == b'%' && i + 2 < raw.len() {
                if let Ok(byte) = u8::from_str_radix(&String::from_utf8_lossy(&raw[i + 1..i + 3]), 16) {
                    out.push(byte);
                    i += 3;
                    continue;
                }
            }
            out.push(raw[i]);
            i += 1;
        }
        String::from_utf8_lossy(&out).into_owned()
    }

    /// Screenshot through the desktop portal, which works inside the Flatpak sandbox: the portal shows its own
    /// region picker and hands back a file, which is copied to `dest`. `Ok(false)` when the user cancelled.
    #[cfg(target_os = "linux")]
    pub fn portal_screenshot(dest: &str) -> Result<bool, String> {
        use std::io::{BufRead, BufReader};
        use std::process::Stdio;
        use std::sync::mpsc;
        use std::time::Duration;

        let token = format!("cloudbreak{}", std::process::id());
        let mut monitor = Command::new("gdbus")
            .args(["monitor", "--session", "--dest", "org.freedesktop.portal.Desktop"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Could not reach the screenshot portal (gdbus): {e}"))?;
        let stdout = monitor.stdout.take().ok_or("The screenshot portal gave no output.")?;
        let (tx, rx) = mpsc::channel::<String>();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if line.contains("Request.Response") && tx.send(line).is_err() {
                    break;
                }
            }
        });
        // Let the monitor subscribe before the request, so the answer is not missed.
        std::thread::sleep(Duration::from_millis(300));

        let options = format!("{{'interactive': <true>, 'handle_token': <'{token}'>}}");
        let call = Command::new("gdbus")
            .args([
                "call", "--session",
                "--dest", "org.freedesktop.portal.Desktop",
                "--object-path", "/org/freedesktop/portal/desktop",
                "--method", "org.freedesktop.portal.Screenshot.Screenshot",
                "", options.as_str(),
            ])
            .output();
        let outcome = match call {
            Ok(out) if out.status.success() => rx
                .recv_timeout(Duration::from_secs(300))
                .map_err(|_| "The screenshot portal did not answer.".to_string()),
            Ok(out) => Err(format!("The screenshot portal refused: {}", String::from_utf8_lossy(&out.stderr).trim())),
            Err(e) => Err(format!("Could not call the screenshot portal: {e}")),
        };
        let _ = monitor.kill();
        let _ = monitor.wait();

        let line = outcome?;
        // Response (0, {'uri': <'file:///…'>}): 0 means a picture was taken; 1 or 2 means cancelled or failed.
        if !line.contains("(uint32 0,") && !line.contains("(0,") {
            return Ok(false);
        }
        let uri = line
            .split("'uri': <'")
            .nth(1)
            .and_then(|rest| rest.split('\'').next())
            .ok_or("The screenshot portal did not return a file.")?;
        std::fs::copy(uri_to_path(uri), dest).map_err(|e| format!("Could not save the screenshot: {e}"))?;
        Ok(true)
    }

    #[cfg(target_os = "linux")]
    pub fn screenshot_command(path: &str) -> Result<Command, String> {        let has = |name: &str| find_tool(name).is_some();
        let mut cmd;
        if is_wayland() && has("grim") && has("slurp") {
            // grim needs the region from slurp; run both through a shell so Esc in slurp cancels.
            cmd = Command::new("sh");
            cmd.args(["-c", "grim -g \"$(slurp)\" \"$1\"", "sh", path]);
        } else if has("gnome-screenshot") {
            cmd = Command::new("gnome-screenshot");
            cmd.args(["-a", "-f", path]);
        } else if has("spectacle") {
            cmd = Command::new("spectacle");
            cmd.args(["-b", "-r", "-n", "-o", path]);
        } else if has("scrot") {
            cmd = Command::new("scrot");
            cmd.args(["-s", path]);
        } else {
            return Err("No screenshot tool found. Install gnome-screenshot, spectacle, scrot, or grim and slurp.".into());
        }
        Ok(cmd)
    }

    #[cfg(target_os = "linux")]
    pub fn recording_command(path: &str) -> Result<Command, String> {
        if in_flatpak() {
            return Err(FLATPAK_RECORDING_UNSUPPORTED.into());
        }
        let has = |name: &str| find_tool(name).is_some();
        let mut cmd;
        if is_wayland() && has("wf-recorder") {
            cmd = Command::new("wf-recorder");
            cmd.args(["-f", path]);
        } else if !is_wayland() && has("ffmpeg") {
            let display = std::env::var("DISPLAY").unwrap_or_else(|_| ":0".into());
            cmd = Command::new("ffmpeg");
            cmd.args([
                "-y", "-loglevel", "error", "-f", "x11grab", "-framerate", "30", "-i", &display,
                "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", path,
            ]);
        } else if is_wayland() {
            return Err("Screen recording on Wayland needs wf-recorder. Install it and try again.".into());
        } else {
            return Err("Screen recording needs ffmpeg. Install it and try again.".into());
        }
        Ok(cmd)
    }
}

/// Takes a screenshot of a region the user selects. `None` when they cancelled.
#[tauri::command]
pub async fn capture_screenshot(app: AppHandle) -> Result<Option<String>, String> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let path = platform::capture_path(&app, "Cloudbreak Screenshot", "png")?;
        // Inside the Flatpak sandbox the portal is the way to take a screenshot.
        #[cfg(target_os = "linux")]
        if platform::in_flatpak() {
            let target = path.clone();
            let taken = tauri::async_runtime::spawn_blocking(move || platform::portal_screenshot(&target))
                .await
                .map_err(|e| e.to_string())??;
            return Ok(taken.then_some(path));
        }
        let mut cmd = platform::screenshot_command(&path)?;
        let status = tauri::async_runtime::spawn_blocking(move || cmd.status())
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| format!("Could not start the screenshot tool: {e}"))?;
        // Cancelling (Esc) exits without writing a file.
        if status.success() && std::path::Path::new(&path).exists() {
            return Ok(Some(path));
        }
        Ok(None)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = app;
        Err("Screenshots are only available on macOS and Linux.".into())
    }
}

/// Starts a screen recording, or stops the one that is running and returns the movie's path.
#[tauri::command]
pub fn capture_recording_toggle(
    app: AppHandle,
    state: State<'_, CaptureState>,
) -> Result<RecordingToggle, String> {
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let mut running = state.recording.lock().map_err(|e| e.to_string())?;
        if let Some((mut child, path)) = running.take() {
            // The tool finishes the movie when it gets an interrupt (like Ctrl-C).
            let _ = std::process::Command::new("kill").args(["-INT", &child.id().to_string()]).status();
            child.wait().map_err(|e| e.to_string())?;
            return Ok(RecordingToggle { recording: false, path: Some(path) });
        }
        let path = platform::capture_path(&app, "Cloudbreak Recording", platform::RECORDING_EXTENSION)?;
        let child = platform::recording_command(&path)?
            .spawn()
            .map_err(|e| format!("Could not start the recording tool: {e}"))?;
        *running = Some((child, path));
        Ok(RecordingToggle { recording: true, path: None })
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    {
        let _ = (app, state);
        Err("Screen recording is only available on macOS and Linux.".into())
    }
}
