import React, { useEffect, useRef, useState } from 'react';
import {
  X, User, Settings, ShieldCheck, Bell,
  Sliders, Lock, Unlock, Radio, Copy, Check, Info,
  Eye, EyeOff, Trash2, PanelRight,
  Cpu, Fingerprint, RefreshCw, Globe, Moon, Sun,
  Camera, ImagePlus, FolderLock, FolderOpen, Network,
} from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { CloudAccount } from '../types';
import {
  AppPreferences,
  AppTheme,
  DEFAULT_PREFERENCES,
  applyTheme,
  loadPreferences,
  savePreferences,
  saveProfile,
} from '../utils/appPreferences';
import { fullDiskAccessGranted, requestFullDiskAccess } from '../services/permissionsBridge';

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
}

const AVATAR_MAX_EDGE = 256;
const AVATAR_MAX_INPUT_BYTES = 8 * 1024 * 1024;

/** Resize and JPEG-encode a picked image for localStorage-friendly profile photos. */
async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file (JPEG, PNG, WebP, or HEIC).');
  }
  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    throw new Error('Image is too large (max 8 MB). Try a smaller photo.');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, AVATAR_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that image.');
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    bitmap.close();
  }
}

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
  onUpdateProfile?: (updated: UserProfile) => void;
  preferences?: AppPreferences;
  onUpdatePreferences?: (prefs: AppPreferences) => void;
  accounts: CloudAccount[];
  isVaultUnlocked: boolean;
  onToggleVaultLock: (unlocked: boolean, passphrase?: string) => void | Promise<void>;
  onShowToast?: (msg: string) => void;
  peerId?: string | null;
  swarmListening?: boolean;
  p2pLibraryCount?: number;
  onCheckForUpdates?: () => void | Promise<void>;
  updateChecking?: boolean;
  appVersion?: string | null;
}

type SettingsTab = 'profile' | 'preferences' | 'notifications' | 'security' | 'permissions' | 'network';

const FILES_AND_FOLDERS = [
  { name: 'Desktop', detail: '~/Desktop' },
  { name: 'Documents', detail: '~/Documents' },
  { name: 'Downloads', detail: '~/Downloads' },
  { name: 'Movies', detail: '~/Movies (Videos)' },
  { name: 'Music', detail: '~/Music' },
  { name: 'Pictures', detail: '~/Pictures (Photos)' },
  { name: 'Applications', detail: '/Applications' },
] as const;

const TAB_ACTIVE = 'bg-sky-500/20 text-sky-200 border border-sky-400/30 shadow-xs';
const TAB_IDLE = 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5';

function Toggle({
  on,
  onChange,
  accent = 'sky',
}: {
  on: boolean;
  onChange: () => void;
  accent?: 'sky' | 'cyan' | 'amber';
}) {
  const onCls =
    accent === 'cyan' ? 'bg-cyan-500' : accent === 'amber' ? 'bg-amber-500' : 'bg-sky-500';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${on ? onCls : 'bg-neutral-700'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function PrefRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-white">{title}</div>
        <div className="text-[11px] text-neutral-400 mt-0.5">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  isOpen,
  onClose,
  userProfile = {
    name: 'User',
    email: 'you@example.com',
    role: 'Vault Administrator',
  },
  onUpdateProfile,
  preferences: preferencesProp,
  onUpdatePreferences,
  accounts,
  isVaultUnlocked,
  onToggleVaultLock,
  onShowToast,
  peerId = null,
  swarmListening = false,
  p2pLibraryCount = 0,
  onCheckForUpdates,
  updateChecking = false,
  appVersion = null,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [name, setName] = useState(userProfile.name);
  const [email, setEmail] = useState(userProfile.email);
  const [role, setRole] = useState(userProfile.role);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(userProfile.avatarUrl);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [prefs, setPrefs] = useState<AppPreferences>(() => preferencesProp ?? loadPreferences());
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [copiedPeer, setCopiedPeer] = useState(false);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [fdaGranted, setFdaGranted] = useState<boolean | null>(null);
  const [fdaBusy, setFdaBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(userProfile.name);
    setEmail(userProfile.email);
    setRole(userProfile.role);
    setAvatarUrl(userProfile.avatarUrl);
    setPrefs(preferencesProp ?? loadPreferences());
    setPassphrase('');
    setShowPassphrase(false);
    setAvatarBusy(false);
    setFdaBusy(false);
    if (isTauri()) {
      void fullDiskAccessGranted().then(setFdaGranted);
    } else {
      setFdaGranted(null);
    }
  }, [isOpen, userProfile, preferencesProp]);

  if (!isOpen) return null;

  const patchPrefs = <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'theme') applyTheme(value as AppTheme);
      return next;
    });
  };

  const handleDismiss = () => {
    const saved = preferencesProp ?? loadPreferences();
    applyTheme(saved.theme);
    onClose();
  };

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    const profile: UserProfile = {
      name: name.trim() || userProfile.name,
      email: email.trim(),
      role: role.trim(),
      avatarUrl: avatarUrl || undefined,
    };
    saveProfile(profile);
    savePreferences(prefs);
    applyTheme(prefs.theme);
    onUpdateProfile?.(profile);
    onUpdatePreferences?.(prefs);
    onShowToast?.('Settings saved');
    onClose();
  };

  const handleAvatarPick = async (file: File | undefined) => {
    if (!file) return;
    setAvatarBusy(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setAvatarUrl(dataUrl);
      onShowToast?.('Photo updated — click Save & Apply to keep it');
    } catch (err) {
      onShowToast?.(err instanceof Error ? err.message : 'Could not use that image');
    } finally {
      setAvatarBusy(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleResetPrefs = () => {
    const next = { ...DEFAULT_PREFERENCES, theme: prefs.theme };
    setPrefs(next);
    onShowToast?.('Preferences reset to defaults (not saved yet)');
  };

  const copyPeerId = async () => {
    if (!peerId) return;
    try {
      await navigator.clipboard.writeText(peerId);
      setCopiedPeer(true);
      setTimeout(() => setCopiedPeer(false), 1800);
    } catch {
      onShowToast?.('Could not copy peer ID');
    }
  };

  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'CB';

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: 'profile', label: 'Profile', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'preferences', label: 'General', icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'notifications', label: 'Alerts', icon: <Bell className="w-3.5 h-3.5" /> },
    { id: 'security', label: 'Security', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    { id: 'permissions', label: 'Permissions', icon: <FolderLock className="w-3.5 h-3.5" /> },
    { id: 'network', label: 'Network', icon: <Radio className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="app-modal-panel relative flex flex-col w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl macos-glass-card max-h-[min(860px,92vh)]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-neutral-950/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight">Profile & App Settings</h2>
              <p className="text-[10px] text-neutral-400 font-mono">Cloudbreak Files Preferences</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Close Settings (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3 pb-2 border-b border-white/5 bg-black/20 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap border border-transparent ${
                activeTab === tab.id ? TAB_ACTIVE : TAB_IDLE
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'profile' && (
            <div className="space-y-5">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarBusy}
                    className="group relative w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-tr from-sky-500 via-indigo-500 to-purple-500 flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-sky-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-60"
                    title="Change profile photo"
                    aria-label="Change profile photo"
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <span className="relative z-10">{initials}</span>
                    )}
                    <span className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                      {avatarBusy ? (
                        <RefreshCw className="w-5 h-5 animate-spin text-white" />
                      ) : (
                        <Camera className="w-5 h-5 text-white" />
                      )}
                    </span>
                  </button>
                  <div
                    className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-neutral-900 ${
                      isVaultUnlocked ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                    title={isVaultUnlocked ? 'Vault unlocked' : 'Vault locked'}
                  />
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.heic"
                    className="hidden"
                    onChange={e => { void handleAvatarPick(e.target.files?.[0]); }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-white truncate">{name || 'Unnamed'}</h3>
                  <p className="text-xs text-neutral-400 truncate">{email || 'No email'}</p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarBusy}
                      className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-md bg-sky-500/15 text-sky-200 border border-sky-400/25 hover:bg-sky-500/25 disabled:opacity-50 transition-colors"
                    >
                      <ImagePlus className="w-3 h-3" />
                      {avatarUrl ? 'Change photo' : 'Add photo'}
                    </button>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl(undefined)}
                        disabled={avatarBusy}
                        className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-md bg-white/5 text-neutral-300 border border-white/10 hover:bg-white/10 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-400/20 font-medium">
                      {role || 'Member'}
                    </span>
                    <span className="text-[10px] text-neutral-500">
                      {accounts.length} cloud {accounts.length === 1 ? 'account' : 'accounts'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1.5">Display name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-400/60"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-400/60"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1.5">Role / title</label>
                  <input
                    type="text"
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    placeholder="e.g. Vault Administrator"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-400/60"
                  />
                </div>
              </div>
              <p className="text-[11px] text-neutral-500 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Profile and photo are stored locally on this device. Display name is used for P2P peer identity.
              </p>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-white mb-1">Theme</h4>
                <p className="text-[11px] text-neutral-500 mb-3">
                  Choose light or dark. Changes apply immediately; click Save to keep them.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    {
                      id: 'dark' as AppTheme,
                      label: 'Dark',
                      icon: <Moon className="w-4 h-4" />,
                      swatches: ['#0a0a0a', '#171717', '#262626', '#404040'],
                    },
                    {
                      id: 'light' as AppTheme,
                      label: 'Light',
                      icon: <Sun className="w-4 h-4" />,
                      swatches: ['#d2d2d8', '#c8c8ce', '#b0b0b6', '#8e8e94'],
                    },
                  ]).map(option => {
                    const selected = prefs.theme === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => patchPrefs('theme', option.id)}
                        className={`relative text-left rounded-2xl border p-3.5 transition-all ${
                          selected
                            ? 'border-sky-400/70 bg-sky-500/10 ring-1 ring-sky-400/30'
                            : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className={`flex items-center gap-1.5 text-xs font-semibold ${selected ? 'text-sky-300' : 'text-neutral-200'}`}>
                            {option.icon}
                            {option.label}
                          </span>
                          {selected && (
                            <span className="w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          {option.swatches.map(color => (
                            <span
                              key={color}
                              className="flex-1 h-8 rounded-lg border border-black/20"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-neutral-500 flex items-start gap-1.5 mt-3">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Light mode uses medium gray surfaces with darker accent colors for contrast.
                </p>
              </div>

              <div className="space-y-3 pt-1 border-t border-white/5">
              <PrefRow title="Default view mode" description="File browser layout used when the app launches">
                <select
                  value={prefs.defaultView}
                  onChange={e => patchPrefs('defaultView', e.target.value as AppPreferences['defaultView'])}
                  className="bg-black/60 border border-white/10 text-xs text-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-400/50"
                >
                  <option value="icons">Icons</option>
                  <option value="list">List</option>
                  <option value="columns">Columns</option>
                  <option value="gallery">Gallery</option>
                </select>
              </PrefRow>

              <PrefRow title="Show inspector on launch" description="Open the right-hand file inspector panel by default">
                <Toggle on={prefs.showInspectorOnLaunch} onChange={() => patchPrefs('showInspectorOnLaunch', !prefs.showInspectorOnLaunch)} />
              </PrefRow>

              <PrefRow title="Compact sidebar" description="Tighter spacing in the account and folder list">
                <Toggle on={prefs.compactSidebar} onChange={() => patchPrefs('compactSidebar', !prefs.compactSidebar)} />
              </PrefRow>

              <PrefRow title="Confirm before delete" description="Ask before removing files from the library">
                <Toggle on={prefs.confirmBeforeDelete} onChange={() => patchPrefs('confirmBeforeDelete', !prefs.confirmBeforeDelete)} />
              </PrefRow>

              <PrefRow title="Show transfer speeds" description="Display MB/s on uploads, downloads, and P2P seeding">
                <Toggle on={prefs.showTransferSpeeds} onChange={() => patchPrefs('showTransferSpeeds', !prefs.showTransferSpeeds)} />
              </PrefRow>

              <PrefRow title="Reduce motion" description="Limit animations and pulsing status indicators">
                <Toggle on={prefs.reduceMotion} onChange={() => patchPrefs('reduceMotion', !prefs.reduceMotion)} />
              </PrefRow>

              <PrefRow title="Native Rust crypto engine" description="Use Tauri AES-GCM when running as a desktop app">
                <Toggle on={prefs.rustEngineEnabled} onChange={() => patchPrefs('rustEngineEnabled', !prefs.rustEngineEnabled)} />
              </PrefRow>

              <PrefRow
                title="App updates"
                description={
                  appVersion
                    ? `Installed version ${appVersion}. Checks the signed GitHub Releases manifest.`
                    : 'Checks the signed GitHub Releases manifest (desktop app only).'
                }
              >
                <button
                  type="button"
                  disabled={!onCheckForUpdates || updateChecking}
                  onClick={() => { void onCheckForUpdates?.(); }}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-sky-500/20 text-sky-200 border border-sky-400/30 hover:bg-sky-500/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3 h-3 ${updateChecking ? 'animate-spin' : ''}`} />
                  {updateChecking ? 'Checking…' : 'Check for updates'}
                </button>
              </PrefRow>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleResetPrefs}
                  className="text-[11px] text-neutral-400 hover:text-sky-300 flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reset general defaults
                </button>
              </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-3">
              <PrefRow title="Transfer complete" description="Notify when uploads, downloads, or sync jobs finish">
                <Toggle on={prefs.transferNotifications} onChange={() => patchPrefs('transferNotifications', !prefs.transferNotifications)} />
              </PrefRow>
              <PrefRow title="Security alerts" description="Vault lock, unlock failures, and passphrase warnings">
                <Toggle on={prefs.securityAlerts} onChange={() => patchPrefs('securityAlerts', !prefs.securityAlerts)} accent="amber" />
              </PrefRow>
              <PrefRow title="P2P peer activity" description="Incoming invites, peer connect, and seeding status">
                <Toggle on={prefs.p2pPeerAlerts} onChange={() => patchPrefs('p2pPeerAlerts', !prefs.p2pPeerAlerts)} />
              </PrefRow>
              <PrefRow title="Appear online on launch" description="Announce availability to favorited network nodes">
                <Toggle on={prefs.startOnline} onChange={() => patchPrefs('startOnline', !prefs.startOnline)} />
              </PrefRow>
              <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-[11px] text-neutral-400 flex gap-2">
                <Bell className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                <span>
                  Alerts appear in the toolbar notification panel. Desktop system notifications are not wired yet.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2.5 rounded-xl shrink-0 ${isVaultUnlocked ? 'bg-cyan-500/15 text-cyan-400' : 'bg-amber-500/15 text-amber-400'}`}>
                    {isVaultUnlocked ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-white">
                      {isVaultUnlocked ? 'Vault is unlocked' : 'Vault is locked'}
                    </h4>
                    <p className="text-[11px] text-neutral-400">
                      Client-side AES-256-GCM · passphrase never leaves this device
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={vaultBusy || (!isVaultUnlocked && passphrase.trim().length < 8)}
                  onClick={async () => {
                    setVaultBusy(true);
                    try {
                      await onToggleVaultLock(!isVaultUnlocked, passphrase);
                      setPassphrase('');
                    } finally {
                      setVaultBusy(false);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 disabled:opacity-40 ${
                    isVaultUnlocked
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30'
                  }`}
                >
                  {vaultBusy ? 'Working…' : isVaultUnlocked ? 'Lock vault' : 'Unlock'}
                </button>
              </div>

              {!isVaultUnlocked && (
                <div className="relative">
                  <input
                    type={showPassphrase ? 'text' : 'password'}
                    value={passphrase}
                    onChange={e => setPassphrase(e.target.value)}
                    placeholder="Vault passphrase (8+ characters)"
                    autoComplete="off"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 pr-10 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                    aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                  >
                    {showPassphrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              <PrefRow title="Auto-lock timeout" description="Lock the vault after this much idle time">
                <select
                  value={prefs.autoLockMinutes}
                  onChange={e => patchPrefs('autoLockMinutes', Number(e.target.value))}
                  className="bg-black/60 border border-white/10 text-xs text-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-400/50"
                >
                  <option value={5}>5 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={0}>Never</option>
                </select>
              </PrefRow>

              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex items-start justify-between gap-3 opacity-80">
                <div className="flex gap-2.5 min-w-0">
                  <Fingerprint className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-white">Touch ID / biometric unlock</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">
                      Requires the Cloudbreak desktop app on macOS. Not available in the browser preview.
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-neutral-500 px-2 py-1 rounded-md bg-black/40 border border-white/5 shrink-0">
                  Soon
                </span>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-[11px] text-neutral-400 flex gap-2">
                <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  Passphrase verifier uses PBKDF2 (600k iterations). In the desktop app it is stored in vault.json under app data; in the browser it resets on reload.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className="space-y-3">
              {isTauri() ? (
                <>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2.5 rounded-xl shrink-0 ${
                        fdaGranted ? 'bg-emerald-500/15 text-emerald-400' : 'bg-sky-500/15 text-sky-400'
                      }`}>
                        <FolderLock className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-white">Full Disk Access</h4>
                        <p className="text-[11px] text-neutral-400">
                          {fdaGranted
                            ? 'Granted — Cloudbreak can browse protected folders and Photos library originals when available.'
                            : 'Required for some protected locations. macOS cannot prompt for this — enable it in System Settings, then restart the app.'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={fdaBusy || fdaGranted === true}
                      onClick={async () => {
                        setFdaBusy(true);
                        try {
                          const ok = await requestFullDiskAccess();
                          setFdaGranted(ok);
                          onShowToast?.(
                            ok
                              ? 'Full Disk Access is already granted'
                              : 'Enable Cloudbreak Files in Full Disk Access, then restart the app',
                          );
                          window.setTimeout(() => {
                            void fullDiskAccessGranted().then(setFdaGranted);
                          }, 2500);
                        } catch (err) {
                          onShowToast?.(err instanceof Error ? err.message : String(err));
                        } finally {
                          setFdaBusy(false);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 disabled:opacity-40 ${
                        fdaGranted
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                          : 'bg-sky-500/20 text-sky-200 border border-sky-400/30 hover:bg-sky-500/30'
                      }`}
                    >
                      {fdaBusy ? 'Opening…' : fdaGranted ? 'Granted' : 'Open Settings'}
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-sky-400 shrink-0" />
                      <div>
                        <h4 className="text-xs font-semibold text-white">Files and Folders</h4>
                        <p className="text-[11px] text-neutral-400">
                          macOS asks for these on first browse. Grant access when prompted so Local Files can list each folder.
                        </p>
                      </div>
                    </div>
                    <ul className="space-y-1.5">
                      {FILES_AND_FOLDERS.map(item => (
                        <li
                          key={item.name}
                          className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/5"
                        >
                          <span className="text-xs font-medium text-neutral-200">{item.name}</span>
                          <span className="text-[10px] font-mono text-neutral-500 truncate">{item.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex items-start gap-2.5">
                    <Network className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-semibold text-white">Local Network</div>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        Used for P2P library sharing and discovering nearby servers. macOS may prompt the first time a peer or share is contacted.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-[11px] text-neutral-400 flex gap-2">
                    <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                    <span>
                      Manage grants anytime in System Settings → Privacy &amp; Security → Files and Folders, Full Disk Access, and Local Network.
                    </span>
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-[11px] text-neutral-400 flex gap-2">
                  <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                  <span>
                    Folder and disk permissions apply in the Cloudbreak desktop app on macOS. The browser preview cannot request them.
                  </span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'network' && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-semibold text-white">Private P2P</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                      swarmListening
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                        : 'bg-neutral-800 text-neutral-400 border-white/10'
                    }`}
                  >
                    {swarmListening ? 'Listening' : 'Idle'}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Invite-dial only — no DHT announce, STUN, or public peer discovery. {p2pLibraryCount}{' '}
                  {p2pLibraryCount === 1 ? 'library' : 'libraries'} on this device.
                </p>
                <div>
                  <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">Peer ID</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] font-mono text-purple-200/90 bg-transparent border border-white/10 rounded-lg px-2.5 py-2 truncate">
                      {peerId || 'Not created yet — seed or join a library first'}
                    </code>
                    <button
                      type="button"
                      disabled={!peerId}
                      onClick={copyPeerId}
                      className="p-2 rounded-lg border border-white/10 text-neutral-400 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-colors"
                      title="Copy peer ID"
                    >
                      {copiedPeer ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <PrefRow title="Show transfer speeds" description="Include bitrate on P2P library banners and share sheets">
                <Toggle on={prefs.showTransferSpeeds} onChange={() => patchPrefs('showTransferSpeeds', !prefs.showTransferSpeeds)} />
              </PrefRow>

              <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-[11px] text-neutral-400 flex gap-2">
                <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                <span>
                  Cloud providers authenticate with tokens you paste in each account’s integration panel. Credentials are stored in local browser storage under a Cloudbreak key.
                </span>
              </div>

              <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-[11px] text-neutral-400 flex gap-2">
                <PanelRight className="w-3.5 h-3.5 text-neutral-500 shrink-0 mt-0.5" />
                <span>
                  Network shares and removable volumes are listed in the sidebar. Favorites can pin folders, SMB shares, and attached drives.
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-white/10 bg-neutral-950/80 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-neutral-500 font-mono">Cloudbreak Files v0.1</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDismiss}
              className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/25 transition-all"
            >
              Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
