import React, { useState } from 'react';
import {
  X, User, Settings, ShieldCheck, HardDrive, Bell, 
  Sliders, Moon, Check, Key, Lock, Unlock, Mail, 
  Shield, Cpu, RefreshCw, Smartphone, Eye, Sparkles
} from 'lucide-react';
import { CloudAccount } from '../types';
import { formatBytes } from '../utils/format';

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
}

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
  onUpdateProfile?: (updated: UserProfile) => void;
  accounts: CloudAccount[];
  isVaultUnlocked: boolean;
  onToggleVaultLock: (unlocked: boolean, passphrase?: string) => void | Promise<void>;
  onShowToast?: (msg: string) => void;
}

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  isOpen,
  onClose,
  userProfile = {
    name: 'Steven Azevedo',
    email: 'you@example.com',
    role: 'Sovereign Vault Administrator',
  },
  onUpdateProfile,
  accounts,
  isVaultUnlocked,
  onToggleVaultLock,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'security' | 'storage'>('profile');
  
  // Profile edit state
  const [name, setName] = useState<string>(userProfile.name);
  const [email, setEmail] = useState<string>(userProfile.email);
  const [role, setRole] = useState<string>(userProfile.role);

  // App preferences
  const [defaultView, setDefaultView] = useState<'icons' | 'list' | 'columns' | 'gallery'>('icons');
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(15);
  const [hardwareAcceleration, setHardwareAcceleration] = useState<boolean>(true);
  const [rustEngineEnabled, setRustEngineEnabled] = useState<boolean>(true);
  const [soundEffects, setSoundEffects] = useState<boolean>(true);

  // Security
  const [passphrase, setPassphrase] = useState<string>('');
  const [biometricUnlock, setBiometricUnlock] = useState<boolean>(true);

  if (!isOpen) return null;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile?.({ name, email, role });
    onShowToast?.('Profile & app preferences updated successfully');
    onClose();
  };

  const totalUsed = accounts.reduce((sum, a) => sum + a.usedBytes, 0);
  const totalQuota = accounts.reduce((sum, a) => sum + a.totalBytes, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="relative flex flex-col w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl macos-glass-card">
        
        {/* macOS Preferences Window Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-neutral-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight">Profile & App Settings</h2>
              <p className="text-[10px] text-neutral-400 font-mono">AetherCloud Sovereign System Preferences</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Close Settings (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation Segmented Bar */}
        <div className="px-5 pt-3 pb-2 border-b border-white/5 bg-black/20 flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
              activeTab === 'profile'
                ? 'bg-sky-500/20 text-sky-200 border border-sky-400/30 shadow-xs'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>
          <button
            onClick={() => setActiveTab('preferences')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
              activeTab === 'preferences'
                ? 'bg-sky-500/20 text-sky-200 border border-sky-400/30 shadow-xs'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Preferences</span>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
              activeTab === 'security'
                ? 'bg-sky-500/20 text-sky-200 border border-sky-400/30 shadow-xs'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Security & Vault</span>
          </button>
          <button
            onClick={() => setActiveTab('storage')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
              activeTab === 'storage'
                ? 'bg-sky-500/20 text-sky-200 border border-sky-400/30 shadow-xs'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Storage Nodes</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
          
          {/* TAB 1: PROFILE */}
          {activeTab === 'profile' && (
            <div className="space-y-5">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-purple-500 flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-sky-500/20">
                    {name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'SA'}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-neutral-900" title="Active E2EE Session" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-white truncate">{name}</h3>
                  <p className="text-xs text-neutral-400 truncate">{email}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-400/20 font-medium">
                      {role}
                    </span>
                    <span className="text-[10px] text-neutral-500 font-mono">ID: 0x9c4a...2026</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-400/60"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-400/60"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1.5">Account Role</label>
                  <input
                    type="text"
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-sky-400/60"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: APP PREFERENCES */}
          {activeTab === 'preferences' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white">Default View Mode</div>
                  <div className="text-[11px] text-neutral-400">Choose preferred file explorer layout on launch</div>
                </div>
                <select
                  value={defaultView}
                  onChange={e => setDefaultView(e.target.value as any)}
                  className="bg-black/60 border border-white/10 text-xs text-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-400/50"
                >
                  <option value="icons">Icons View (⊞)</option>
                  <option value="list">List View (☰)</option>
                  <option value="columns">Miller Columns (☷)</option>
                  <option value="gallery">Gallery View (▯)</option>
                </select>
              </div>

              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white">Native Rust Acceleration Engine</div>
                  <div className="text-[11px] text-neutral-400">Hardware-accelerated AES-GCM and video stream trimming</div>
                </div>
                <button
                  type="button"
                  onClick={() => setRustEngineEnabled(prev => !prev)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${rustEngineEnabled ? 'bg-sky-500' : 'bg-neutral-700'}`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${rustEngineEnabled ? 'left-5.5' : 'left-1'}`} />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white">Auto-Lock Vault Timeout</div>
                  <div className="text-[11px] text-neutral-400">Lock sovereign encrypted vault when inactive</div>
                </div>
                <select
                  value={autoLockMinutes}
                  onChange={e => setAutoLockMinutes(Number(e.target.value))}
                  className="bg-black/60 border border-white/10 text-xs text-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-400/50"
                >
                  <option value={5}>5 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={0}>Never auto-lock</option>
                </select>
              </div>

              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white">Subtle Audio Feedback</div>
                  <div className="text-[11px] text-neutral-400">Play tactile clicks on file drag, upload, and vault lock</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSoundEffects(prev => !prev)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${soundEffects ? 'bg-sky-500' : 'bg-neutral-700'}`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${soundEffects ? 'left-5.5' : 'left-1'}`} />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: SECURITY & VAULT */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${isVaultUnlocked ? 'bg-cyan-500/15 text-cyan-400' : 'bg-amber-500/15 text-amber-400'}`}>
                    {isVaultUnlocked ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white">
                      {isVaultUnlocked ? 'Sovereign Vault is Decrypted' : 'Sovereign Vault is Locked'}
                    </h4>
                    <p className="text-[11px] text-neutral-400">
                      Client-side AES-256-GCM cipher with zero-knowledge keys
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await onToggleVaultLock(!isVaultUnlocked, passphrase);
                    setPassphrase('');
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    isVaultUnlocked
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30'
                  }`}
                >
                  {isVaultUnlocked ? 'Lock Vault' : 'Decrypt Vault'}
                </button>
              </div>

              {!isVaultUnlocked && (
                <input
                  type="password"
                  value={passphrase}
                  onChange={e => setPassphrase(e.target.value)}
                  placeholder="Vault passphrase (8+ characters)"
                  autoComplete="off"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
                />
              )}

              <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2">
                <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider block">Cryptographic Key Fingerprint</span>
                <div className="font-mono text-xs text-cyan-300 bg-neutral-950/80 p-2.5 rounded-lg border border-white/10 break-all select-all">
                  9c:a1:83:fe:72:0b:da:51:98:3c:e4:aa:4f:b1:20:99
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white">Touch ID & Biometric Verification</div>
                  <div className="text-[11px] text-neutral-400">Allow instant passkey verification on compatible macOS devices</div>
                </div>
                <button
                  type="button"
                  onClick={() => setBiometricUnlock(prev => !prev)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${biometricUnlock ? 'bg-sky-500' : 'bg-neutral-700'}`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${biometricUnlock ? 'left-5.5' : 'left-1'}`} />
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: STORAGE NODES */}
          {activeTab === 'storage' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-neutral-300">Unified Cloud Allocated Quota</span>
                  <span className="font-mono text-white font-medium">{formatBytes(totalUsed)} / {formatBytes(totalQuota)}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-400"
                    style={{ width: `${Math.min(100, Math.round((totalUsed / totalQuota) * 100))}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                {accounts.map(acc => (
                  <div key={acc.id} className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-sky-400 font-bold text-xs">
                        {acc.provider[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-neutral-200">{acc.name}</div>
                        <div className="text-[10px] text-neutral-400">{acc.email}</div>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-neutral-300">
                      {formatBytes(acc.usedBytes)} / {formatBytes(acc.totalBytes)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="px-5 py-3.5 border-t border-white/10 bg-neutral-950/80 flex items-center justify-between">
          <span className="text-[10px] text-neutral-500 font-mono">AetherCloud Vault v2.6 • Build 2026.10</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveProfile}
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
