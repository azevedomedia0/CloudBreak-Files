//! System tray: app icon with a live status dot for P2P seeding.

use crate::p2p::P2pState;
use image::{imageops, Rgba, RgbaImage};
use std::sync::atomic::{AtomicU8, Ordering};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
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

fn base_icon_png() -> &'static [u8] {
    include_bytes!("../icons/128x128.png")
}

fn compose_tray_icon(status: TrayStatus) -> Result<Image<'static>, String> {
    let decoded = image::load_from_memory(base_icon_png()).map_err(|e| e.to_string())?;
    let size = 32u32;
    let mut rgba: RgbaImage = decoded
        .resize_exact(size, size, imageops::FilterType::Lanczos3)
        .to_rgba8();

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

pub fn build_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show_i = MenuItem::with_id(app, "show", "Show Cloudbreak Files", true, None::<&str>)?;
    let status_i = MenuItem::with_id(
        app,
        "status",
        TrayStatus::Idle.label(),
        false,
        None::<&str>,
    )?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit Cloudbreak Files", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_i, &sep, &status_i, &sep, &quit_i])?;

    let icon = compose_tray_icon(TrayStatus::Idle)?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
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
        })
        .build(app)?;

    LAST_STATUS.store(TrayStatus::Idle as u8, Ordering::Relaxed);
    Ok(())
}

/// Derive tray status from the live P2P swarm (if started).
pub fn status_from_p2p(app: &AppHandle) -> TrayStatus {
    let Some(state) = app.try_state::<P2pState>() else {
        return TrayStatus::Idle;
    };
    let swarm = state.swarm.lock();
    let Some(handle) = swarm.as_ref() else {
        return TrayStatus::Idle;
    };
    let st = handle.status();
    if st.listening && !st.seeding_root_cids.is_empty() {
        TrayStatus::Seeding
    } else if st.listening {
        TrayStatus::Online
    } else {
        TrayStatus::Idle
    }
}

/// Update tray icon, tooltip, and status menu item to match current seeding state.
pub fn refresh_tray_status(app: &AppHandle) {
    let status = status_from_p2p(app);
    let prev = LAST_STATUS.load(Ordering::Relaxed);
    let icon_changed = prev != status as u8;
    LAST_STATUS.store(status as u8, Ordering::Relaxed);

    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };

    if icon_changed {
        if let Ok(icon) = compose_tray_icon(status) {
            let _ = tray.set_icon(Some(icon));
        }
    }
    let _ = tray.set_tooltip(Some(status.tooltip()));

    // Rebuild menu so the disabled status line stays accurate.
    if let (Ok(show_i), Ok(status_i), Ok(sep), Ok(quit_i)) = (
        MenuItem::with_id(app, "show", "Show Cloudbreak Files", true, None::<&str>),
        MenuItem::with_id(app, "status", status.label(), false, None::<&str>),
        PredefinedMenuItem::separator(app),
        MenuItem::with_id(app, "quit", "Quit Cloudbreak Files", true, None::<&str>),
    ) {
        if let Ok(menu) = Menu::with_items(app, &[&show_i, &sep, &status_i, &sep, &quit_i]) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

#[tauri::command]
pub fn tray_refresh_status(app: AppHandle) -> Result<String, String> {
    refresh_tray_status(&app);
    Ok(status_from_p2p(&app).label().to_string())
}
