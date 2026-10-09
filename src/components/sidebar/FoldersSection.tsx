import React from 'react';
import { Plus, RefreshCw, ChevronDown } from '@/src/icons';
import { FolderItem, CloudProviderId } from '../../types';
import { SidebarSectionKey } from './sectionKey';

export interface FoldersSectionProps {
  onSelectAccount: (accountId: CloudProviderId) => void;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onSelectLibrary: (libraryId: string | null) => void;
  onAddNewFolder?: () => void;
  onRescanFolders?: () => void;
  isRescanning?: boolean;
  collapsed: Partial<Record<SidebarSectionKey, boolean>>;
  toggleSection: (section: SidebarSectionKey) => void;
  visibleFolders: FolderItem[];
  getFolderIcon: (name: string, isSelected: boolean) => React.ReactNode;
}

export const FoldersSection: React.FC<FoldersSectionProps> = ({
  onSelectAccount, selectedFolderId, onSelectFolder, onSelectLibrary,
  onAddNewFolder, onRescanFolders, isRescanning = false,
  collapsed, toggleSection, visibleFolders, getFolderIcon,
}) => (
    <div className="space-y-0.5">
      <div 
        onClick={() => toggleSection('directories')}
        className="flex items-center justify-between px-2 pb-1 text-[10px] font-semibold tracking-wider uppercase text-neutral-400 cursor-pointer hover:text-neutral-200 transition-colors group"
      >
        <div className="flex items-center gap-1.5">
          <span>Local Files</span>
          <ChevronDown className={`w-3 h-3 text-neutral-500 group-hover:text-neutral-300 transition-transform duration-200 ${collapsed.directories ? '-rotate-90' : ''}`} />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={isRescanning}
            onClick={(e) => {
              e.stopPropagation();
              onRescanFolders?.();
            }}
            className="w-4 h-4 flex items-center justify-center bg-transparent text-neutral-400 hover:text-sky-300 transition-colors disabled:opacity-40 disabled:cursor-wait"
            title="Rescan local folders from disk"
            aria-label="Rescan local folders from disk"
          >
            <RefreshCw className={`w-3 h-3 stroke-[2.5] ${isRescanning ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddNewFolder?.();
            }}
            className="w-4 h-4 flex items-center justify-center bg-transparent text-neutral-400 hover:text-sky-300 transition-colors"
            title="Add Folder from Disk"
            aria-label="Add Folder from Disk"
          >
            <Plus className="w-3 h-3 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {!collapsed.directories && (
        <div className="space-y-0.5">
          {visibleFolders.map(folder => {
            const isSelected = selectedFolderId === folder.id;
            return (
              <button
                key={folder.id}
                onClick={() => {
                  onSelectFolder(folder.id);
                  onSelectAccount('all');
                  onSelectLibrary(null);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all ${
                  isSelected
                    ? 'bg-sky-500/20 text-sky-200 font-medium shadow-sm'
                    : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {getFolderIcon(folder.name, isSelected)}
                  <span className="truncate">{folder.name}</span>
                </div>
                <span className="text-[10px] font-mono text-neutral-400 bg-white/10 px-1 rounded">
                  {folder.itemCount}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
);
