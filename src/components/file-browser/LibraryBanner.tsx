import React from 'react';
import { ShieldCheck, FolderDown, FolderUp, Users, Wifi, Copy, Radio } from 'lucide-react';
import { FileItem, SharedLibrary } from '../../types';
import { formatBytes } from '../../utils/format';
import type { SwarmStatus } from '../../services/p2pBridge';

export interface LibraryBannerProps {
  files: FileItem[];
  selectedLibrary: SharedLibrary;
  totalSize: number;
  onShareFile: (file: FileItem) => void;
  swarmStatus?: SwarmStatus | null;
  onCopyInvite?: () => void;
  onRefreshSwarm?: () => void;
}

export const LibraryBanner: React.FC<LibraryBannerProps> = ({
  files, selectedLibrary, totalSize, onShareFile, swarmStatus, onCopyInvite, onRefreshSwarm,
}) => (

    <div className={`px-4 py-3 border-b backdrop-blur-md z-10 transition-colors ${
      selectedLibrary.direction === 'incoming'
        ? 'bg-emerald-950/40 border-emerald-500/25'
        : 'bg-purple-950/40 border-purple-500/25'
    }`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`p-2 rounded-xl shrink-0 mt-0.5 border ${
            selectedLibrary.direction === 'incoming'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-purple-500/15 border-purple-400/30 text-purple-300'
          }`}>
            {selectedLibrary.direction === 'incoming' ? (
              <FolderDown className="w-5 h-5" />
            ) : (
              <FolderUp className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white tracking-tight">{selectedLibrary.name}</h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border flex items-center gap-1 ${
                selectedLibrary.direction === 'incoming'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-purple-500/15 text-purple-300 border-purple-400/30'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-current" />
                {selectedLibrary.direction === 'incoming'
                  ? 'Incoming P2P Media (Encrypted Protocol)'
                  : `Outgoing P2P (Seeding to Specified Users)`}
              </span>
              <span className="text-[10px] font-mono text-neutral-400 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
                {files.length} {files.length === 1 ? 'file' : 'files'} ({formatBytes(totalSize)})
              </span>
            </div>

            <p className="text-xs text-neutral-300 mt-0.5 leading-snug line-clamp-1">
              {selectedLibrary.direction === 'incoming' ? (
                <>
                  Received from <strong className="text-emerald-300 font-semibold">{selectedLibrary.senderPeerName || selectedLibrary.ownerName}</strong> ({selectedLibrary.senderPeerEmail || selectedLibrary.ownerEmail}) via encrypted P2P protocol.
                </>
              ) : (
                <>
                  Currently seeding to <strong className="text-purple-300 font-semibold">{selectedLibrary.seedingPeers?.length || Math.max(1, selectedLibrary.members.length - 1)} specified P2P users</strong> with zero-knowledge encryption.
                </>
              )}
            </p>

            {/* Technical Protocol & Node details */}
            <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[10px] font-mono">
              <span className="text-neutral-400 bg-black/40 border border-white/5 px-2 py-0.5 rounded flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-cyan-400" />
                <span>Cipher: {selectedLibrary.p2pEncryptionCipher || 'AES-256-GCM Zero-Knowledge'}</span>
              </span>

              <span className="text-neutral-400 bg-black/40 border border-white/5 px-2 py-0.5 rounded flex items-center gap-1">
                <Wifi className="w-3 h-3 text-sky-400" />
                <span>Protocol: {selectedLibrary.p2pProtocol || 'Cloudbreak private · invite-dial only'}</span>
              </span>

              <span className="text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded flex items-center gap-1 font-semibold">
                <ShieldCheck className="w-3 h-3" />
                <span>Private mode · no DHT/STUN</span>
              </span>

              {swarmStatus && (
                <span className="text-neutral-400 bg-black/40 border border-white/5 px-2 py-0.5 rounded flex items-center gap-1">
                  <Radio className="w-3 h-3 text-amber-400" />
                  <span>
                    Invite peers: {swarmStatus.peers.filter(p => p.connected).length}
                    {' · '}↑{formatBytes(swarmStatus.bytesSent)} ↓{formatBytes(swarmStatus.bytesReceived)}
                    {swarmStatus.privateMode ? ' · private' : ''}
                  </span>
                </span>
              )}

              {(selectedLibrary.transferSpeed || swarmStatus) && (
                <span className={`px-2 py-0.5 rounded font-semibold border ${
                  selectedLibrary.direction === 'incoming'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    : 'bg-purple-500/10 text-purple-300 border-purple-400/20'
                }`}>
                  {selectedLibrary.direction === 'incoming'
                    ? `↓ ${selectedLibrary.transferSpeed || formatBytes(swarmStatus?.bytesReceived ?? 0)}`
                    : `↑ Seeding · ${swarmStatus?.listening ? 'listening' : 'local'}`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons on the right */}
        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
          {onCopyInvite && selectedLibrary.direction === 'outgoing' && (
            <button
              type="button"
              onClick={onCopyInvite}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-neutral-200 border border-white/15 transition-all"
              title="Copy aetherlib invite"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Invite</span>
            </button>
          )}
          {onRefreshSwarm && (
            <button
              type="button"
              onClick={onRefreshSwarm}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-neutral-200 border border-white/15 transition-all"
              title="Refresh swarm status"
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>Swarm</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onShareFile(files[0] || ({} as FileItem))}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all ${
              selectedLibrary.direction === 'incoming'
                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40'
                : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/40'
            }`}
            title={selectedLibrary.direction === 'incoming' ? 'View P2P Peer Connection Info' : 'Manage Specified P2P Users & Seeding'}
          >
            <Users className="w-3.5 h-3.5" />
            <span>
              {selectedLibrary.direction === 'incoming'
                ? 'P2P Peer Info'
                : 'Manage Specified Peers'}
            </span>
          </button>
        </div>
      </div>

      {/* Outgoing specific: List of Specified P2P Users being seeded to */}
      {selectedLibrary.direction === 'outgoing' && selectedLibrary.seedingPeers && selectedLibrary.seedingPeers.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center gap-2 overflow-x-auto text-[10px]">
          <span className="text-neutral-400 shrink-0 font-medium">Specified P2P Recipients:</span>
          <div className="flex items-center gap-1.5 flex-nowrap">
            {selectedLibrary.seedingPeers.map(peer => (
              <span
                key={peer.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/40 border border-sky-400/20 text-neutral-200 font-mono shrink-0"
                title={`Peer Node: ${peer.peerNodeId || 'relay'}\nTransfer Speed: ${peer.transferSpeed || 'Active'}\nStatus: ${peer.status}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  peer.status === 'seeding' ? 'bg-sky-400 animate-pulse' :
                  peer.status === 'connected' ? 'bg-emerald-400' : 'bg-neutral-500'
                }`} />
                <span className="text-white font-sans">{peer.name}</span>
                {peer.transferSpeed && peer.status === 'seeding' && (
                  <span className="text-sky-300 font-bold">({peer.transferSpeed})</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
);
