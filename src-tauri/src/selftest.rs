//! Helpers for the in-app self-test (`src/selftest.ts`). Debug builds only: in a release build every
//! command here just returns an error, and the web side of the self-test is not bundled at all.
//!
//! Run it with a throwaway app data folder so a real vault or folder list is never touched:
//! `CLOUDBREAK_SELFTEST_DIR=/tmp/cb-selftest npm run tauri dev -- --config '{"identifier":"com.cloudbreak.files.selftest"}'`

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::local_fs::LocalRoots;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fixtures {
    pub dir: String,
    pub text: String,
    pub html: String,
    pub markdown: String,
    pub word: String,
    pub png: String,
    pub video: String,
    pub audio: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowButtons {
    /// Left edge of the close button and right edge of the zoom button, in points from the window's left edge.
    pub min_x: f64,
    pub max_x: f64,
    pub window_width: f64,
}

#[cfg(debug_assertions)]
mod imp {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use tauri::Manager;

    pub fn work_dir() -> Option<PathBuf> {
        std::env::var_os("CLOUDBREAK_SELFTEST_DIR").map(PathBuf::from)
    }

    fn wav_bytes() -> Vec<u8> {
        let rate: u32 = 8000;
        let samples: Vec<i16> = (0..rate)
            .map(|i| ((i as f32 * 440.0 * std::f32::consts::TAU / rate as f32).sin() * 8000.0) as i16)
            .collect();
        let data_len = (samples.len() * 2) as u32;
        let mut out = Vec::with_capacity(44 + data_len as usize);
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(36 + data_len).to_le_bytes());
        out.extend_from_slice(b"WAVEfmt ");
        out.extend_from_slice(&16u32.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&rate.to_le_bytes());
        out.extend_from_slice(&(rate * 2).to_le_bytes());
        out.extend_from_slice(&2u16.to_le_bytes());
        out.extend_from_slice(&16u16.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&data_len.to_le_bytes());
        for s in samples {
            out.extend_from_slice(&s.to_le_bytes());
        }
        out
    }

    pub fn make_fixtures(dir: &Path) -> Result<Fixtures, String> {
        let _ = fs::remove_dir_all(dir);
        fs::create_dir_all(dir.join("sub")).map_err(|e| e.to_string())?;
        let p = |name: &str| dir.join(name).to_string_lossy().into_owned();

        fs::write(dir.join("notes.txt"), "line one\nline two\n").map_err(|e| e.to_string())?;
        fs::write(dir.join("page.html"), "<h1>Title</h1><p>Body</p>").map_err(|e| e.to_string())?;
        fs::write(dir.join("sub/inner.md"), "# Inner\n").map_err(|e| e.to_string())?;
        fs::write(dir.join("report.docx"), b"PK-not-really-a-docx").map_err(|e| e.to_string())?;
        fs::write(dir.join("song.wav"), wav_bytes()).map_err(|e| e.to_string())?;

        let img = image::RgbaImage::from_fn(64, 48, |x, y| image::Rgba([(x * 4) as u8, (y * 5) as u8, 128, 255]));
        img.save(dir.join("photo.png")).map_err(|e| e.to_string())?;

        let ffmpeg = crate::media::find_ffmpeg().map_err(|e| e.to_string())?;
        let status = std::process::Command::new(ffmpeg)
            .args(["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=3:size=160x120:rate=15", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-pix_fmt", "yuv420p", "-shortest"])
            .arg(dir.join("clip.mp4"))
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("ffmpeg could not make the test video".into());
        }

        Ok(Fixtures {
            dir: dir.to_string_lossy().into_owned(),
            text: p("notes.txt"),
            html: p("page.html"),
            markdown: p("sub/inner.md"),
            word: p("report.docx"),
            png: p("photo.png"),
            video: p("clip.mp4"),
            audio: p("song.wav"),
        })
    }

    pub fn read_app_file(app: &AppHandle, name: &str) -> Result<Option<String>, String> {
        if name.contains('/') || name.contains("..") {
            return Err("bad name".into());
        }
        let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join(name);
        match fs::read_to_string(path) {
            Ok(t) => Ok(Some(t)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn app_data_dir(app: &AppHandle) -> Result<String, String> {
        Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.to_string_lossy().into_owned())
    }
}

/// The folder to run the self-test in, or `None` when the self-test is not enabled.
#[tauri::command]
pub fn selftest_dir() -> Option<String> {
    #[cfg(debug_assertions)]
    {
        imp::work_dir().map(|d| d.to_string_lossy().into_owned())
    }
    #[cfg(not(debug_assertions))]
    {
        None
    }
}

#[tauri::command]
pub fn selftest_make_fixtures() -> Result<Fixtures, String> {
    #[cfg(debug_assertions)]
    {
        let dir = imp::work_dir().ok_or("self-test is not enabled")?.join("files");
        imp::make_fixtures(&dir)
    }
    #[cfg(not(debug_assertions))]
    {
        Err("not available in release builds".into())
    }
}

/// Allow a folder without the native dialog, the same way picking one does.
#[tauri::command]
pub fn selftest_allow_folder(path: String, app: AppHandle, state: State<'_, LocalRoots>) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        let _ = imp::work_dir().ok_or("self-test is not enabled")?;
        crate::local_fs::allow_folder_for_selftest(&app, &state, std::path::PathBuf::from(path))
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = (path, app, state);
        Err("not available in release builds".into())
    }
}

#[tauri::command]
pub fn selftest_read_app_file(name: String, app: AppHandle) -> Result<Option<String>, String> {
    #[cfg(debug_assertions)]
    {
        let _ = imp::work_dir().ok_or("self-test is not enabled")?;
        imp::read_app_file(&app, &name)
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = (name, app);
        Err("not available in release builds".into())
    }
}

#[tauri::command]
pub fn selftest_app_data_dir(app: AppHandle) -> Result<String, String> {
    #[cfg(debug_assertions)]
    {
        let _ = imp::work_dir().ok_or("self-test is not enabled")?;
        imp::app_data_dir(&app)
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = app;
        Err("not available in release builds".into())
    }
}

/// Write the report next to the fixtures and quit the app.
#[tauri::command]
pub fn selftest_finish(report: String, app: AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        let dir = imp::work_dir().ok_or("self-test is not enabled")?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::write(dir.join("report.txt"), report).map_err(|e| e.to_string())?;
        app.exit(0);
        Ok(())
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = (report, app);
        Err("not available in release builds".into())
    }
}

/// Where the native close, minimize and zoom buttons sit, so the toolbar can leave the right amount of room.
#[tauri::command]
pub fn selftest_window_buttons(app: AppHandle) -> Result<WindowButtons, String> {
    #[cfg(all(debug_assertions, target_os = "macos"))]
    {
        use objc2_app_kit::{NSWindow, NSWindowButton};
        use tauri::Manager;
        let _ = imp::work_dir().ok_or("self-test is not enabled")?;
        let window = app.get_webview_window("main").ok_or("no main window")?;
        let ns_window = window.ns_window().map_err(|e| e.to_string())? as usize;
        let (tx, rx) = std::sync::mpsc::channel();
        window
            .run_on_main_thread(move || {
                // AppKit must be used on the main thread, which is where this closure runs.
                let ns: &NSWindow = unsafe { &*(ns_window as *mut NSWindow) };
                let mut min_x = f64::MAX;
                let mut max_x = 0.0f64;
                for kind in [NSWindowButton::CloseButton, NSWindowButton::MiniaturizeButton, NSWindowButton::ZoomButton] {
                    if let Some(button) = ns.standardWindowButton(kind) {
                        let frame = button.frame();
                        let in_window = match unsafe { button.superview() } {
                            Some(parent) => parent.convertRect_toView(frame, None),
                            None => frame,
                        };
                        min_x = min_x.min(in_window.origin.x);
                        max_x = max_x.max(in_window.origin.x + in_window.size.width);
                    }
                }
                let width = ns.frame().size.width;
                let _ = tx.send(WindowButtons { min_x, max_x, window_width: width });
            })
            .map_err(|e| e.to_string())?;
        rx.recv_timeout(std::time::Duration::from_secs(5)).map_err(|e| e.to_string())
    }
    #[cfg(not(all(debug_assertions, target_os = "macos")))]
    {
        let _ = app;
        Err("not available in this build".into())
    }
}
