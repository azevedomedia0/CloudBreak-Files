import React from 'react';
import { Plus, ChevronDown, Database, Server, Usb, Disc } from 'lucide-react';
import { RemovableDevice } from '../../types';
import { formatBytes } from '../../utils/format';
import { SidebarSectionKey } from './sectionKey';

export interface NetworkSectionProps {
  onAddNetworkServer?: () => void;
  networkServers: Array<{ name: string; desc: string; icon?: any; online: boolean }>;
  removableDevices: RemovableDevice[];
  onEjectDevice?: (deviceId: string) => void;
  onSelectRemovableDevice?: (device: RemovableDevice) => void;
  selectedRemovableDeviceId?: string | null;
  collapsed: Partial<Record<SidebarSectionKey, boolean>>;
  toggleSection: (section: SidebarSectionKey) => void;
  onlineServerCount: number;
  totalServerCount: number;
}

export const NetworkSection: React.FC<NetworkSectionProps> = ({ onAddNetworkServer, networkServers, removableDevices, onEjectDevice, onSelectRemovableDevice, selectedRemovableDeviceId, collapsed, toggleSection, onlineServerCount, totalServerCount }) => (
    <div className="space-y-0.5">
      <div 
        onClick={() => toggleSection('network')}
        className="flex items-center justify-between px-2 pb-1 text-[10px] font-semibold tracking-wider uppercase text-neutral-400 cursor-pointer hover:text-neutral-200 transition-colors group"
      >
        <div className="flex items-center gap-1.5">
          <span>Network</span>
          <ChevronDown className={`w-3 h-3 text-neutral-500 group-hover:text-neutral-300 transition-transform duration-200 ${collapsed.network ? '-rotate-90' : ''}`} />
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddNetworkServer?.();
          }}
          className="w-4 h-4 flex items-center justify-center bg-transparent text-neutral-400 hover:text-orange-300 transition-colors"
          title="Connect to Server (SMB/NFS)"
          aria-label="Connect to Server (SMB/NFS)"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
      </div>

      {!collapsed.network && (
        <div className="space-y-2 pt-0.5">
          {/* Removable Devices Connected to Computer */}
          {removableDevices.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-2 pt-0.5 pb-1 text-[9px] font-semibold tracking-wider uppercase text-neutral-500 flex items-center justify-between">
                <span>Removable Devices</span>
                <span className="font-mono text-[9px] text-neutral-400">
                  {removableDevices.filter(d => d.mounted).length} Attached
                </span>
              </div>
              {removableDevices.map(dev => {
                const isSelected = selectedRemovableDeviceId === dev.id;
                return (
                  <button
                    key={dev.id}
                    type="button"
                    onClick={() => onSelectRemovableDevice?.(dev)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all group text-left ${
                      isSelected
                        ? 'bg-sky-500/20 text-sky-200 font-medium shadow-sm'
                        : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                    }`}
                    title={`${dev.name} (${dev.connectionType})\nMount: ${dev.mountPoint}\nFormat: ${dev.fileSystem}\nFree: ${formatBytes(dev.freeBytes)} of ${formatBytes(dev.capacityBytes)}`}
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      {dev.type === 'memory_card' ? (
                        <Disc className={`w-4 h-4 shrink-0 ${isSelected ? 'text-amber-400' : 'text-amber-400/80'}`} />
                      ) : dev.type === 'thunderbolt_raid' ? (
                        <Database className={`w-4 h-4 shrink-0 ${isSelected ? 'text-purple-400' : 'text-purple-400/80'}`} />
                      ) : (
                        <Usb className={`w-4 h-4 shrink-0 ${isSelected ? 'text-sky-400' : 'text-sky-400/80'}`} />
                      )}
                      <div className="truncate min-w-0">
                        <div className="truncate font-medium leading-tight text-[11px]">{dev.name}</div>
                        <div className="text-[9px] text-neutral-500 truncate font-mono">
                          {dev.connectionType} • {formatBytes(dev.freeBytes)} free
                        </div>
                      </div>
                    </div>

                    {/* Eject Icon Button */}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEjectDevice?.(dev.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          onEjectDevice?.(dev.id);
                        }
                      }}
                      title={`Safely Eject ${dev.name}`}
                      aria-label={`Eject ${dev.name}`}
                      className="w-5 h-5 flex items-center justify-center rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition-all opacity-0 group-hover:opacity-100 shrink-0 cursor-pointer ml-1"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m12 4-6 7h12l-6-7Z"/>
                        <path d="M6 17h12"/>
                      </svg>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Network Servers & Nodes */}
          <div className="space-y-0.5">
            <div className="px-2 pt-0.5 pb-1 text-[9px] font-semibold tracking-wider uppercase text-neutral-500 flex items-center justify-between">
              <span>Network Servers</span>
              <span className="font-mono text-[9px] text-neutral-400">
                {onlineServerCount}/{totalServerCount} Online
              </span>
            </div>
            {networkServers.map(net => {
              const Icon = net.icon || Server;
              return (
                <button
                  key={net.name}
                  type="button"
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-neutral-300 hover:bg-white/5 hover:text-white transition-colors group text-left"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Icon className="w-4 h-4 text-orange-400 shrink-0" />
                    <div className="truncate">
                      <div className="truncate font-medium leading-tight">{net.name}</div>
                      <div className="text-[9px] text-neutral-500 truncate font-mono">{net.desc}</div>
                    </div>
                  </div>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${net.online ? 'bg-emerald-400 shadow-sm shadow-emerald-500/50' : 'bg-neutral-600'}`} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
);
