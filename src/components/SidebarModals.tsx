import React, { useState } from 'react';
import { 
  X, Folder, FolderPlus, Users, Server, Star, 
  Check, Sparkles, HardDrive, Radio, Shield, Globe, FolderDown
} from 'lucide-react';

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
        className="w-full max-w-md macos-window rounded-2xl overflow-hidden shadow-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-150"
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
interface NewSharedLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateLibrary: (name: string, description: string, memberEmail: string, role: 'viewer' | 'editor' | 'admin') => void;
}

export const NewSharedLibraryModal: React.FC<NewSharedLibraryModalProps> = ({
  isOpen,
  onClose,
  onCreateLibrary,
}) => {
  const [libName, setLibName] = useState('');
  const [description, setDescription] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor' | 'admin'>('editor');
  const [bandwidthCap, setBandwidthCap] = useState<'50' | '100' | 'unlimited'>('100');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!libName.trim()) return;
    onCreateLibrary(
      libName.trim(),
      description.trim() || 'Media library seeding to specified P2P users',
      memberEmail.trim(),
      role
    );
    setLibName('');
    setDescription('');
    setMemberEmail('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div 
        className="w-full max-w-md macos-window rounded-2xl overflow-hidden shadow-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-400/30">
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
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400/50 transition-all font-sans"
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
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400/50 transition-all font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Specify P2P Peer User to Seed To (Email or Peer Node ID)
            </label>
            <input
              type="text"
              value={memberEmail}
              onChange={e => setMemberEmail(e.target.value)}
              placeholder="peer@example.org or node-peer-sfo-19"
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400/50 transition-all font-sans"
            />
            <p className="text-[10px] text-neutral-400 mt-1">
              Only the P2P users you explicitly specify will receive cryptographic chunk access.
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
                className="w-full bg-black/40 border border-white/15 text-neutral-200 text-xs rounded-xl px-2.5 py-2 focus:outline-none focus:border-sky-400"
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
                onChange={e => setBandwidthCap(e.target.value as any)}
                className="w-full bg-black/40 border border-white/15 text-neutral-200 text-xs rounded-xl px-2.5 py-2 focus:outline-none focus:border-sky-400"
              >
                <option value="50">50 MB/s Cap</option>
                <option value="100">100 MB/s Cap</option>
                <option value="unlimited">Unlimited (10GbE)</option>
              </select>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-400/20 text-[11px] text-sky-200 flex items-center gap-2">
            <Shield className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Zero-Knowledge End-to-End P2P Seeder Protocol enabled.</span>
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
              disabled={!libName.trim()}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Start Seeding Library
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* 3. Add to Favorites Modal */
interface AddFavoriteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFavorite: (name: string, type: 'search' | 'tag' | 'view') => void;
}

export const AddFavoriteModal: React.FC<AddFavoriteModalProps> = ({
  isOpen,
  onClose,
  onAddFavorite,
}) => {
  const [favoriteName, setFavoriteName] = useState('');
  const [favType, setFavType] = useState<'search' | 'tag' | 'view'>('view');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!favoriteName.trim()) return;
    onAddFavorite(favoriteName.trim(), favType);
    setFavoriteName('');
    onClose();
  };

  const quickPresets = [
    { label: 'Recent Video Edits', type: 'view' as const },
    { label: '4K Master Deliveries', type: 'tag' as const },
    { label: 'Unsplash RAW Library', type: 'search' as const },
    { label: 'Color Graded Stills', type: 'tag' as const },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div 
        className="w-full max-w-md macos-window rounded-2xl overflow-hidden shadow-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Star className="w-4 h-4 fill-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Add to Favorites</h3>
              <p className="text-[10px] text-neutral-400">Pin quick shortcut to sidebar navigation</p>
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
              Favorite Name
            </label>
            <input
              type="text"
              autoFocus
              value={favoriteName}
              onChange={e => setFavoriteName(e.target.value)}
              placeholder="e.g. Master Exports"
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/50 transition-all font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Quick Suggestions
            </label>
            <div className="flex flex-wrap gap-1.5">
              {quickPresets.map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setFavoriteName(preset.label);
                    setFavType(preset.type);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-neutral-300 hover:text-white transition-colors"
                >
                  + {preset.label}
                </button>
              ))}
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
              disabled={!favoriteName.trim()}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-lg shadow-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Add Favorite
            </button>
          </div>
        </form>
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
        className="w-full max-w-md macos-window rounded-2xl overflow-hidden shadow-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-150"
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
interface JoinIncomingLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoinLibrary: (name: string, inviteUrlOrCode: string, ownerName: string) => void;
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

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!libraryName.trim()) return;
    onJoinLibrary(
      libraryName.trim(),
      inviteCode.trim() || `p2p://peer-relay.mesh/stream/${Math.random().toString(36).substring(7)}`,
      ownerName.trim() || 'Elena Rostova'
    );
    setLibraryName('');
    setInviteCode('');
    setOwnerName('');
    setP2pPassphrase('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div 
        className="w-full max-w-md macos-window rounded-2xl overflow-hidden shadow-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
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
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50 transition-all font-sans"
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
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50 transition-all font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Sender P2P Node URI / Swarm Link
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value)}
              placeholder="p2p://cph-node-042.mesh/media/nordic-reel#stream"
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50 transition-all font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              P2P Pre-shared Encryption Key / Secret (Optional)
            </label>
            <input
              type="password"
              value={p2pPassphrase}
              onChange={e => setP2pPassphrase(e.target.value)}
              placeholder="••••••••••••••••••••••••"
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/15 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/50 transition-all font-mono"
            />
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-200 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Encrypted P2P stream verified with SHA-256 block chunk hashing.</span>
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
              disabled={!libraryName.trim()}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Connect P2P Stream
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
