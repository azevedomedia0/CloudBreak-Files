import React from 'react';
import { Radio, Settings } from '@/src/icons';
import { SharedLibrary } from '../../types';
import type { SwarmStatus } from '../../services/p2pBridge';

export interface ProfileFooterProps {
  onOpenVaultSecurity: () => void;
  onOpenProfileSettings?: () => void;
  userProfile: { name: string; email: string; avatarUrl?: string; role?: string };
  incomingLibraries: SharedLibrary[];
  outgoingLibraries: SharedLibrary[];
  onlineServerCount: number;
  totalServerCount: number;
  swarmStatus?: SwarmStatus | null;
}

export const ProfileFooter: React.FC<ProfileFooterProps> = ({
  onOpenVaultSecurity,
  onOpenProfileSettings,
  userProfile,
  incomingLibraries,
  outgoingLibraries,
  onlineServerCount,
  totalServerCount,
  swarmStatus = null,
}) => {
  const connectedPeers = swarmStatus?.peers.filter(p => p.connected).length ?? 0;
  const serversOnline = onlineServerCount > 0;

  return (
  <div className="shrink-0 mt-auto p-2.5 border-t border-white/8 bg-black/25">
    <div className="mb-2 p-2 rounded-xl bg-white/[0.04] border border-white/8 flex flex-col gap-1.5 text-[10px]">
      <div className="flex items-center justify-between text-neutral-300">
        <div className="flex items-center gap-1.5">
          {serversOnline ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          ) : (
            <span className="inline-flex rounded-full h-2 w-2 bg-neutral-600" title="No reachable network servers" />
          )}
          <span className="text-neutral-200 font-medium text-[11px]">Server Nodes</span>
        </div>
        <span
          className={`font-mono font-semibold px-1.5 py-0.5 rounded text-[10px] border ${
            serversOnline
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-neutral-400 bg-white/5 border-white/10'
          }`}
          title="Mounted network volumes and saved servers that respond on the network"
        >
          {totalServerCount === 0 ? 'None' : `${onlineServerCount}/${totalServerCount} online`}
        </span>
      </div>

      <div className="flex items-center justify-between text-neutral-300 pt-1 border-t border-white/5">
        <div className="flex items-center gap-1.5 text-neutral-400">
          <Radio className="w-3 h-3 text-sky-400 shrink-0" />
          <span className="text-neutral-300 font-medium text-[10px]">P2P Protocol</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-mono">
          <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.2 rounded" title="Incoming P2P libraries">
            {incomingLibraries.length} In
          </span>
          <span className="text-purple-300 bg-purple-500/10 border border-purple-400/20 px-1 py-0.2 rounded" title="Outgoing libraries">
            {outgoingLibraries.length} Out
          </span>
          {connectedPeers > 0 && (
            <span className="text-neutral-300 bg-white/5 border border-white/10 px-1 py-0.2 rounded" title="Connected libp2p peers">
              {connectedPeers} peer{connectedPeers === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
    </div>

    <button
      onClick={onOpenProfileSettings || onOpenVaultSecurity}
      className="w-full flex items-center justify-between p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/8 transition-all text-xs group text-left cursor-pointer"
      title="Profile & App Settings"
      aria-label="Profile and App Settings"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-[11px] font-bold text-white shadow-sm shadow-sky-500/20 overflow-hidden">
            {userProfile?.avatarUrl ? (
              <img src={userProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              userProfile?.name ? userProfile.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'SA'
            )}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-neutral-900" title="Active Session" />
        </div>

        <div className="truncate min-w-0">
          <div className="font-semibold text-neutral-100 text-[11px] leading-tight truncate group-hover:text-white transition-colors">
            {userProfile?.name || 'User'}
          </div>
          <div className="text-[9px] text-neutral-400 truncate flex items-center gap-1 group-hover:text-sky-300 transition-colors">
            <span>Profile & App Settings</span>
          </div>
        </div>
      </div>

      <div className="p-1 rounded-md text-neutral-400 group-hover:text-sky-300 group-hover:bg-white/5 transition-all shrink-0">
        <Settings className="w-3.5 h-3.5 group-hover:rotate-45 transition-transform duration-300" />
      </div>
    </button>
  </div>
  );
};
