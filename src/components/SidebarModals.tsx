import React, { useState } from 'react';
import {
  X, Folder, FolderPlus, Server, Star,
  HardDrive, Radio, Shield, FolderDown, RefreshCw,
} from 'lucide-react';
import type { RemovableDevice } from '../types';

function generateInvitePassphrase(length = 20): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}

/* 1. New Folder Modal */
interface NewFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateFolder: (name: string, category: string) => void;
}

export const NewFolderModal: React.FC<NewFolderModalProps> = ({
  isOpen,
  onClose,
  onCreateFolder,
}) => {
  const [folderName, setFolderName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('general');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    onCreateFolder(folderName.trim(), selectedCategory);
    setFolderName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div 
        className="app-modal-panel w-full max-w-md macos-window rounded-2xl overflow-hidden shadow-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Create New Local Folder</h3>
              <p className="text-[10px] text-neutral-400">Add a workspace directory to Local Files</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Folder Name
            </label>
            <input
              type="text"
              autoFocus
              value={folderName}
              onChange={e => setFolderName(e.target.value)}
              placeholder="e.g. 2026 Raw Cinema Shoots"
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400/50 transition-all font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-2">
              Folder Category Preset
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'projects', label: 'Projects', icon: Folder },
                { id: 'media', label: 'Media Assets', icon: HardDrive },
                { id: 'vault', label: 'Encrypted', icon: Shield },
              ].map(cat => {
                const Icon = cat.icon;
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-xs text-left transition-all ${
                      isSelected
                        ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                        : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate text-[11px]">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!folderName.trim()}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Create Folder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


/* 2. New Shared Library Modal (Outgoing P2P Seeding to Specified Users) */
export interface CreateP2pLibraryForm {
  name: string;
  description: string;
  /** Primary recipient (first in the list) — used for invite/crypto wrap. */
  memberEmail: string;
  /** All specified P2P recipients to seed to. */
  memberEmails: string[];
  role: 'viewer' | 'editor' | 'admin';
  bandwidthCap: string;
  invitePassphrase: string;
  /** Days until invite expires; 0 = never. */
  expiresInDays: number;
  allowDownloads: boolean;
}

function parseRecipientTokens(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

interface NewSharedLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateLibrary: (form: CreateP2pLibraryForm) => void | Promise<void>;
}

export const NewSharedLibraryModal: React.FC<NewSharedLibraryModalProps> = ({
  isOpen,
  onClose,
  onCreateLibrary,
}) => {
  const [libName, setLibName] = useState('');
  const [description, setDescription] = useState('');
  const [recipientDraft, setRecipientDraft] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [role, setRole] = useState<'viewer' | 'editor' | 'admin'>('editor');
  const [bandwidthCap, setBandwidthCap] = useState('100');
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [allowDownloads, setAllowDownloads] = useState(true);
  const [invitePassphrase, setInvitePassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const addRecipients = (raw: string) => {
    const next = parseRecipientTokens(raw);
    if (!next.length) return;
    setRecipients(prev => {
      const seen = new Set(prev.map(e => e.toLowerCase()));
      const merged = [...prev];
      for (const token of next) {
        const key = token.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(token);
      }
      return merged;
    });
    setRecipientDraft('');
  };

  const removeRecipient = (email: string) => {
    setRecipients(prev => prev.filter(e => e !== email));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!libName.trim()) return;
    const pending = parseRecipientTokens(recipientDraft);
    const allRecipients = [...recipients];
    for (const token of pending) {
      if (!allRecipients.some(e => e.toLowerCase() === token.toLowerCase())) {
        allRecipients.push(token);
      }
    }
    setBusy(true);
    setError(null);
    try {
      await onCreateLibrary({
        name: libName.trim(),
        description: description.trim() || 'Media library seeding to specified P2P users',
        memberEmail: allRecipients[0] || '',
        memberEmails: allRecipients,
        role,
        bandwidthCap: bandwidthCap.startsWith('unlimited')
          ? bandwidthCap
          : `${bandwidthCap} MB/s`,
        invitePassphrase: invitePassphrase.trim(),
        expiresInDays,
        allowDownloads,
      });
      setLibName('');
      setDescription('');
      setRecipientDraft('');
      setRecipients([]);
      setExpiresInDays(30);
      setAllowDownloads(true);
      setInvitePassphrase('');
      setShowPassphrase(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGeneratePassphrase = () => {
    setInvitePassphrase(generateInvitePassphrase());
    setShowPassphrase(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div 
        className="app-modal-panel w-full max-w-md macos-window rounded-2xl overflow-hidden shadow-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-400/30">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Seed Media Library to P2P Users</h3>
              <p className="text-[10px] text-neutral-400">Publish and seed encrypted media to specified P2P recipients</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Media Library Name
            </label>
            <input
              type="text"
              autoFocus
              value={libName}
              onChange={e => setLibName(e.target.value)}
              placeholder="e.g. Commercial 4K Master Seeding Reel"
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/50 transition-all font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Library Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Seeding graded camera plates and soundtrack files"
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/50 transition-all font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Specified P2P Recipients ({recipients.length})
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={recipientDraft}
                onChange={e => setRecipientDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addRecipients(recipientDraft);
                  }
                }}
                placeholder="peer@example.org — Enter to add, or paste several separated by commas"
                className="min-w-0 flex-1 px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/50 transition-all font-sans"
              />
              <button
                type="button"
                onClick={() => addRecipients(recipientDraft)}
                disabled={!recipientDraft.trim()}
                className="shrink-0 h-[34px] px-3 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/30 text-purple-200 text-xs font-medium disabled:opacity-40 transition-colors"
              >
                Add
              </button>
            </div>
            {recipients.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {recipients.map(email => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-lg bg-purple-500/15 border border-purple-400/30 text-[11px] text-purple-100 font-mono"
                  >
                    <span className="truncate">{email}</span>
                    <button
                      type="button"
                      onClick={() => removeRecipient(email)}
                      className="p-0.5 rounded hover:bg-white/10 text-purple-200/80 hover:text-white shrink-0"
                      aria-label={`Remove ${email}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[10px] text-neutral-400 mt-1.5">
              Add one or more users. Only these peers get cryptographic chunk access.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Peer Access Role
              </label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as any)}
                className="w-full bg-black/40 border border-white/15 text-neutral-200 text-xs rounded-xl px-2.5 py-2 focus:outline-none focus:border-purple-400"
              >
                <option value="editor">Editor (Sync & Edit)</option>
                <option value="viewer">Viewer (Stream Only)</option>
                <option value="admin">Admin (Swarm Co-host)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Seeding Upload Cap
              </label>
              <select
                value={bandwidthCap}
                onChange={e => setBandwidthCap(e.target.value)}
                className="w-full bg-black/40 border border-white/15 text-neutral-200 text-xs rounded-xl px-2.5 py-2 focus:outline-none focus:border-purple-400"
              >
                <option value="5">5 MB/s Cap</option>
                <option value="10">10 MB/s Cap</option>
                <option value="25">25 MB/s Cap</option>
                <option value="50">50 MB/s Cap</option>
                <option value="100">100 MB/s Cap</option>
                <option value="250">250 MB/s Cap</option>
                <option value="500">500 MB/s Cap</option>
                <option value="1000">1 GB/s Cap</option>
                <option value="unlimited-1gbe">Unlimited (1GbE)</option>
                <option value="unlimited-10gbe">Unlimited (10GbE)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Expiration
              </label>
              <select
                value={expiresInDays}
                onChange={e => setExpiresInDays(Number(e.target.value))}
                className="w-full bg-black/40 border border-white/15 text-neutral-200 text-xs rounded-xl px-2.5 py-2 focus:outline-none focus:border-purple-400"
              >
                <option value={1}>1 day</option>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={365}>1 year</option>
                <option value={0}>Never</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Allow downloads
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={allowDownloads}
                onClick={() => setAllowDownloads(v => !v)}
                className={`w-full h-[35px] px-3 rounded-xl border text-xs font-medium flex items-center justify-between transition-colors ${
                  allowDownloads
                    ? 'bg-purple-500/15 border-purple-400/30 text-purple-100'
                    : 'bg-black/40 border-white/15 text-neutral-400'
                }`}
              >
                <span>{allowDownloads ? 'Downloads on' : 'Stream only'}</span>
                <span
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    allowDownloads ? 'bg-purple-500' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      allowDownloads ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Invite passphrase (E2EE wrap, min 8 chars)
            </label>
            <div className="flex items-center gap-2">
              <input
                type={showPassphrase ? 'text' : 'password'}
                value={invitePassphrase}
                onChange={e => {
                  setInvitePassphrase(e.target.value);
                  setShowPassphrase(false);
                }}
                placeholder="Shared secret for recipients"
                className="min-w-0 flex-1 px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/50 transition-all font-mono"
              />
              <button
                type="button"
                onClick={handleGeneratePassphrase}
                className="shrink-0 h-[34px] px-3 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/30 text-purple-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Generate a strong passphrase"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Generate</span>
              </button>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-400/20 text-[11px] text-purple-200 flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-400 shrink-0" />
            <span>Private mode: AES-256-GCM chunks, signed invite-dial only — no DHT, STUN, or peer announce.</span>
          </div>

          {error && (
            <p className="text-[11px] text-red-300/90 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!libName.trim() || busy}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-purple-500 hover:bg-purple-400 text-white shadow-lg shadow-purple-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {busy ? 'Encrypting…' : 'Start Seeding Library'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* 3. Add to Favorites Modal — browse folder, network share, or connected drive */
type FavoriteChooserView = 'menu' | 'network' | 'device';

interface AddFavoriteModalProps {
  isOpen: boolean;
  onClose: () => void;
  networkServers: Array<{ id: string; name: string; desc: string; online: boolean }>;
  removableDevices: RemovableDevice[];
  favoritedSourceIds: ReadonlySet<string>;
  onBrowseFolder: () => Promise<boolean>;
  onAddNetwork: (serverId: string) => void;
  onAddDevice: (deviceId: string) => void;
}

export const AddFavoriteModal: React.FC<AddFavoriteModalProps> = ({
  isOpen,
  onClose,
  networkServers,
  removableDevices,
  favoritedSourceIds,
  onBrowseFolder,
  onAddNetwork,
  onAddDevice,
}) => {
  const [view, setView] = useState<FavoriteChooserView>('menu');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setView('menu');
    setBusy(false);
    setError(null);
    onClose();
  };

  const handleBrowseFolder = async () => {
    setError(null);
    setBusy(true);
    try {
      const added = await onBrowseFolder();
      if (added) resetAndClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div
        className="app-modal-panel w-full max-w-md macos-window rounded-2xl overflow-hidden shadow-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Star className="w-4 h-4 fill-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                {view === 'menu' ? 'Add to Favorites' : view === 'network' ? 'Network Storage' : 'Connected Drive'}
              </h3>
              <p className="text-[10px] text-neutral-400">
                {view === 'menu'
                  ? 'Pin a folder, network share, or connected hard drive'
                  : view === 'network'
                    ? 'Choose a network server or NAS share'
                    : 'Choose a mounted removable drive'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {view === 'menu' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleBrowseFolder}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-amber-400/40 text-left transition-all disabled:opacity-50"
              >
                <div className="p-2 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/25">
                  <Folder className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">Folder on this computer</div>
                  <div className="text-[10px] text-neutral-400 truncate">Browse the filesystem and pin a directory</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setError(null); setView('network'); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-amber-400/40 text-left transition-all"
              >
                <div className="p-2 rounded-lg bg-orange-500/15 text-orange-300 border border-orange-500/25">
                  <Server className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">Network storage</div>
                  <div className="text-[10px] text-neutral-400 truncate">
                    {networkServers.length} server{networkServers.length === 1 ? '' : 's'} available
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setError(null); setView('device'); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-amber-400/40 text-left transition-all"
              >
                <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">Connected hard drive</div>
                  <div className="text-[10px] text-neutral-400 truncate">
                    {removableDevices.filter(d => d.mounted).length} drive{removableDevices.filter(d => d.mounted).length === 1 ? '' : 's'} mounted
                  </div>
                </div>
              </button>
            </>
          )}

          {view === 'network' && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {networkServers.length === 0 && (
                <p className="text-xs text-neutral-400 py-4 text-center">No network servers connected yet.</p>
              )}
              {networkServers.map(server => {
                const already = favoritedSourceIds.has(server.id);
                return (
                  <button
                    key={server.id}
                    type="button"
                    disabled={already}
                    onClick={() => {
                      onAddNetwork(server.id);
                      resetAndClose();
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Server className="w-3.5 h-3.5 text-orange-300 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs text-white truncate">{server.name}</div>
                        <div className="text-[10px] text-neutral-500 font-mono truncate">{server.desc}</div>
                      </div>
                    </div>
                    {already ? (
                      <span className="text-[9px] text-amber-400/80 shrink-0">Pinned</span>
                    ) : (
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${server.online ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {view === 'device' && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {removableDevices.filter(d => d.mounted).length === 0 && (
                <p className="text-xs text-neutral-400 py-4 text-center">No removable drives are mounted.</p>
              )}
              {removableDevices.filter(d => d.mounted).map(device => {
                const already = favoritedSourceIds.has(device.id);
                return (
                  <button
                    key={device.id}
                    type="button"
                    disabled={already}
                    onClick={() => {
                      onAddDevice(device.id);
                      resetAndClose();
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <HardDrive className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs text-white truncate">{device.name}</div>
                        <div className="text-[10px] text-neutral-500 font-mono truncate">{device.mountPoint}</div>
                      </div>
                    </div>
                    {already ? (
                      <span className="text-[9px] text-amber-400/80 shrink-0">Pinned</span>
                    ) : (
                      <span className="text-[9px] text-neutral-500 shrink-0">{device.connectionType}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {error && (
            <p className="text-[11px] text-red-300/90 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-between gap-2.5 pt-2 border-t border-white/10">
            {view !== 'menu' ? (
              <button
                type="button"
                onClick={() => { setError(null); setView('menu'); }}
                className="px-3.5 py-1.5 rounded-xl text-xs text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                Back
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={resetAndClose}
              className="px-3.5 py-1.5 rounded-xl text-xs text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


/* 4. Connect Network Server Modal */
interface ConnectServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddServer: (name: string, address: string, protocol: string) => void;
}

export const ConnectServerModal: React.FC<ConnectServerModalProps> = ({
  isOpen,
  onClose,
  onAddServer,
}) => {
  const [serverName, setServerName] = useState('');
  const [serverAddress, setServerAddress] = useState('');
  const [protocol, setProtocol] = useState<'smb' | 'nfs' | 'sftp' | 'webdav'>('smb');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverName.trim()) return;
    const finalAddress = serverAddress.trim() || `${protocol}://192.168.1.120`;
    onAddServer(serverName.trim(), finalAddress, protocol.toUpperCase());
    setServerName('');
    setServerAddress('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div 
        className="app-modal-panel w-full max-w-md macos-window rounded-2xl overflow-hidden shadow-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Connect to Network Server</h3>
              <p className="text-[10px] text-neutral-400">Mount local SAN, NAS, SMB share or NFS cluster</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Server / Share Name
            </label>
            <input
              type="text"
              autoFocus
              value={serverName}
              onChange={e => setServerName(e.target.value)}
              placeholder="e.g. Post-Production SAN (10GbE)"
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400/50 transition-all font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Protocol
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['smb', 'nfs', 'sftp', 'webdav'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProtocol(p)}
                  className={`py-1.5 px-2 rounded-xl border text-[11px] font-mono uppercase text-center transition-all ${
                    protocol === p
                      ? 'bg-sky-500/25 border-sky-400/60 text-sky-200 font-bold'
                      : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Server URI / Address
            </label>
            <input
              type="text"
              value={serverAddress}
              onChange={e => setServerAddress(e.target.value)}
              placeholder={`${protocol}://192.168.1.150/media_volumes`}
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400/50 transition-all font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!serverName.trim()}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Connect Share
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* 5. Join / Add Incoming P2P Shared Library Modal */
export interface JoinP2pLibraryForm {
  name: string;
  invite: string;
  ownerName: string;
  passphrase: string;
}

interface JoinIncomingLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinLibrary: (form: JoinP2pLibraryForm) => void | Promise<void>;
}

export const JoinIncomingLibraryModal: React.FC<JoinIncomingLibraryModalProps> = ({
  isOpen,
  onClose,
  onJoinLibrary,
}) => {
  const [libraryName, setLibraryName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [p2pPassphrase, setP2pPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim().startsWith('aetherlib:1:')) {
      setError('Paste a valid aetherlib:1:… invite from the seeder');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onJoinLibrary({
        name: libraryName.trim(),
        invite: inviteCode.trim(),
        ownerName: ownerName.trim(),
        passphrase: p2pPassphrase,
      });
      setLibraryName('');
      setInviteCode('');
      setOwnerName('');
      setP2pPassphrase('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div 
        className="app-modal-panel w-full max-w-md macos-window rounded-2xl overflow-hidden shadow-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-green-500/20 text-green-300 border border-green-400/30">
              <FolderDown className="w-4 h-4 animate-bounce" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Connect Incoming P2P Media Library</h3>
              <p className="text-[10px] text-neutral-400">Receive media library from another user via encrypted P2P protocol</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Library Name
            </label>
            <input
              type="text"
              autoFocus
              value={libraryName}
              onChange={e => setLibraryName(e.target.value)}
              placeholder="e.g. Nordic Cinema Stills 2026"
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400/50 transition-all font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Sender User / Peer Name
            </label>
            <input
              type="text"
              value={ownerName}
              onChange={e => setOwnerName(e.target.value)}
              placeholder="e.g. Elena Rostova (Nordic Cinema)"
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400/50 transition-all font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Cloudbreak invite (aetherlib:1:…)
            </label>
            <textarea
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value)}
              rows={3}
              placeholder="aetherlib:1:…"
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400/50 transition-all font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Invite passphrase (if seeder set one)
            </label>
            <input
              type="password"
              value={p2pPassphrase}
              onChange={e => setP2pPassphrase(e.target.value)}
              placeholder="••••••••••••••••••••••••"
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400/50 transition-all font-mono"
            />
          </div>

          <div className="p-2.5 rounded-xl bg-green-500/10 border border-green-400/20 text-[11px] text-green-200 flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-400 shrink-0" />
            <span>Private mode: signed invite unwraps the key; dial only seederAddrs from the invite — no DHT/STUN.</span>
          </div>

          {error && (
            <p className="text-[11px] text-red-300/90 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs text-neutral-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!inviteCode.trim() || busy}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {busy ? 'Connecting…' : 'Connect P2P Stream'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
