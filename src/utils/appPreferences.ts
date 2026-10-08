import type { UserProfile } from '../components/ProfileSettingsModal';

export type AppViewMode = 'icons' | 'list' | 'columns' | 'gallery';
export type AppTheme = 'dark' | 'light';

export interface AppPreferences {
  defaultView: AppViewMode;
  theme: AppTheme;
  autoLockMinutes: number;
  rustEngineEnabled: boolean;
  confirmBeforeDelete: boolean;
  showInspectorOnLaunch: boolean;
  reduceMotion: boolean;
  compactSidebar: boolean;
  showTransferSpeeds: boolean;
  transferNotifications: boolean;
  securityAlerts: boolean;
  p2pPeerAlerts: boolean;
  startOnline: boolean;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  defaultView: 'icons',
  theme: 'dark',
  autoLockMinutes: 15,
  rustEngineEnabled: true,
  confirmBeforeDelete: true,
  showInspectorOnLaunch: true,
  reduceMotion: false,
  compactSidebar: false,
  showTransferSpeeds: true,
  transferNotifications: true,
  securityAlerts: true,
  p2pPeerAlerts: true,
  startOnline: true,
};

/** Apply theme to <html> for CSS `[data-theme]` rules. */
export function applyTheme(theme: AppTheme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
}

export const DEFAULT_PROFILE: UserProfile = {
  name: 'User',
  email: 'you@example.com',
  role: 'Vault Administrator',
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
  if (merged.theme !== 'light' && merged.theme !== 'dark') {
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
    email: typeof p.email === 'string' ? p.email : DEFAULT_PROFILE.email,
    role: typeof p.role === 'string' ? p.role : DEFAULT_PROFILE.role,
    avatarUrl: typeof p.avatarUrl === 'string' ? p.avatarUrl : undefined,
  };
}

export function saveProfile(profile: UserProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
