//! App preferences — mirrors `src/utils/appPreferences.ts`.

use serde::{Deserialize, Serialize};
use std::fs;

use super::ViewMode;
use crate::paths;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppTheme {
    Dark,
    Light,
}

impl AppTheme {
    pub fn label(self) -> &'static str {
        match self {
            Self::Dark => "Dark",
            Self::Light => "Light",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    pub theme: AppTheme,
    pub default_view: ViewMode,
    pub auto_lock_minutes: u32,
    pub confirm_before_delete: bool,
    pub show_inspector_on_launch: bool,
    pub reduce_motion: bool,
    pub compact_sidebar: bool,
    pub transfer_notifications: bool,
    pub security_alerts: bool,
    pub p2p_peer_alerts: bool,
    pub start_online: bool,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            theme: AppTheme::Dark,
            default_view: ViewMode::Icons,
            auto_lock_minutes: 15,
            confirm_before_delete: true,
            show_inspector_on_launch: true,
            reduce_motion: false,
            compact_sidebar: false,
            transfer_notifications: true,
            security_alerts: true,
            p2p_peer_alerts: true,
            start_online: true,
        }
    }
}

const PREFS_FILE: &str = "preferences.json";
const PROFILE_FILE: &str = "profile.json";

pub fn load_preferences() -> AppPreferences {
    let path = paths::app_config_dir().join(PREFS_FILE);
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => AppPreferences::default(),
    }
}

pub fn save_preferences(prefs: &AppPreferences) -> Result<(), String> {
    let path = paths::app_config_dir().join(PREFS_FILE);
    let json = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn load_profile() -> UserProfile {
    let path = paths::app_config_dir().join(PROFILE_FILE);
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => UserProfile::default(),
    }
}

pub fn save_profile(profile: &UserProfile) -> Result<(), String> {
    let path = paths::app_config_dir().join(PROFILE_FILE);
    let json = serde_json::to_string_pretty(profile).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub name: String,
    pub email: String,
    pub role: String,
}

impl Default for UserProfile {
    fn default() -> Self {
        Self {
            name: "User".into(),
            email: "you@example.com".into(),
            role: "Vault Administrator".into(),
        }
    }
}
