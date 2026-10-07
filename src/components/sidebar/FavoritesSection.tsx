import React from 'react';
import { Star, Layers, Plus, ShieldCheck, ChevronDown } from 'lucide-react';
import { CloudAccount, CloudProviderId } from '../../types';
import { SidebarSectionKey } from './sectionKey';

export interface FavoritesSectionProps {
  accounts: CloudAccount[];
  selectedAccountId: CloudProviderId;
  onSelectAccount: (accountId: CloudProviderId) => void;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  selectedLibraryId: string | null;
  onSelectLibrary: (libraryId: string | null) => void;
  onAddFavorite?: () => void;
  customFavorites: Array<{ id: string; name: string }>;
  collapsed: Partial<Record<SidebarSectionKey, boolean>>;
  toggleSection: (section: SidebarSectionKey) => void;
}

export const FavoritesSection: React.FC<FavoritesSectionProps> = ({ accounts, selectedAccountId, onSelectAccount, selectedFolderId, onSelectFolder, selectedLibraryId, onSelectLibrary, onAddFavorite, customFavorites, collapsed, toggleSection }) => (
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
          title="Add to Favorites"
          aria-label="Add to Favorites"
        >
          <Plus className="w-3 h-3 stroke-[2.5]" />
        </button>
      </div>

      {!collapsed.favorites && (
        <div className="space-y-0.5">
          {/* Unified Cross-Account */}
          <button
            onClick={() => {
              onSelectAccount('all');
              onSelectFolder(null);
              onSelectLibrary(null);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all ${
              selectedAccountId === 'all' && !selectedLibraryId && !selectedFolderId
                ? 'bg-sky-500/20 text-sky-200 font-medium shadow-sm'
                : 'text-neutral-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <Layers className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="truncate">All Cloud Vaults</span>
            </div>
            <span className="text-[10px] font-mono text-neutral-400 bg-white/10 px-1 rounded">
              {accounts.length}
            </span>
          </button>

          {/* Starred Items */}
          <button
            onClick={() => {
              onSelectAccount('all');
              onSelectFolder(null);
              onSelectLibrary(null);
            }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-neutral-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Starred Media</span>
            </div>
          </button>

          {/* Private Vault Direct */}
          <button
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
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">Private Vault</span>
            </div>
          </button>

          {/* Custom Added Favorites */}
          {customFavorites.map(fav => (
            <button
              key={fav.id}
              onClick={() => {
                onSelectAccount('all');
                onSelectFolder(null);
                onSelectLibrary(null);
              }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-neutral-300 hover:bg-white/5 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2 truncate">
                <Star className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                <span className="truncate">{fav.name}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
);
