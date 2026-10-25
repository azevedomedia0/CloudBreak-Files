import type { UserProfile } from '../components/ProfileSettingsModal';

export type AppViewMode = 'icons' | 'list' | 'columns' | 'gallery';
export type AppTheme = 'dark' | 'midnight' | 'graphite' | 'glacial' | 'gnome';

export const APP_THEMES: { id: AppTheme; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'graphite', label: 'Graphite' },
  { id: 'glacial', label: 'Glacial Tint' },
  // The id stays `gnome` so saved choices keep working; it is the Light theme.
  { id: 'gnome', label: 'Light' },
];

const APP_THEME_IDS = new Set<string>(APP_THEMES.map(t => t.id));

export function isAppTheme(value: unknown): value is AppTheme {
  return typeof value === 'string' && APP_THEME_IDS.has(value);
}

/** Native form controls / scrollbars: light only for the light appearance. */
export function themeColorScheme(theme: AppTheme): 'dark' | 'light' {
  return theme === 'glacial' || theme === 'gnome' ? 'light' : 'dark';
}

export interface AppPreferences {
  defaultView: AppViewMode;
  theme: AppTheme;
  autoLockMinutes: number;
  rustEngineEnabled: boolean;
  /** Show the system terminal in the right-hand panel when the app starts. */
  openTerminalAtLaunch: boolean;
  /** Reopen terminal tabs, splits, folders and recent output from the last session. */
  restoreTerminalSessions: boolean;
  compactSidebar: boolean;
  showTransferSpeeds: boolean;
  transferNotifications: boolean;
  securityAlerts: boolean;
  p2pPeerAlerts: boolean;
  startOnline: boolean;
  /** Ask the router to forward the P2P port so invited peers on other networks can connect. */
  p2pRemoteAccess: boolean;
  /** A relay server (host:port) this device connects out to, so invites work from any network. Empty: none. */
  p2pRelayAddress: string;
  /** The relay operator's password for who may host on it, if they set one. */
  p2pRelayKey: string;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  defaultView: 'icons',
  theme: 'dark',
  autoLockMinutes: 15,
  rustEngineEnabled: true,
  openTerminalAtLaunch: false,
  restoreTerminalSessions: true,
  compactSidebar: false,
  showTransferSpeeds: true,
  transferNotifications: true,
  securityAlerts: true,
  p2pPeerAlerts: true,
  startOnline: true,
  p2pRemoteAccess: false,
  p2pRelayAddress: '',
  p2pRelayKey: '',
};

/** Apply theme to <html> for CSS `[data-theme]` rules. */
export function applyTheme(theme: AppTheme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = themeColorScheme(theme);
}

export const DEFAULT_PROFILE: UserProfile = {
  name: 'User',
};

const PREFS_KEY = 'cloudbreak.preferences.v1';
const PROFILE_KEY = 'cloudbreak.profile.v1';

function readJson<T>(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function loadPreferences(): AppPreferences {
  const parsed = readJson(PREFS_KEY);
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_PREFERENCES };
  const merged = { ...DEFAULT_PREFERENCES, ...(parsed as Partial<AppPreferences>) };
  // The old Light theme is gone; those who picked it get the Light theme that replaced it.
  if ((merged.theme as string) === 'light') merged.theme = 'gnome';
  if (!isAppTheme(merged.theme)) {
    merged.theme = DEFAULT_PREFERENCES.theme;
  }
  return merged;
}

export function savePreferences(prefs: AppPreferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function loadProfile(): UserProfile {
  const parsed = readJson(PROFILE_KEY);
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_PROFILE };
  const p = parsed as Partial<UserProfile>;
  return {
    name: typeof p.name === 'string' ? p.name : DEFAULT_PROFILE.name,
    username: typeof p.username === 'string' && p.username ? p.username : undefined,
    avatarUrl: typeof p.avatarUrl === 'string' ? p.avatarUrl : undefined,
  };
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
