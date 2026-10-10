import React, { useState } from 'react';
import {
  X, Share2, Users, Shield, Copy, Check, Lock, UserPlus,
  Mail, Clock, Key, Globe, Eye, Sparkles, ChevronDown, Trash2,
  Radio, Wifi, ArrowUpRight, ArrowDownLeft, ShieldCheck, Play, Pause, FolderDown, Unlink,
} from '@/src/icons';
import { SharedLibrary, SharedMember, P2PPeer } from '../types';
import { peerStatusLabel, shortPeerId } from '../utils/p2pPeers';

interface ShareLibraryModalProps {
  library: SharedLibrary;
  isOpen: boolean;
  onClose: () => void;
  onUpdateLibrary: (updated: SharedLibrary) => void;
  /** Remove an incoming library from this device (stop receiving / unlink). */
  onDisconnectLibrary?: (libraryId: string) => void;
}

export const ShareLibraryModal: React.FC<ShareLibraryModalProps> = ({
  library,
  isOpen,
  onClose,
  onUpdateLibrary,
  onDisconnectLibrary,
}) => {
  const isOutgoing = library.direction === 'outgoing';
  const [activeTab, setActiveTab] = useState<'peers' | 'link' | 'protocol'>(isOutgoing ? 'peers' : 'protocol');
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [peerNodeId, setPeerNodeId] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer' | 'admin'>('editor');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [bandwidthCap, setBandwidthCap] = useState<string>(library.seedingBandwidthCap || '100 MB/s');
  const [isSeedingActive, setIsSeedingActive] = useState<boolean>(library.seedingStatus !== 'paused');
  const [showNotification, setShowNotification] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  if (!isOpen) return null;

  const handleAddSpecifiedPeer = (e: React.FormEvent) => {
    e.preventDefault();
    const tokens = inviteEmail
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (!tokens.length) return;

    const currentPeers = library.seedingPeers || [];
    const existing = new Set(
      currentPeers.map(p => (p.email || p.peerNodeId || '').toLowerCase()),
    );
    const stamp = Date.now();
    const addedPeers: P2PPeer[] = [];
    const addedMembers: SharedMember[] = [];
    let skipped = 0;

    tokens.forEach((token, i) => {
      const key = token.toLowerCase();
      if (existing.has(key)) {
        skipped += 1;
        return;
      }
      existing.add(key);
      const name = token.includes('@') ? token.split('@')[0] : token;
      const nodeHint = i === 0 && peerNodeId.trim() ? peerNodeId.trim() : undefined;
      addedPeers.push({
        id: `p-${stamp}-${i}`,
        name,
        email: token,
        peerNodeId: nodeHint,
        status: 'pending',
        role: inviteRole,
      });
      addedMembers.push({
        id: `m-${stamp}-${i}`,
        name,
        email: token,
        role: inviteRole,
        status: 'pending',
      });
    });

    if (!addedPeers.length) {
      setShowNotification(skipped ? 'Those peers are already authorized.' : 'Enter at least one email or node ID.');
      setTimeout(() => setShowNotification(null), 3000);
      return;
    }

    const nextMembers = [...library.members, ...addedMembers];
    const updated: SharedLibrary = {
      ...library,
      seedingPeers: [...currentPeers, ...addedPeers],
      members: nextMembers,
      memberCount: nextMembers.length,
    };

    onUpdateLibrary(updated);
    setInviteEmail('');
    setPeerNodeId('');
    const label = addedPeers.length === 1
      ? `Added ${addedPeers[0].name} (${addedPeers[0].email}). Seeding initiated.`
      : `Added ${addedPeers.length} specified P2P peers. Seeding initiated.`;
    setShowNotification(skipped ? `${label} (${skipped} skipped — already listed)` : label);
    setTimeout(() => setShowNotification(null), 3500);
  };

  const handleRemovePeer = (peerId: string) => {
    const currentPeers = library.seedingPeers || [];
    const targetPeer = currentPeers.find(p => p.id === peerId);
    const updated: SharedLibrary = {
      ...library,
      seedingPeers: currentPeers.filter(p => p.id !== peerId),
      members: library.members.filter(m => m.email !== targetPeer?.email),
      memberCount: Math.max(1, library.members.length - 1),
    };
    onUpdateLibrary(updated);
    setShowNotification(`Revoked P2P seeding access for peer.`);
    setTimeout(() => setShowNotification(null), 3000);
  };

  const toggleSeedingState = () => {
    const nextState = !isSeedingActive;
    setIsSeedingActive(nextState);
    const updated: SharedLibrary = {
      ...library,
      seedingStatus: nextState ? 'active' : 'paused',
      transferSpeed: nextState ? '32.7 MB/s' : 'Paused',
    };
    onUpdateLibrary(updated);
    setShowNotification(nextState ? 'P2P seeding resumed to specified peers' : 'P2P seeding paused');
    setTimeout(() => setShowNotification(null), 3000);
  };

  const handleDisconnectIncoming = () => {
    if (!onDisconnectLibrary) return;
    onDisconnectLibrary(library.id);
    setConfirmDisconnect(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="app-modal-panel relative flex flex-col w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl macos-glass-card">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-950/80">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isOutgoing
                ? 'bg-sky-500/15 border-sky-400/30 text-sky-300'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            }`}>
              {isOutgoing ? <Radio className="w-5 h-5 animate-pulse" /> : <FolderDown className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white">
                  {library.name}
                </h2>
                <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-mono font-semibold border ${
                  isOutgoing
                    ? 'text-sky-300 bg-sky-950/50 border-sky-400/30'
                    : 'text-emerald-300 bg-emerald-950/50 border-emerald-500/30'
                }`}>
                  <Shield className="w-3 h-3" />
                  {isOutgoing ? 'P2P Seeder to Specified Users' : 'Incoming Encrypted P2P Media'}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                {isOutgoing 
                  ? 'Currently seeding media chunks to explicitly specified P2P peer users.'
                  : `Media library received from ${library.senderPeerName || library.ownerName} via encrypted P2P protocol.`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Notification */}
        {showNotification && (
          <div className="bg-sky-950/60 border-b border-sky-500/30 px-6 py-2.5 text-xs text-sky-200 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>{showNotification}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-black/20 text-xs px-6">
          {isOutgoing ? (
            <button
              onClick={() => setActiveTab('peers')}
              className={`py-3 font-medium border-b-2 mr-6 transition-colors flex items-center gap-2 ${
                activeTab === 'peers'
                  ? 'border-sky-400 text-sky-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Specified P2P Recipients ({library.seedingPeers?.length || library.members.length - 1})</span>
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('protocol')}
              className={`py-3 font-medium border-b-2 mr-6 transition-colors flex items-center gap-2 ${
                activeTab === 'protocol'
                  ? 'border-emerald-400 text-emerald-400'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>Sender Peer & Connection Details</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('link')}
            className={`py-3 font-medium border-b-2 mr-6 transition-colors flex items-center gap-2 ${
              activeTab === 'link'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Invite links</span>
          </button>

          <button
            onClick={() => setActiveTab('protocol')}
            className={`py-3 font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'protocol'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Encryption details</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
          
          {/* TAB 1: OUTGOING SPECIFIED P2P PEERS */}
          {activeTab === 'peers' && isOutgoing && (
            <div className="space-y-5">
              
              {/* Seeding Control Bar */}
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isSeedingActive ? 'bg-sky-400 animate-ping' : 'bg-neutral-600'}`} />
                    <span>Seeding Status: {isSeedingActive ? 'Active (Uploading Chunks)' : 'Paused'}</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-0.5 font-mono">
                    Speed: {isSeedingActive ? (library.transferSpeed || '32.7 MB/s') : '0.0 MB/s'} • Cap: {bandwidthCap}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={bandwidthCap}
                    onChange={e => setBandwidthCap(e.target.value)}
                    className="bg-black/60 border border-white/10 text-[11px] text-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-400/50 font-mono"
                  >
                    <option value="50 MB/s">Cap: 50 MB/s</option>
                    <option value="100 MB/s">Cap: 100 MB/s</option>
                    <option value="Unlimited">Unlimited (10GbE)</option>
                  </select>

                  <button
                    type="button"
                    onClick={toggleSeedingState}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      isSeedingActive
                        ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30 hover:bg-amber-500/30'
                        : 'bg-sky-500/20 text-sky-200 border border-sky-400/30 hover:bg-sky-500/30'
                    }`}
                  >
                    {isSeedingActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isSeedingActive ? 'Pause Seeding' : 'Resume Seeding'}</span>
                  </button>
                </div>
              </div>

              {/* Add Specified Peers Form — supports multiple emails */}
              <form onSubmit={handleAddSpecifiedPeer} className="space-y-3 p-4 rounded-xl bg-black/40 border border-white/10">
                <label className="text-xs font-semibold text-neutral-200 block">
                  Add Specified P2P Users
                </label>
                <p className="text-[11px] text-neutral-400 -mt-1 mb-2">
                  Enter one email or node ID, or paste several separated by commas / new lines.
                </p>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-neutral-500" />
                  <textarea
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    rows={2}
                    placeholder={"peer@example.org\neditor@studio.com, viewer@client.org"}
                    className="w-full bg-neutral-950 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-sky-400 font-mono resize-y min-h-[2.75rem]"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                  <div className="md:col-span-5">
                    <input
                      type="text"
                      value={peerNodeId}
                      onChange={e => setPeerNodeId(e.target.value)}
                      placeholder="Optional node ID for first peer"
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-sky-400 font-mono"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <select
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value as 'editor' | 'viewer' | 'admin')}
                      className="w-full bg-neutral-950 border border-white/10 rounded-xl px-2.5 py-2 text-xs text-neutral-200 focus:outline-none focus:border-sky-400"
                    >
                      <option value="editor">Editor (Sync & Grade)</option>
                      <option value="viewer">Viewer (Stream Only)</option>
                      <option value="admin">Admin (Co-host)</option>
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <button
                      type="submit"
                      className="w-full bg-sky-500 hover:bg-sky-400 text-white py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-sky-500/20"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Authorize</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* Specified Peers List */}
              <div className="space-y-2 pt-1">
                <h4 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Specified Recipients ({library.seedingPeers?.length || 0})</span>
                  <span className="font-mono text-[10px] text-sky-400">Invited peers</span>
                </h4>
                
                <div className="divide-y divide-white/5 border border-white/10 rounded-xl bg-neutral-950/60 overflow-hidden">
                  {(library.seedingPeers || []).length === 0 ? (
                    <div className="p-4 text-center text-xs text-neutral-400 italic">
                      No recipients yet. Add emails above — they stay pending until a peer connects.
                    </div>
                  ) : (
                    (library.seedingPeers || []).map(peer => (
                      <div key={peer.id} className="flex items-center justify-between p-3.5 hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-400/20 flex items-center justify-center font-bold text-xs text-sky-300 shrink-0">
                            {peer.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-white truncate">{peer.name}</span>
                              <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                                peer.status === 'seeding' ? 'bg-sky-500/15 text-sky-300 border-sky-400/30' :
                                peer.status === 'connected' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                                peer.status === 'pending' ? 'bg-amber-500/10 text-amber-300 border-amber-500/25' :
                                'bg-neutral-800 text-neutral-400 border-neutral-700'
                              }`}>
                                {peerStatusLabel(peer)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono truncate">
                              {peer.email && <span>{peer.email}</span>}
                              {peer.peerNodeId && (
                                <>
                                  {peer.email && <span>•</span>}
                                  <span className="text-neutral-500" title={peer.peerNodeId}>
                                    Node: {shortPeerId(peer.peerNodeId)}
                                  </span>
                                </>
                              )}
                              {!peer.peerNodeId && peer.status === 'pending' && (
                                <span className="text-neutral-500">Waiting for peer</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-neutral-300 uppercase">
                            {peer.role}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemovePeer(peer.id)}
                            className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition-colors"
                            title="Revoke peer seeding access"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB: SENDER PEER & CONNECTION DETAILS (INCOMING) */}
          {activeTab === 'protocol' && !isOutgoing && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white">Incoming encrypted library</h3>
                  <p className="text-[11px] text-neutral-300 mt-0.5">
                    This library was received directly from another person's device. Its files are encrypted with AES-256-GCM.
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center p-3 rounded-xl bg-neutral-950 border border-white/10">
                  <span className="text-neutral-400">Sender User:</span>
                  <span className="font-semibold text-white">{library.senderPeerName || library.ownerName}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-neutral-950 border border-white/10">
                  <span className="text-neutral-400">Sender Peer Email:</span>
                  <span className="font-mono text-emerald-300">{library.senderPeerEmail || library.ownerEmail}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-neutral-950 border border-white/10">
                  <span className="text-neutral-400">Sender P2P Node ID:</span>
                  <span className="font-mono text-neutral-300">{library.senderPeerNodeId || 'Unknown'}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-neutral-950 border border-white/10">
                  <span className="text-neutral-400">Encrypted P2P Protocol:</span>
                  <span className="font-mono text-cyan-300">{library.p2pProtocol || 'Encrypted P2P (AES-256-GCM)'}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-neutral-950 border border-white/10">
                  <span className="text-neutral-400">Connected peers:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{library.p2pSwarmPeers ?? 0}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-xl bg-neutral-950 border border-white/10">
                  <span className="text-neutral-400">P2P Stream Download Speed:</span>
                  <span className="font-mono text-emerald-400 font-semibold">{library.transferSpeed || '—'}</span>
                </div>
              </div>

              {onDisconnectLibrary && (
                <div className="pt-2 border-t border-white/10">
                  {confirmDisconnect ? (
                    <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-red-200">Disconnect from this library?</div>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          Stops receiving encrypted chunks from {library.senderPeerName || library.ownerName}. Files already on this device stay local; you can re-join later with an invite.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setConfirmDisconnect(false)}
                          className="px-3 py-1.5 rounded-lg bg-neutral-850 hover:bg-neutral-800 text-neutral-300 text-xs font-medium transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleDisconnectIncoming}
                          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDisconnect(true)}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-800/50 text-red-300 hover:text-red-100 text-xs font-medium transition-all flex items-center justify-center gap-1.5"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      Disconnect from Incoming Library
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ENCRYPTED LINK / MAGNET */}
          {activeTab === 'link' && (
            <div className="space-y-5">
              <div className="p-4 bg-black/40 rounded-xl border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">Invite links</span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Invite links are created when you add a recipient to a library, not on this screen. This screen used to show a placeholder link that did not work.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: Encryption details */}
          {activeTab === 'protocol' && isOutgoing && (
            <div className="space-y-4">
              <div className="p-4 bg-sky-950/20 border border-sky-500/30 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-sky-300 text-xs font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>How sharing is encrypted</span>
                </div>
                <p className="text-xs text-neutral-300">
                  Files are split into 1 MiB chunks, each encrypted with AES-256-GCM. The library key is wrapped for each invited peer.
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between p-3 rounded-xl bg-neutral-950 border border-white/10">
                  <span className="text-neutral-400">Stream Cipher:</span>
                  <span className="font-mono text-neutral-200">AES-256-GCM (chunked)</span>
                </div>
                <div className="flex justify-between p-3 rounded-xl bg-neutral-950 border border-white/10">
                  <span className="text-neutral-400">Seeder Bandwidth Limit:</span>
                  <span className="font-mono text-sky-400 font-semibold">{bandwidthCap}</span>
                </div>
                <div className="flex justify-between p-3 rounded-xl bg-neutral-950 border border-white/10">
                  <span className="text-neutral-400">Peer Authorization:</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Invite-based
                  </span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-white/10 bg-neutral-950/80">
          <span className="text-[10px] text-neutral-500 font-mono">
            {isOutgoing ? 'Cloudbreak P2P Seeder • private invite-dial' : 'Cloudbreak Encrypted Receiver'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold shadow-md shadow-sky-500/20 transition-all"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
