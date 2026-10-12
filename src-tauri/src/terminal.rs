//! Interactive PTY shell sessions (macOS Terminal–style zsh/bash).
//! Output is streamed to the webview via `terminal-data` / `terminal-exit` events.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

const EVENT_DATA: &str = "terminal-data";
const EVENT_EXIT: &str = "terminal-exit";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalDataPayload {
    id: String,
    /// Raw output bytes, base64 encoded. Sent as bytes so a multi-byte character split across two reads
    /// reaches the terminal intact instead of being replaced with a placeholder.
    data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalExitPayload {
    id: String,
    code: Option<i32>,
}

struct TerminalSession {
    /// The shell's process id, used to look up its working directory.
    pid: Option<u32>,
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
}

pub struct TerminalState {
    sessions: Mutex<HashMap<String, Arc<TerminalSession>>>,
}

impl Default for TerminalState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(target_os = "windows") {
            "powershell.exe".into()
        } else {
            "/bin/zsh".into()
        }
    })
}

fn default_cwd(cwd: Option<String>) -> String {
    if let Some(c) = cwd.filter(|s| !s.trim().is_empty()) {
        return c;
    }
    std::env::var("HOME").unwrap_or_else(|_| "/".into())
}

#[tauri::command]
pub fn terminal_create(
    app: AppHandle,
    state: State<'_, TerminalState>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<String, String> {
    let cols = cols.max(20);
    let rows = rows.max(5);
    let cwd = default_cwd(cwd);
    let shell = default_shell();

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty failed: {e}"))?;

    let mut cmd = CommandBuilder::new(&shell);
    // Login shell so PATH / profile match Terminal.app
    if !cfg!(target_os = "windows") {
        cmd.arg("-l");
    }
    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "CloudbreakFiles");
    cmd.env("TERM_PROGRAM_VERSION", env!("CARGO_PKG_VERSION"));
    // Terminal.app gives every session an id and sets a UTF-8 locale from the system language. An app started
    // from Finder inherits neither, which shows accented and emoji text as question marks.
    cmd.env("TERM_SESSION_ID", Uuid::new_v4().to_string());
    if std::env::var("LANG").map(|v| v.trim().is_empty()).unwrap_or(true) {
        cmd.env("LANG", "en_US.UTF-8");
    }

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn {shell} failed: {e}"))?;

    let killer = child.clone_killer();
    let pid = child.process_id();

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone reader failed: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("take writer failed: {e}"))?;

    let id = Uuid::new_v4().to_string();
    let session = Arc::new(TerminalSession {
        pid,
        writer: Mutex::new(writer),
        master: Mutex::new(pair.master),
        killer: Mutex::new(killer),
    });

    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), Arc::clone(&session));

    let app_data = app.clone();
    let id_data = id.clone();
    std::thread::Builder::new()
        .name(format!("pty-read-{id}"))
        .spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = B64.encode(&buf[..n]);
                        let _ = app_data.emit(
                            EVENT_DATA,
                            TerminalDataPayload {
                                id: id_data.clone(),
                                data,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }
        })
        .map_err(|e| format!("reader thread failed: {e}"))?;

    let app_exit = app.clone();
    let id_exit = id.clone();
    std::thread::Builder::new()
        .name(format!("pty-wait-{id}"))
        .spawn(move || {
            let code = match child.wait() {
                Ok(status) => Some(status.exit_code() as i32),
                Err(_) => None,
            };
            let _ = app_exit.emit(
                EVENT_EXIT,
                TerminalExitPayload {
                    id: id_exit.clone(),
                    code,
                },
            );
        })
        .map_err(|e| format!("wait thread failed: {e}"))?;

    Ok(id)
}

#[tauri::command]
pub fn terminal_write(state: State<'_, TerminalState>, id: String, data: String) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("unknown terminal session {id}"))?;
    let mut writer = session.writer.lock().map_err(|e| e.to_string())?;
    writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("write failed: {e}"))?;
    writer.flush().map_err(|e| format!("flush failed: {e}"))?;
    Ok(())
}

/// Raw bytes from the terminal (mouse reports and other non-text input), base64 encoded.
#[tauri::command]
pub fn terminal_write_binary(state: State<'_, TerminalState>, id: String, data: String) -> Result<(), String> {
    let bytes = B64.decode(data.as_bytes()).map_err(|_| "invalid terminal data".to_string())?;
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("unknown terminal session {id}"))?;
    let mut writer = session.writer.lock().map_err(|e| e.to_string())?;
    writer.write_all(&bytes).map_err(|e| format!("write failed: {e}"))?;
    writer.flush().map_err(|e| format!("flush failed: {e}"))?;
    Ok(())
}

/// The shell's current working directory, so a new tab can open where the old one is (as in Terminal.app).
#[tauri::command]
pub fn terminal_cwd(state: State<'_, TerminalState>, id: String) -> Result<Option<String>, String> {
    let pid = {
        let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        sessions.get(&id).and_then(|s| s.pid)
    };
    Ok(pid.and_then(cwd_of_process))
}

/// First path from `lsof -Fn` output: lines are tagged, and the working directory is the `n` line.
fn parse_lsof_cwd(output: &str) -> Option<String> {
    output
        .lines()
        .find_map(|line| line.strip_prefix('n'))
        .map(str::trim)
        .filter(|p| p.starts_with('/'))
        .map(str::to_string)
}

#[cfg(target_os = "linux")]
fn cwd_of_process(pid: u32) -> Option<String> {
    std::fs::read_link(format!("/proc/{pid}/cwd")).ok().map(|p| p.to_string_lossy().into_owned())
}

#[cfg(target_os = "macos")]
fn cwd_of_process(pid: u32) -> Option<String> {
    let out = std::process::Command::new("/usr/sbin/lsof")
        .args(["-a", "-d", "cwd", "-Fn", "-p", &pid.to_string()])
        .output()
        .ok()?;
    parse_lsof_cwd(&String::from_utf8_lossy(&out.stdout))
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn cwd_of_process(_pid: u32) -> Option<String> {
    None
}

/// Open a link from the terminal in the default browser. Only web and mail links are opened.
#[tauri::command]
pub fn terminal_open_url(url: String) -> Result<(), String> {
    let allowed = ["http://", "https://", "mailto:"];
    let lower = url.trim().to_ascii_lowercase();
    if !allowed.iter().any(|p| lower.starts_with(p)) || url.chars().any(|c| c.is_control()) {
        return Err("Only http, https and mailto links can be opened".into());
    }
    crate::oauth_google::open_system_browser(url.trim())
}

#[tauri::command]
pub fn terminal_resize(
    state: State<'_, TerminalState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let cols = cols.max(20);
    let rows = rows.max(5);
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("unknown terminal session {id}"))?;
    let master = session.master.lock().map_err(|e| e.to_string())?;
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("resize failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn terminal_kill(state: State<'_, TerminalState>, id: String) -> Result<(), String> {
    let session = {
        let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        sessions.remove(&id)
    };
    if let Some(session) = session {
        if let Ok(mut killer) = session.killer.lock() {
            let _ = killer.kill();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lsof_output_gives_the_working_directory() {
        let out = "p4242\nfcwd\nn/Users/sa/My Projects\n";
        assert_eq!(parse_lsof_cwd(out).as_deref(), Some("/Users/sa/My Projects"));
        assert_eq!(parse_lsof_cwd(""), None);
        assert_eq!(parse_lsof_cwd("p1\nfcwd\nnrelative/path\n"), None);
    }

    #[test]
    fn only_web_and_mail_links_open() {
        assert!(terminal_open_url("file:///etc/passwd".into()).is_err());
        assert!(terminal_open_url("javascript:alert(1)".into()).is_err());
        assert!(terminal_open_url("https://example.org\nrm".into()).is_err());
    }

    #[test]
    fn split_multibyte_output_survives_base64() {
        // "é" is two bytes; a read boundary between them used to turn both halves into replacement characters.
        let bytes = "café".as_bytes();
        let (a, b) = bytes.split_at(4);
        let joined: Vec<u8> = [B64.decode(B64.encode(a)).unwrap(), B64.decode(B64.encode(b)).unwrap()].concat();
        assert_eq!(String::from_utf8(joined).unwrap(), "café");
    }
}
