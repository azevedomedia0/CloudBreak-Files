//! System tray: app icon with a live status dot for P2P seeding, and a menu with seeding stats.

use crate::p2p::library_store::LibraryIndex;
use crate::p2p::swarm::SwarmStatus;
use crate::p2p::P2pState;
use image::{Rgba, RgbaImage};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

pub const TRAY_ID: &str = "cloudbreak-main";

/// 0 = idle, 1 = online (listening, not seeding), 2 = seeding outgoing libraries
static LAST_STATUS: AtomicU8 = AtomicU8::new(255);

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum TrayStatus {
    Idle = 0,
    Online = 1,
    Seeding = 2,
}

impl TrayStatus {
    fn label(self) -> &'static str {
        match self {
            Self::Idle => "Idle — not seeding",
            Self::Online => "Online — listening (no active seeds)",
            Self::Seeding => "Online — seeding outgoing libraries",
        }
    }

    fn tooltip(self) -> &'static str {
        match self {
            Self::Idle => "Cloudbreak Files",
            Self::Online => "Cloudbreak Files — online",
            Self::Seeding => "Cloudbreak Files — seeding",
        }
    }

    /// Status-dot RGBA (blood-orange idle / sky online / green seeding).
    fn dot_rgba(self) -> [u8; 4] {
        match self {
            Self::Idle => [120, 120, 128, 255],
            Self::Online => [56, 189, 248, 255],
            Self::Seeding => [34, 197, 94, 255],
        }
    }
}

/// Native 32×32 asset — avoids Lanczos-resizing 128×128 on every tray refresh / launch.
fn base_icon_png() -> &'static [u8] {
    include_bytes!("../icons/32x32.png")
}

fn base_tray_rgba() -> &'static RgbaImage {
    static BASE: OnceLock<RgbaImage> = OnceLock::new();
    BASE.get_or_init(|| {
        image::load_from_memory(base_icon_png())
            .expect("bundled 32x32 tray icon")
            .to_rgba8()
    })
}

fn compose_tray_icon(status: TrayStatus) -> Result<Image<'static>, String> {
    let size = 32u32;
    let mut rgba = base_tray_rgba().clone();

    // Soften outer pixels slightly so the badge reads on light/dark menu bars.
    let cx = (size as i32) - 7;
    let cy = (size as i32) - 7;
    let outer_r = 6i32;
    let inner_r = 4i32;
    let ring = Rgba([18, 18, 20, 230]);
    let fill = Rgba(status.dot_rgba());

    for y in 0..size as i32 {
        for x in 0..size as i32 {
            let dx = x - cx;
            let dy = y - cy;
            let d2 = dx * dx + dy * dy;
            if d2 <= outer_r * outer_r {
                if d2 > inner_r * inner_r {
                    rgba.put_pixel(x as u32, y as u32, ring);
                } else {
                    rgba.put_pixel(x as u32, y as u32, fill);
                }
            }
        }
    }

    Ok(Image::new_owned(rgba.into_raw(), size, size))
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// How often the stats lines are refreshed, and how many of those ticks pass between disk reads of the library list.
const TICK: Duration = Duration::from_secs(5);
const LIBRARY_EVERY_TICKS: u32 = 12;
const MAX_LISTED_LIBRARIES: usize = 5;

/// The menu lines that change while the app runs. Updated in place so an open menu is not replaced under the user.
struct StatLines {
    status: MenuItem<tauri::Wry>,
    summary: MenuItem<tauri::Wry>,
    traffic: MenuItem<tauri::Wry>,
}

static LINES: OnceLock<Mutex<Option<StatLines>>> = OnceLock::new();
static LAST_TEXT: OnceLock<Mutex<[String; 3]>> = OnceLock::new();
static LIBRARIES: OnceLock<Mutex<LibrarySummary>> = OnceLock::new();

/// Outgoing libraries that are currently shared (not expired), as shown in the menu.
#[derive(Default, Clone, PartialEq)]
struct LibrarySummary {
    /// One line per library: "Name — expires in 12 days".
    lines: Vec<String>,
    count: usize,
    more: usize,
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// "1.2 GB", "340 KB", "0 B".
fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 || value >= 100.0 {
        format!("{:.0} {}", value, UNITS[unit])
    } else {
        format!("{:.1} {}", value, UNITS[unit])
    }
}

/// "expires in 12 days", "expires in 5 hours", or None when it never expires. Expired ones return Some("expired").
fn expiry_text(expires_at: Option<&str>, now: chrono::DateTime<chrono::Utc>) -> Option<String> {
    let at = chrono::DateTime::parse_from_rfc3339(expires_at?).ok()?.with_timezone(&chrono::Utc);
    let left = at - now;
    if left <= chrono::Duration::zero() {
        return Some("expired".into());
    }
    let days = left.num_days();
    let hours = left.num_hours();
    let minutes = left.num_minutes();
    let text = if days >= 1 {
        format!("expires in {days} day{}", if days == 1 { "" } else { "s" })
    } else if hours >= 1 {
        format!("expires in {hours} hour{}", if hours == 1 { "" } else { "s" })
    } else {
        format!("expires in {} min", minutes.max(1))
    };
    Some(text)
}

fn plural(n: usize, one: &str, many: &str) -> String {
    format!("{n} {}", if n == 1 { one } else { many })
}

fn summarize_libraries(index: &LibraryIndex, now: chrono::DateTime<chrono::Utc>) -> LibrarySummary {
    let mut lines = Vec::new();
    let mut count = 0usize;
    for lib in index.libraries.iter().filter(|l| l.direction == "outgoing" && l.is_seeding) {
        let expiry = expiry_text(lib.expires_at.as_deref(), now);
        if expiry.as_deref() == Some("expired") {
            continue;
        }
        count += 1;
        if lines.len() < MAX_LISTED_LIBRARIES {
            lines.push(match expiry {
                Some(text) => format!("{} — {text}", lib.name),
                None => format!("{} — no expiry", lib.name),
            });
        }
    }
    let more = count.saturating_sub(lines.len());
    LibrarySummary { lines, count, more }
}

fn load_library_summary(app: &AppHandle) -> LibrarySummary {
    let Ok(dir) = app.path().app_data_dir() else {
        return LibrarySummary::default();
    };
    match LibraryIndex::load(&dir) {
        Ok(index) => summarize_libraries(&index, chrono::Utc::now()),
        Err(_) => LibrarySummary::default(),
    }
}

/// The two stats lines under the status line.
fn stat_texts(status: TrayStatus, swarm: Option<&SwarmStatus>, libs: &LibrarySummary) -> (String, String) {
    let Some(st) = swarm else {
        let summary = if libs.count == 0 {
            "No outgoing libraries".to_string()
        } else {
            format!("{} shared · not connected", plural(libs.count, "library", "libraries"))
        };
        return (summary, "↑ 0 B sent · ↓ 0 B received".to_string());
    };
    let connected = st.peers.iter().filter(|p| p.connected).count();
    let peers = if st.peers.is_empty() {
        "no peers yet".to_string()
    } else {
        format!("{connected} of {} connected", plural(st.peers.len(), "peer", "peers"))
    };
    let libraries = if libs.count == 0 {
        "No outgoing libraries".to_string()
    } else if status == TrayStatus::Seeding {
        format!("Seeding {}", plural(libs.count, "library", "libraries"))
    } else {
        format!("{} shared", plural(libs.count, "library", "libraries"))
    };
    (
        format!("{libraries} · {peers}"),
        format!("↑ {} sent · ↓ {} received", format_bytes(st.bytes_sent), format_bytes(st.bytes_received)),
    )
}

fn build_menu(
    app: &AppHandle,
    status: TrayStatus,
    libs: &LibrarySummary,
    summary: &str,
    traffic: &str,
) -> tauri::Result<(Menu<tauri::Wry>, StatLines)> {
    let show_i = MenuItem::with_id(app, "show", "Show Cloudbreak Files", true, None::<&str>)?;
    let status_i = MenuItem::with_id(app, "status", status.label(), false, None::<&str>)?;
    let summary_i = MenuItem::with_id(app, "summary", summary, false, None::<&str>)?;
    let traffic_i = MenuItem::with_id(app, "traffic", traffic, false, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit Cloudbreak Files", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep3 = PredefinedMenuItem::separator(app)?;

    let libraries: Submenu<tauri::Wry> = {
        let title = if libs.count == 0 { "Outgoing libraries".to_string() } else { format!("Outgoing libraries ({})", libs.count) };
        let submenu = Submenu::with_id(app, "libraries", title, libs.count > 0)?;
        for (i, line) in libs.lines.iter().enumerate() {
            submenu.append(&MenuItem::with_id(app, format!("lib-{i}"), line, false, None::<&str>)?)?;
        }
        if libs.more > 0 {
            submenu.append(&MenuItem::with_id(app, "lib-more", format!("…and {} more", libs.more), false, None::<&str>)?)?;
        }
        submenu
    };

    let menu = Menu::with_items(
        app,
        &[&show_i, &sep1, &status_i, &summary_i, &traffic_i, &sep2, &libraries, &sep3, &quit_i],
    )?;
    Ok((menu, StatLines { status: status_i, summary: summary_i, traffic: traffic_i }))
}

pub fn build_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let libs = load_library_summary(app);
    *lock(LIBRARIES.get_or_init(Default::default)) = libs.clone();
    let (summary, traffic) = stat_texts(TrayStatus::Idle, None, &libs);
    let (menu, lines) = build_menu(app, TrayStatus::Idle, &libs, &summary, &traffic)?;
    *lock(LINES.get_or_init(Default::default)) = Some(lines);
    *lock(LAST_TEXT.get_or_init(Default::default)) = [TrayStatus::Idle.label().into(), summary, traffic];

    let icon = compose_tray_icon(TrayStatus::Idle)?;

    #[allow(unused_mut)] // mut only needed on Linux for temp_dir_path
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip(TrayStatus::Idle.tooltip())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    // Flatpak cannot write tray bitmaps under $XDG_RUNTIME_DIR; keep them in the app cache.
    #[cfg(target_os = "linux")]
    if let Ok(cache) = app.path().app_cache_dir() {
        builder = builder.temp_dir_path(cache);
    }

    let _tray = builder.build(app)?;

    LAST_STATUS.store(TrayStatus::Idle as u8, Ordering::Relaxed);

    // Keep the numbers live while transfers run. The library list is re-read from disk less often.
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut ticks = 0u32;
        loop {
            tokio::time::sleep(TICK).await;
            ticks += 1;
            if ticks % LIBRARY_EVERY_TICKS == 0 {
                refresh_tray_status(&handle);
            } else {
                update_stat_lines(&handle);
            }
        }
    });
    Ok(())
}

/// The current swarm snapshot, if the swarm has been started.
fn swarm_snapshot(app: &AppHandle) -> Option<SwarmStatus> {
    let state = app.try_state::<P2pState>()?;
    let swarm = state.swarm.lock();
    swarm.as_ref().map(|handle| handle.status())
}

fn status_of(st: Option<&SwarmStatus>) -> TrayStatus {
    match st {
        Some(st) if st.listening && !st.seeding_root_cids.is_empty() => TrayStatus::Seeding,
        Some(st) if st.listening => TrayStatus::Online,
        _ => TrayStatus::Idle,
    }
}

/// Derive tray status from the live P2P swarm (if started).
pub fn status_from_p2p(app: &AppHandle) -> TrayStatus {
    status_of(swarm_snapshot(app).as_ref())
}

/// Apply status to the icon and tooltip when it changed.
fn apply_icon(app: &AppHandle, status: TrayStatus) {
    let prev = LAST_STATUS.swap(status as u8, Ordering::Relaxed);
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if prev != status as u8 {
        if let Ok(icon) = compose_tray_icon(status) {
            let _ = tray.set_icon(Some(icon));
        }
        let _ = tray.set_tooltip(Some(status.tooltip()));
    }
}

/// Cheap refresh: status, icon and the three stat lines, edited in place. No disk reads.
fn update_stat_lines(app: &AppHandle) {
    let swarm = swarm_snapshot(app);
    let status = status_of(swarm.as_ref());
    apply_icon(app, status);
    let libs = lock(LIBRARIES.get_or_init(Default::default)).clone();
    let (summary, traffic) = stat_texts(status, swarm.as_ref(), &libs);
    let next = [status.label().to_string(), summary, traffic];

    let mut last = lock(LAST_TEXT.get_or_init(Default::default));
    let lines = lock(LINES.get_or_init(Default::default));
    let Some(lines) = lines.as_ref() else { return };
    if last[0] != next[0] {
        let _ = lines.status.set_text(&next[0]);
    }
    if last[1] != next[1] {
        let _ = lines.summary.set_text(&next[1]);
    }
    if last[2] != next[2] {
        let _ = lines.traffic.set_text(&next[2]);
    }
    *last = next;
}

/// Full refresh: re-read the library list and rebuild the menu only when that list changed.
pub fn refresh_tray_status(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let libs = load_library_summary(app);
    let changed = {
        let mut stored = lock(LIBRARIES.get_or_init(Default::default));
        let changed = *stored != libs;
        *stored = libs.clone();
        changed
    };
    if changed {
        let swarm = swarm_snapshot(app);
        let status = status_of(swarm.as_ref());
        let (summary, traffic) = stat_texts(status, swarm.as_ref(), &libs);
        if let Ok((menu, lines)) = build_menu(app, status, &libs, &summary, &traffic) {
            *lock(LINES.get_or_init(Default::default)) = Some(lines);
            *lock(LAST_TEXT.get_or_init(Default::default)) = [status.label().to_string(), summary, traffic];
            let _ = tray.set_menu(Some(menu));
        }
    }
    update_stat_lines(app);
}

#[tauri::command]
pub fn tray_refresh_status(app: AppHandle) -> Result<String, String> {
    refresh_tray_status(&app);
    Ok(status_from_p2p(&app).label().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration as Dur, TimeZone, Utc};

    #[test]
    fn bytes_are_human_readable() {
        assert_eq!(format_bytes(0), "0 B");
        assert_eq!(format_bytes(1023), "1023 B");
        assert_eq!(format_bytes(1536), "1.5 KB");
        assert_eq!(format_bytes(40 * 1024 * 1024), "40.0 MB");
        assert_eq!(format_bytes(1_288_490_189), "1.2 GB");
        assert_eq!(format_bytes(500 * 1024 * 1024), "500 MB");
    }

    #[test]
    fn expiry_reads_naturally() {
        let now = Utc.with_ymd_and_hms(2026, 10, 10, 12, 0, 0).unwrap();
        let at = |d: Dur| (now + d).to_rfc3339();
        assert_eq!(expiry_text(None, now), None);
        assert_eq!(expiry_text(Some(&at(Dur::days(12) + Dur::hours(3))), now).unwrap(), "expires in 12 days");
        assert_eq!(expiry_text(Some(&at(Dur::days(1))), now).unwrap(), "expires in 1 day");
        assert_eq!(expiry_text(Some(&at(Dur::hours(5))), now).unwrap(), "expires in 5 hours");
        assert_eq!(expiry_text(Some(&at(Dur::minutes(20))), now).unwrap(), "expires in 20 min");
        assert_eq!(expiry_text(Some(&at(Dur::seconds(10))), now).unwrap(), "expires in 1 min");
        assert_eq!(expiry_text(Some(&at(-Dur::minutes(1))), now).unwrap(), "expired");
        assert_eq!(expiry_text(Some("not a date"), now), None);
    }

    #[test]
    fn stat_lines_cover_idle_and_seeding() {
        let none = LibrarySummary::default();
        let (summary, traffic) = stat_texts(TrayStatus::Idle, None, &none);
        assert_eq!(summary, "No outgoing libraries");
        assert_eq!(traffic, "↑ 0 B sent · ↓ 0 B received");

        let libs = LibrarySummary { lines: vec!["Trip — expires in 3 days".into()], count: 2, more: 1 };
        let st = SwarmStatus {
            listening: true,
            listen_addrs: vec![],
            peer_id: "me".into(),
            peers: vec![
                crate::p2p::swarm::SwarmPeerStatus { peer_id: "a".into(), addrs: vec![], connected: true, transfer_bytes: 1, role: "r".into() },
                crate::p2p::swarm::SwarmPeerStatus { peer_id: "b".into(), addrs: vec![], connected: false, transfer_bytes: 0, role: "r".into() },
                crate::p2p::swarm::SwarmPeerStatus { peer_id: "c".into(), addrs: vec![], connected: false, transfer_bytes: 0, role: "r".into() },
            ],
            seeding_root_cids: vec!["x".into()],
            bytes_sent: 3 * 1024 * 1024,
            bytes_received: 2048,
            private_mode: true,
        };
        let (summary, traffic) = stat_texts(TrayStatus::Seeding, Some(&st), &libs);
        assert_eq!(summary, "Seeding 2 libraries · 1 of 3 peers connected");
        assert_eq!(traffic, "↑ 3.0 MB sent · ↓ 2.0 KB received");
    }

    fn record(name: &str, direction: &str, seeding: bool, expires_at: Option<String>) -> crate::p2p::library_store::LibraryRecord {
        crate::p2p::library_store::LibraryRecord {
            library_id: name.into(),
            name: name.into(),
            description: String::new(),
            direction: direction.into(),
            role: "owner".into(),
            owner_peer_id: "p".into(),
            owner_name: "o".into(),
            root_cid: "c".into(),
            epoch: 1,
            e2ee_protected: true,
            is_seeding: seeding,
            created_at: "2026-01-01T00:00:00Z".into(),
            file_ids: vec![],
            member_count: 1,
            local_wrapped_key: crate::p2p::keys::WrappedLibraryKey {
                scheme: "self".into(),
                eph_public_hex: None,
                nonce_hex: String::new(),
                ciphertext_hex: String::new(),
                salt_hex: None,
            },
            manifest_blob: crate::p2p::manifest::EncryptedManifestBlob {
                root_cid: "c".into(),
                nonce_hex: String::new(),
                ciphertext_hex: String::new(),
            },
            last_invite: None,
            seeding_status: None,
            bandwidth_cap: None,
            private_mode: true,
            expires_at,
            allow_downloads: true,
        }
    }

    #[test]
    fn only_active_outgoing_libraries_are_listed() {
        let now = Utc.with_ymd_and_hms(2026, 10, 10, 12, 0, 0).unwrap();
        let at = |d: Dur| Some((now + d).to_rfc3339());
        let index = LibraryIndex {
            libraries: vec![
                record("Trip", "outgoing", true, at(Dur::days(12))),
                record("Forever", "outgoing", true, None),
                record("Old", "outgoing", true, at(-Dur::hours(1))),
                record("Paused", "outgoing", false, at(Dur::days(3))),
                record("Theirs", "incoming", true, at(Dur::days(3))),
            ],
        };
        let summary = summarize_libraries(&index, now);
        assert_eq!(summary.count, 2);
        assert_eq!(summary.lines, vec!["Trip — expires in 12 days", "Forever — no expiry"]);
        assert_eq!(summary.more, 0);
    }

    #[test]
    fn long_lists_are_trimmed_with_a_count() {
        let now = Utc.with_ymd_and_hms(2026, 10, 10, 12, 0, 0).unwrap();
        let index = LibraryIndex {
            libraries: (0..8).map(|i| record(&format!("L{i}"), "outgoing", true, None)).collect(),
        };
        let summary = summarize_libraries(&index, now);
        assert_eq!(summary.count, 8);
        assert_eq!(summary.lines.len(), MAX_LISTED_LIBRARIES);
        assert_eq!(summary.more, 3);
    }
}
