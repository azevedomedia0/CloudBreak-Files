import React from 'react';
import { Star, Plus, ChevronDown, Folder, Server, HardDrive } from '@/src/icons';
import { CloudProviderId, FavoriteShortcut } from '../../types';
import { SidebarSectionKey } from './sectionKey';
import { PrivateVaultIcon } from './PrivateVaultIcon';

export interface FavoritesSectionProps {
  selectedAccountId: CloudProviderId;
  onSelectAccount: (accountId: CloudProviderId) => void;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  selectedLibraryId: string | null;
  onSelectLibrary: (libraryId: string | null) => void;
  selectedSourceId: string | null;
  onSelectSource: (sourceId: string) => void;
  onAddFavorite?: () => void;
  customFavorites: FavoriteShortcut[];
  collapsed: Partial<Record<SidebarSectionKey, boolean>>;
  toggleSection: (section: SidebarSectionKey) => void;
}

function favoriteIcon(kind: FavoriteShortcut['kind']) {
  if (kind === 'network') return <Server className="w-3.5 h-3.5 text-orange-400/90 shrink-0" />;
  if (kind === 'device') return <HardDrive className="w-3.5 h-3.5 text-emerald-400/90 shrink-0" />;
  return <Folder className="w-3.5 h-3.5 text-sky-400/90 shrink-0" />;
}

export const FavoritesSection: React.FC<FavoritesSectionProps> = ({
  selectedAccountId,
  onSelectAccount,
  selectedFolderId,
  onSelectFolder,
  selectedLibraryId,
  onSelectLibrary,
  selectedSourceId,
  onSelectSource,
  onAddFavorite,
  customFavorites,
  collapsed,
  toggleSection,
}) => (
  <div className="space-y-0.5">
    <div
      onClick={() => toggleSection('favorites')}
      className="flex items-center justify-between px-2 pb-1 text-[10px] font-semibold tracking-wider uppercase text-neutral-400 cursor-pointer hover:text-neutral-200 transition-colors group"
    >
      <div className="flex items-center gap-1.5">
        <span>Favorites</span>
        <ChevronDown className={`w-3 h-3 text-neutral-500 group-hover:text-neutral-300 transition-transform duration-200 ${collapsed.favorites ? '-rotate-90' : ''}`} />
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAddFavorite?.();
        }}
        className="w-4 h-4 flex items-center justify-center bg-transparent text-neutral-400 hover:text-sky-300 transition-colors"
        title="Add folder, network storage, or drive to Favorites"
        aria-label="Add folder, network storage, or drive to Favorites"
      >
        <Plus className="w-3 h-3 stroke-[2.5]" />
      </button>
    </div>

    {!collapsed.favorites && (
      <div className="space-y-0.5">
        <button
          type="button"
          onClick={() => {
            onSelectAccount('all');
            onSelectFolder(null);
            onSelectLibrary(null);
          }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-neutral-400 hover:bg-white/5 hover:text-white transition-colors"
        >
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Starred</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onSelectAccount('vault');
            onSelectFolder(null);
            onSelectLibrary(null);
          }}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all ${
            selectedAccountId === 'vault' && !selectedLibraryId
              ? 'bg-sky-500/20 text-sky-200 font-medium shadow-sm'
              : 'text-neutral-300 hover:bg-white/5 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <PrivateVaultIcon className="w-4 h-4 text-emerald-400 shrink-0" title="Private Vault" />
            <span className="truncate">Private Vault</span>
          </div>
        </button>

        {customFavorites.map(fav => {
          const isSelected =
            (fav.kind === 'folder' && selectedFolderId === fav.folderId)
            || ((fav.kind === 'network' || fav.kind === 'device') && selectedSourceId === fav.sourceId);

          return (
            <button
              key={fav.id}
              type="button"
              onClick={() => {
                if (fav.kind === 'folder' && fav.folderId) {
                  onSelectAccount('all');
                  onSelectLibrary(null);
                  onSelectFolder(fav.folderId);
                  return;
                }
                if (fav.sourceId) {
                  onSelectSource(fav.sourceId);
                }
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors ${
                isSelected
                  ? 'bg-amber-500/15 text-amber-100 font-medium'
                  : 'text-neutral-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                {favoriteIcon(fav.kind)}
                <span className="truncate">{fav.name}</span>
              </div>
            </button>
          );
        })}
      </div>
    )}
  </div>
);
