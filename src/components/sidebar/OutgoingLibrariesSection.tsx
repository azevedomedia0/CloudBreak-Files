import React from 'react';
import { Plus, ChevronDown } from '@/src/icons';
import { SharedLibrary } from '../../types';
import { SidebarSectionKey } from './sectionKey';
import { OutgoingLibraryIcon } from './OutgoingLibraryIcon';

export interface OutgoingLibrariesSectionProps {
  onSelectFolder: (folderId: string | null) => void;
  selectedLibraryId: string | null;
  onSelectLibrary: (libraryId: string | null) => void;
  onAddNewSharedLibrary?: () => void;
  onAddNewOutgoingLibrary?: () => void;
  collapsed: Partial<Record<SidebarSectionKey, boolean>>;
  toggleSection: (section: SidebarSectionKey) => void;
  outgoingLibraries: SharedLibrary[];
}

export const OutgoingLibrariesSection: React.FC<OutgoingLibrariesSectionProps> = ({ onSelectFolder, selectedLibraryId, onSelectLibrary, onAddNewSharedLibrary, onAddNewOutgoingLibrary, collapsed, toggleSection, outgoingLibraries }) => (
    <div className="space-y-0.5">
      <div 
        onClick={() => toggleSection('outgoingLibraries')}
        className="flex items-center justify-between px-2 pb-1 text-[10px] font-semibold tracking-wider uppercase text-neutral-400 cursor-pointer hover:text-neutral-200 transition-colors group"
        title="Media libraries currently seeding to specified P2P users"
      >
        <div className="flex items-center gap-1.5">
          <span>Outgoing Libraries</span>
          <ChevronDown className={`w-3 h-3 text-neutral-500 group-hover:text-neutral-300 transition-transform duration-200 ${collapsed.outgoingLibraries ? '-rotate-90' : ''}`} />
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onAddNewOutgoingLibrary) onAddNewOutgoingLibrary();
            else if (onAddNewSharedLibrary) onAddNewSharedLibrary();
          }}
          className="w-4 h-4 flex items-center justify-center bg-transparent text-neutral-400 hover:text-purple-300 transition-colors"
          title="Seed New Media Library to Specified P2P Users"
          aria-label="Seed New Media Library"
        >
          <Plus className="w-3 h-3 stroke-[2.5]" />
        </button>
      </div>

      {!collapsed.outgoingLibraries && (
        <div className="space-y-0.5">
          {outgoingLibraries.length === 0 ? (
            <div className="px-2.5 py-1 text-[10px] text-neutral-500 italic">No outgoing seeding libraries</div>
          ) : (
            outgoingLibraries.map(lib => {
              const isSelected = selectedLibraryId === lib.id;
              const peerCount = lib.seedingPeers?.length || Math.max(1, lib.members.length - 1);
              return (
                <button
                  key={lib.id}
                  onClick={() => {
                    onSelectLibrary(lib.id);
                    onSelectFolder(null);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all text-left ${
                    isSelected
                      ? 'bg-purple-500/20 text-purple-100 font-medium shadow-sm border border-purple-400/30'
                      : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                  }`}
                  title={`Currently seeding to ${peerCount} specified P2P users\nSpeed: ${lib.transferSpeed || 'Active'}\nProtocol: ${lib.p2pProtocol || 'Zero-Knowledge P2P Seeder'}`}
                >
                  <div className="flex items-center gap-2 truncate min-w-0">
                    <OutgoingLibraryIcon
                      className={`w-4 h-4 shrink-0 ${isSelected ? 'text-purple-400' : 'text-purple-400/80'}`}
                      title="Outgoing library"
                    />
                    <div className="truncate min-w-0">
                      <div className="truncate text-[11px] leading-tight">{lib.name}</div>
                      <div className="text-[9px] text-purple-400/80 truncate flex items-center gap-1 font-mono">
                        <span className="w-1 h-1 rounded-full bg-purple-400 animate-pulse inline-block" />
                        <span>Seeding to {peerCount} {peerCount === 1 ? 'peer' : 'peers'}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
);
