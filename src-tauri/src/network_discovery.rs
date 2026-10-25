//! Nearby SMB servers, found with Bonjour (`_smb._tcp`), for the Connect to Network Server panel.
//!
//! macOS ships `dns-sd`, which browses Bonjour and resolves a name to a host and port. It is run
//! for a few seconds and stopped, so nothing is left running. Other platforms get an empty list,
//! and the panel says so.

use serde::Serialize;
use std::process::Stdio;
use std::time::Duration;
#[cfg(target_os = "macos")]
use tokio::io::{AsyncBufReadExt, BufReader};
#[cfg(target_os = "macos")]
use tokio::process::Command;
#[cfg(target_os = "macos")]
use tokio::time::{timeout_at, Instant};

const SMB_TYPE: &str = "_smb._tcp";
const BROWSE_FOR: Duration = Duration::from_secs(4);
const RESOLVE_FOR: Duration = Duration::from_secs(2);
const MAX_SERVERS: usize = 20;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NearbyServer {
    pub name: String,
    /// The host name Bonjour gives, e.g. `nas.local`.
    pub host: String,
    pub port: u16,
    pub protocol: String,
}

/// Instance names from `dns-sd -B` output. Only `Add` lines count; `Rmv` means the service left.
/// Names can contain spaces, so each one is everything after the service type.
pub fn parse_browse(output: &str) -> Vec<String> {
    let marker = format!("{SMB_TYPE}.");
    let mut names: Vec<String> = Vec::new();
    for line in output.lines() {
        if !line.split_whitespace().any(|token| token == "Add") {
            continue;
        }
        let Some(at) = line.find(&marker) else { continue };
        let name = line[at + marker.len()..].trim().to_string();
        if !name.is_empty() && !names.contains(&name) {
            names.push(name);
        }
    }
    names
}

/// The host and port from `dns-sd -L` output, which reads `... can be reached at nas.local.:445 ...`.
pub fn parse_resolve(output: &str) -> Option<(String, u16)> {
    let rest = output.split("can be reached at ").nth(1)?;
    let target = rest.split_whitespace().next()?;
    let (host, port) = target.rsplit_once(':')?;
    let host = host.trim_end_matches('.');
    let port: u16 = port.parse().ok()?;
    if host.is_empty() {
        return None;
    }
    Some((host.to_string(), port))
}

/// Run `dns-sd` for `limit`, then stop it. Returns the lines it printed in that time.
#[cfg(target_os = "macos")]
async fn run_for(args: &[&str], limit: Duration) -> String {
    let Ok(mut child) = Command::new("/usr/bin/dns-sd")
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
    else {
        return String::new();
    };
    let Some(stdout) = child.stdout.take() else { return String::new() };
    // Line by line, so output read before the deadline is kept.
    let mut lines = BufReader::new(stdout).lines();
    let deadline = Instant::now() + limit;
    let mut text = String::new();
    while let Ok(Ok(Some(line))) = timeout_at(deadline, lines.next_line()).await {
        text.push_str(&line);
        text.push('\n');
    }
    let _ = child.kill().await;
    text
}

#[cfg(target_os = "macos")]
async fn discover() -> Vec<NearbyServer> {
    let browsed = run_for(&["-B", SMB_TYPE, "local."], BROWSE_FOR).await;
    let mut found = Vec::new();
    for name in parse_browse(&browsed).into_iter().take(MAX_SERVERS) {
        let resolved = run_for(&["-L", &name, SMB_TYPE, "local."], RESOLVE_FOR).await;
        if let Some((host, port)) = parse_resolve(&resolved) {
            found.push(NearbyServer { name, host, port, protocol: "SMB".into() });
        }
    }
    found
}

#[cfg(not(target_os = "macos"))]
async fn discover() -> Vec<NearbyServer> {
    Vec::new()
}

/// Nearby SMB servers, found in a few seconds. Empty when none answer or on non-macOS platforms.
#[tauri::command]
pub async fn discover_network_servers() -> Vec<NearbyServer> {
    discover().await
}

#[cfg(test)]
mod tests {
    use super::*;

    const BROWSE: &str = "Browsing for _smb._tcp.local.
DATE: ---Sat 11 Oct 2026---
20:01:02.001  ...STARTING...
Timestamp     A/R    Flags  if Domain               Service Type         Instance Name
20:01:02.512  Add        2  14 local.               _smb._tcp.           Studio NAS
20:01:02.513  Add        3  14 local.               _smb._tcp.           Studio NAS
20:01:02.520  Add        2  14 local.               _smb._tcp.           Office Mac Mini
20:01:03.100  Rmv        0  14 local.               _smb._tcp.           Old Printer
";

    #[test]
    fn browse_lists_each_added_instance_once_with_spaces_kept() {
        assert_eq!(parse_browse(BROWSE), vec!["Studio NAS", "Office Mac Mini"]);
    }

    #[test]
    fn browse_with_nothing_found_is_empty() {
        assert!(parse_browse("Browsing for _smb._tcp.local.\n").is_empty());
        assert!(parse_browse("").is_empty());
    }

    #[test]
    fn resolve_reads_host_and_port() {
        let out = "Lookup Studio NAS._smb._tcp.local.
DATE: ---Sat 11 Oct 2026---
20:01:05.000  Studio\\032NAS._smb._tcp.local. can be reached at studio-nas.local.:445 (interface 14)
";
        assert_eq!(parse_resolve(out), Some(("studio-nas.local".into(), 445)));
    }

    #[test]
    fn resolve_without_an_answer_is_none() {
        assert_eq!(parse_resolve("Lookup x\n"), None);
        assert_eq!(parse_resolve("can be reached at :445"), None);
        assert_eq!(parse_resolve("can be reached at host.local.:notaport"), None);
    }
}
