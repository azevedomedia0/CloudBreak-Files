import React from 'react';
import { Plus, ChevronDown } from '@/src/icons';
import { SharedLibrary } from '../../types';
import { SidebarSectionKey } from './sectionKey';
import { IncomingLibraryIcon } from './IncomingLibraryIcon';

export interface IncomingLibrariesSectionProps {
  onSelectFolder: (folderId: string | null) => void;
  selectedLibraryId: string | null;
  onSelectLibrary: (libraryId: string | null) => void;
  onAddNewSharedLibrary?: () => void;
  onAddNewIncomingLibrary?: () => void;
  collapsed: Partial<Record<SidebarSectionKey, boolean>>;
  toggleSection: (section: SidebarSectionKey) => void;
  incomingLibraries: SharedLibrary[];
}

export const IncomingLibrariesSection: React.FC<IncomingLibrariesSectionProps> = ({ onSelectFolder, selectedLibraryId, onSelectLibrary, onAddNewSharedLibrary, onAddNewIncomingLibrary, collapsed, toggleSection, incomingLibraries }) => (
    <div className="space-y-0.5">
      <div 
        onClick={() => toggleSection('incomingLibraries')}
        className="flex items-center justify-between px-2 pb-1 text-[10px] font-semibold tracking-wider uppercase text-neutral-400 cursor-pointer hover:text-neutral-200 transition-colors group"
        title="Media libraries from other users sent via encrypted P2P protocol"
      >
        <div className="flex items-center gap-1.5">
          <span>Incoming Libraries</span>
          <ChevronDown className={`w-3 h-3 text-neutral-500 group-hover:text-neutral-300 transition-transform duration-200 ${collapsed.incomingLibraries ? '-rotate-90' : ''}`} />
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onAddNewIncomingLibrary) onAddNewIncomingLibrary();
            else if (onAddNewSharedLibrary) onAddNewSharedLibrary();
          }}
          className="w-4 h-4 flex items-center justify-center bg-transparent text-neutral-400 hover:text-emerald-300 transition-colors"
          title="Connect / Accept Incoming P2P Media Library"
          aria-label="Connect Incoming P2P Library"
        >
          <Plus className="w-3 h-3 stroke-[2.5]" />
        </button>
      </div>

      {!collapsed.incomingLibraries && (
        <div className="space-y-0.5">
          {incomingLibraries.length === 0 ? (
            <div className="px-2.5 py-1 text-[10px] text-neutral-500 italic">No incoming P2P libraries</div>
          ) : (
            incomingLibraries.map(lib => {
              const isSelected = selectedLibraryId === lib.id;
              const senderName = lib.senderPeerName || lib.ownerName;
              return (
                <button
                  key={lib.id}
                  onClick={() => {
                    onSelectLibrary(lib.id);
                    onSelectFolder(null);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all text-left ${
                    isSelected
                      ? 'bg-emerald-500/20 text-emerald-100 font-medium shadow-sm border border-emerald-500/30'
                      : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                  }`}
                  title={`Incoming via Encrypted P2P from ${senderName} (${lib.senderPeerEmail || lib.ownerEmail})\nProtocol: ${lib.p2pProtocol || 'AES-256-GCM Direct P2P'}`}
                >
                  <div className="flex items-center gap-2 truncate min-w-0">
                    <IncomingLibraryIcon
                      className={`w-4 h-4 shrink-0 ${isSelected ? 'text-emerald-400' : 'text-emerald-400/80'}`}
                      title="Incoming library"
                    />
                    <div className="truncate min-w-0">
                      <div className="truncate text-[11px] leading-tight">{lib.name}</div>
                      <div className="text-[9px] text-emerald-400/80 truncate flex items-center gap-1 font-mono">
                        <span className="w-1 h-1 rounded-full bg-emerald-400 inline-block" />
                        <span>From {senderName}</span>
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
