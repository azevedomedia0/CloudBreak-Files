//! Mounted volumes for the sidebar (external drives and network shares on macOS).

use serde::Serialize;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::path::Path;
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidebarVolume {
    pub id: String,
    pub name: String,
    pub mount_point: String,
    /// `usb_drive` | `memory_card` | `thunderbolt_raid` | `network_share`
    pub volume_type: String,
    pub file_system: String,
    pub capacity_bytes: u64,
    pub free_bytes: u64,
    pub encrypted: bool,
    pub mounted: bool,
    pub ejectable: bool,
    pub connection_type: String,
    pub is_network: bool,
    /// Host or device path (for network: //server/share).
    pub source: String,
}

#[cfg(target_os = "macos")]
pub fn list_sidebar_volumes() -> Vec<SidebarVolume> {
    list_macos_volumes()
}

#[cfg(not(target_os = "macos"))]
pub fn list_sidebar_volumes() -> Vec<SidebarVolume> {
    Vec::new()
}

#[cfg(target_os = "macos")]
fn list_macos_volumes() -> Vec<SidebarVolume> {
    let mut out = Vec::new();
    unsafe {
        let mut buf: *mut libc::statfs = std::ptr::null_mut();
        let count = libc::getmntinfo(&mut buf, libc::MNT_NOWAIT);
        if count <= 0 || buf.is_null() {
            return out;
        }
        for i in 0..count as isize {
            let fs = &*buf.offset(i);
            if let Some(vol) = volume_from_statfs(fs) {
                out.push(vol);
            }
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// `sys/mount.h` — not exposed by the `libc` crate on macOS.
#[cfg(target_os = "macos")]
const MNT_REMOVABLE: u32 = 0x0000_0100;

#[cfg(target_os = "macos")]
fn volume_from_statfs(fs: &libc::statfs) -> Option<SidebarVolume> {
    let mount = cstr(&fs.f_mntonname)?;
    let from = cstr(&fs.f_mntfromname).unwrap_or_default();
    let fstype = cstr(&fs.f_fstypename).unwrap_or_default();

    if is_skipped_mount(&mount, &fstype) {
        return None;
    }

    let is_network = is_network_fs(&fstype, &from);
    if !is_network && !mount.starts_with("/Volumes/") {
        return None;
    }

    let name = mount
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("Volume")
        .to_string();

    let (capacity_bytes, free_bytes) = capacity_from_statfs(fs);
    let flags = fs.f_flags as u32;
    let removable = (flags & MNT_REMOVABLE) != 0;
    let ejectable = removable || is_network || mount.starts_with("/Volumes/");

    let volume_type = if is_network {
        "network_share".to_string()
    } else if fstype.contains("apfs") && name.to_lowercase().contains("sd") {
        "memory_card".to_string()
    } else if from.contains("disk") && removable {
        "usb_drive".to_string()
    } else {
        "usb_drive".to_string()
    };

    let connection_type = if is_network {
        match fstype.as_str() {
            "nfs" => "NFS",
            "smbfs" => "SMB",
            "afpfs" => "AFP",
            _ => "Network",
        }
        .to_string()
    } else if removable {
        "USB".to_string()
    } else {
        "Local".to_string()
    };

    Some(SidebarVolume {
        id: format!("vol:{mount}"),
        name,
        mount_point: mount.clone(),
        volume_type,
        file_system: fstype,
        capacity_bytes,
        free_bytes,
        encrypted: false,
        mounted: true,
        ejectable,
        connection_type,
        is_network,
        source: from,
    })
}

#[cfg(target_os = "macos")]
fn is_skipped_mount(mount: &str, fstype: &str) -> bool {
    if mount == "/" || mount.starts_with("/System/Volumes/") {
        return true;
    }
    matches!(
        fstype,
        "devfs" | "autofs" | "fdesc" | "linprocfs" | "procfs" | "tmpfs" | "volfs"
    )
}

#[cfg(target_os = "macos")]
fn is_network_fs(fstype: &str, from: &str) -> bool {
    from.starts_with("//")
        || matches!(
            fstype,
            "smbfs" | "nfs" | "afpfs" | "webdav" | "webdavfs" | "cifs"
        )
}

#[cfg(target_os = "macos")]
fn capacity_from_statfs(fs: &libc::statfs) -> (u64, u64) {
    let bsize = fs.f_bsize as u64;
    let blocks = fs.f_blocks as u64;
    let bavail = fs.f_bavail as u64;
    (blocks.saturating_mul(bsize), bavail.saturating_mul(bsize))
}

#[cfg(target_os = "macos")]
fn cstr(bytes: &[i8]) -> Option<String> {
    let end = bytes.iter().position(|&c| c == 0).unwrap_or(bytes.len());
    if end == 0 {
        return None;
    }
    std::str::from_utf8(unsafe { std::slice::from_raw_parts(bytes.as_ptr() as *const u8, end) })
        .ok()
        .map(|s| s.to_string())
}

pub fn default_port(protocol: &str) -> u16 {
    match protocol.to_ascii_lowercase().as_str() {
        "nfs" => 2049,
        "sftp" => 22,
        "webdav" => 443,
        "https" => 443,
        "http" => 80,
        _ => 445, // SMB
    }
}

/// Extract a host name from user-entered server addresses (`host`, `host:port`, `smb://host/share`).
pub fn parse_host(address: &str) -> Option<String> {
    let trimmed = address.trim();
    if trimmed.is_empty() {
        return None;
    }
    let without_scheme = trimmed
        .split("://")
        .nth(1)
        .unwrap_or(trimmed);
    let host_part = without_scheme.split('/').next()?.split('@').last()?;
    let host = host_part.split(':').next()?.trim();
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

pub fn probe_network_server(address: &str, protocol: &str, timeout_ms: u64) -> bool {
    let Some(host) = parse_host(address) else {
        return false;
    };
    let port = parse_port(address).unwrap_or_else(|| default_port(protocol));
    probe_tcp(&host, port, timeout_ms)
}

fn parse_port(address: &str) -> Option<u16> {
    let trimmed = address.trim();
    let without_scheme = trimmed.split("://").nth(1).unwrap_or(trimmed);
    let host_part = without_scheme.split('/').next()?;
    let after_at = host_part.split('@').last()?;
    let parts: Vec<&str> = after_at.split(':').collect();
    if parts.len() >= 2 {
        parts.last()?.parse().ok()
    } else {
        None
    }
}

pub fn probe_tcp(host: &str, port: u16, timeout_ms: u64) -> bool {
    let timeout = Duration::from_millis(timeout_ms.clamp(200, 10_000));
    let addrs: Vec<SocketAddr> = match format!("{host}:{port}").to_socket_addrs() {
        Ok(iter) => iter.collect(),
        Err(_) => return false,
    };
    for addr in addrs {
        if TcpStream::connect_timeout(&addr, timeout).is_ok() {
            return true;
        }
    }
    false
}

#[cfg(target_os = "macos")]
pub fn open_network_share(protocol: &str, address: &str) -> Result<(), String> {
    let url = share_url(protocol, address)?;
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("Could not open {url}: {e}"))?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn open_network_share(_protocol: &str, _address: &str) -> Result<(), String> {
    Err("Opening network shares is only supported on macOS".into())
}

#[cfg(target_os = "macos")]
fn share_url(protocol: &str, address: &str) -> Result<String, String> {
    let trimmed = address.trim();
    if trimmed.contains("://") {
        return Ok(trimmed.to_string());
    }
    let host = parse_host(trimmed).ok_or("Enter a server address or URI")?;
    let path = trimmed
        .split("://")
        .nth(1)
        .and_then(|rest| rest.split_once('/'))
        .map(|(_, path)| path.trim_start_matches('/'))
        .filter(|p| !p.is_empty());
    let scheme = match protocol.to_ascii_lowercase().as_str() {
        "nfs" => "nfs",
        "sftp" => "sftp",
        "webdav" => "https",
        _ => "smb",
    };
    Ok(match path {
        Some(p) => format!("{scheme}://{host}/{p}"),
        None => format!("{scheme}://{host}"),
    })
}

#[cfg(target_os = "macos")]
pub fn eject_volume(mount_point: &str) -> Result<(), String> {
    let mount = Path::new(mount_point);
    if !mount.is_absolute() {
        return Err("Invalid mount point".into());
    }
    let status = std::process::Command::new("diskutil")
        .args(["unmount", mount_point])
        .status()
        .map_err(|e| format!("Could not run diskutil: {e}"))?;
    if status.success() {
        return Ok(());
    }
    Err("Could not unmount that volume. Close open files and try again.".into())
}

#[cfg(not(target_os = "macos"))]
pub fn eject_volume(_mount_point: &str) -> Result<(), String> {
    Err("Eject is only supported on macOS".into())
}

#[tauri::command]
pub fn list_sidebar_volumes_cmd() -> Vec<SidebarVolume> {
    list_sidebar_volumes()
}

#[tauri::command]
pub fn probe_network_server_cmd(address: String, protocol: String) -> bool {
    probe_network_server(&address, &protocol, 2_000)
}

#[tauri::command]
pub fn open_network_share_cmd(protocol: String, address: String) -> Result<(), String> {
    open_network_share(&protocol, &address)
}

#[tauri::command]
pub fn eject_volume_cmd(mount_point: String) -> Result<(), String> {
    eject_volume(&mount_point)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_host_variants() {
        assert_eq!(parse_host("192.168.1.10"), Some("192.168.1.10".into()));
        assert_eq!(parse_host("smb://nas.local/media"), Some("nas.local".into()));
        assert_eq!(parse_host("//user@host.example/share"), Some("host.example".into()));
        assert_eq!(parse_host("host.example:445"), Some("host.example".into()));
    }
}
