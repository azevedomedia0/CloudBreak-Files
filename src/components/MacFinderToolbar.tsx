import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, LayoutGrid, List, Columns,
  GalleryVertical, Search, HardDrive, PanelLeft, PanelRight, Bell,
  ArrowUpDown, ArrowUpAZ, ArrowDownAZ, Check, ListFilter,
  FileText, Image as ImageIcon, Video, Music, Archive, Star, SquareTerminal,
} from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { CloudAccount, AppNotification, FileCategory } from '../types';
import { DateFilter, FileSortDirection, FileSortKey } from '../utils/filterFiles';
import { NotificationPanel } from './NotificationPanel';

export type MacViewMode = 'icons' | 'list' | 'columns' | 'gallery';

interface MacFinderToolbarProps {
  viewMode: MacViewMode;
  onViewModeChange: (mode: MacViewMode) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  /** Spotlight search in flight (desktop). */
  systemSearching?: boolean;
  /** Query long enough to search This Mac. */
  systemSearchActive?: boolean;
  selectedCategory: FileCategory;
  onCategoryChange: (cat: FileCategory) => void;
  starredOnly: boolean;
  onStarredOnlyChange: (value: boolean) => void;
  dateFilter: DateFilter;
  onDateFilterChange: (value: DateFilter) => void;
  sortKey: FileSortKey;
  onSortKeyChange: (key: FileSortKey) => void;
  sortDirection: FileSortDirection;
  onSortDirectionChange: (dir: FileSortDirection) => void;
  onQuickLook: () => void;
  hasSelectedFile: boolean;
  onShare: () => void;
  onUploadFiles: (files: FileList) => void;
  onOpenAddAccount: () => void;
  activePathTitle: string;
  activeAccount: CloudAccount | undefined;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  isInspectorOpen?: boolean;
  onToggleInspector?: () => void;
  /** Right panel content: file inspector vs system terminal. */
  sidePanelMode?: 'inspector' | 'terminal';
  onShowTerminal?: () => void;
  isNotificationOpen?: boolean;
  onToggleNotifications?: () => void;
  onCloseNotifications?: () => void;
  notifications?: AppNotification[];
  onAcceptLibrary?: (notificationId: string) => void;
  onDeclineLibrary?: (notificationId: string) => void;
  onMarkAllAsRead?: () => void;
  onClearNotification?: (notificationId: string) => void;
  onSelectLibrary?: (libraryId: string) => void;
}

const SORT_OPTIONS: { id: FileSortKey; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'date', label: 'Date modified' },
  { id: 'dateAdded', label: 'Date Added' },
  { id: 'dateOpened', label: 'Date Last Opened' },
  { id: 'size', label: 'Size' },
  { id: 'kind', label: 'Kind' },
];

const KIND_OPTIONS: { id: FileCategory; label: string; icon: React.ElementType }[] = [
  { id: 'all', label: 'Any', icon: ListFilter },
  { id: 'document', label: 'Documents', icon: FileText },
  { id: 'photo', label: 'Images', icon: ImageIcon },
  { id: 'video', label: 'Movies', icon: Video },
  { id: 'audio', label: 'Music', icon: Music },
  { id: 'archive', label: 'Archives', icon: Archive },
];

const DATE_OPTIONS: { id: DateFilter; label: string }[] = [
  { id: 'any', label: 'Any time' },
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Past 7 days' },
  { id: '30d', label: 'Past 30 days' },
];

export const MacFinderToolbar: React.FC<MacFinderToolbarProps> = ({
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchChange,
  systemSearching = false,
  systemSearchActive = false,
  selectedCategory,
  onCategoryChange,
  starredOnly,
  onStarredOnlyChange,
  dateFilter,
  onDateFilterChange,
  sortKey,
  onSortKeyChange,
  sortDirection,
  onSortDirectionChange,
  activePathTitle,
  isSidebarCollapsed = false,
  onToggleSidebar,
  isInspectorOpen = true,
  onToggleInspector,
  sidePanelMode = 'inspector',
  onShowTerminal,
  isNotificationOpen = false,
  onToggleNotifications,
  onCloseNotifications,
  notifications = [],
  onAcceptLibrary,
  onDeclineLibrary,
  onMarkAllAsRead,
  onClearNotification,
  onSelectLibrary,
}) => {
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter(n => !n.read).length;
  const sortIsCustom = sortKey !== 'name' || sortDirection !== 'asc';
  const filtersActive = selectedCategory !== 'all' || starredOnly || dateFilter !== 'any';
  const activeFilterCount =
    (selectedCategory !== 'all' ? 1 : 0)
    + (starredOnly ? 1 : 0)
    + (dateFilter !== 'any' ? 1 : 0);

  useEffect(() => {
    if (!sortOpen && !filterOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (sortOpen && sortRef.current && !sortRef.current.contains(target)) setSortOpen(false);
      if (filterOpen && filterRef.current && !filterRef.current.contains(target)) setFilterOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSortOpen(false);
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [sortOpen, filterOpen]);

  const clearFilters = () => {
    onCategoryChange('all');
    onStarredOnlyChange(false);
    onDateFilterChange('any');
  };

  return (
    <div data-tauri-drag-region className="h-10 px-3 flex items-center justify-between gap-2 sm:gap-3 macos-toolbar-glass select-none shrink-0 z-30">

      {/* Left Section: Navigation */}
      <div data-tauri-drag-region className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        {/* The desktop app's native macOS window buttons overlay this corner. */}
        {isTauri() && <div data-tauri-drag-region className="w-[52px] self-stretch shrink-0" aria-hidden="true" />}

        <span
          data-tauri-drag-region
          className="pointer-events-none select-none text-sm font-semibold tracking-tight text-white shrink-0"
        >
          CloudBreak
        </span>

        <div className="flex items-center gap-0.5 text-neutral-300">
          <button className="p-1 rounded-md hover:bg-white/10 hover:text-white transition-colors" title="Back">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button className="p-1 rounded-md hover:bg-white/10 hover:text-white transition-colors" title="Forward">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className={`p-1.5 rounded-lg transition-all ${
              isSidebarCollapsed
                ? 'text-sky-300 hover:bg-white/10'
                : 'text-neutral-200 hover:text-white hover:bg-white/10'
            }`}
            title={isSidebarCollapsed ? 'Show Sidebar (⌘+Ctrl+S)' : 'Hide Sidebar (⌘+Ctrl+S)'}
          >
            <PanelLeft className="w-[18px] h-[18px]" />
          </button>
        )}

        <div className="flex items-center gap-2 font-semibold text-neutral-100 truncate max-w-[210px] md:max-w-sm pointer-events-none">
          <HardDrive className="w-[18px] h-[18px] text-sky-400 shrink-0" />
          <span className="truncate text-sm sm:text-[14px] font-semibold tracking-tight text-white">{activePathTitle}</span>
        </div>
      </div>

      {/* Center: view modes + notifications / search / sort */}
      <div data-tauri-drag-region className="flex-1 flex items-center justify-center gap-2.5 min-w-0 px-2">
        <div className="flex p-0.5 rounded-lg macos-segmented-pill shrink-0">
          <button
            onClick={() => onViewModeChange('icons')}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === 'icons' ? 'bg-white/15 text-white shadow-xs' : 'text-neutral-300 hover:text-neutral-100'
            }`}
            title="Icons View (⊞ 1)"
          >
            <LayoutGrid className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === 'list' ? 'bg-white/15 text-white shadow-xs' : 'text-neutral-300 hover:text-neutral-100'
            }`}
            title="List View (☰ 2)"
          >
            <List className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={() => onViewModeChange('columns')}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === 'columns' ? 'bg-white/15 text-white shadow-xs' : 'text-neutral-300 hover:text-neutral-100'
            }`}
            title="Miller Columns View (☷ 3)"
          >
            <Columns className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={() => onViewModeChange('gallery')}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === 'gallery' ? 'bg-white/15 text-white shadow-xs' : 'text-neutral-300 hover:text-neutral-100'
            }`}
            title="Gallery View (▯ 4)"
          >
            <GalleryVertical className="w-[18px] h-[18px]" />
          </button>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={onToggleNotifications}
              className={`notif-toggle-btn p-1.5 rounded-lg transition-all relative flex items-center justify-center cursor-pointer ${
                isNotificationOpen
                  ? 'text-sky-300 hover:bg-white/10'
                  : unreadCount > 0
                    ? 'text-white hover:bg-white/10'
                    : 'text-neutral-300 hover:text-white hover:bg-white/10'
              }`}
              title="Notifications & P2P Invites"
              aria-label="Notifications"
            >
              <Bell className="w-[18px] h-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold text-white font-mono shadow-sm shadow-sky-500/50">
                  {unreadCount}
                </span>
              )}
            </button>

            <NotificationPanel
              isOpen={isNotificationOpen}
              onClose={onCloseNotifications || (() => {})}
              notifications={notifications}
              onAcceptLibrary={onAcceptLibrary || (() => {})}
              onDeclineLibrary={onDeclineLibrary || (() => {})}
              onMarkAllAsRead={onMarkAllAsRead || (() => {})}
              onClearNotification={onClearNotification || (() => {})}
              onSelectLibrary={onSelectLibrary}
            />
          </div>

          <div ref={filterRef} className="relative w-40 sm:w-60 md:w-72 min-w-0">
            <Search className={`w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none z-[1] ${
              systemSearchActive ? 'text-cyan-400' : 'text-neutral-400'
            }`} />
            <input
              type="search"
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              placeholder={isTauri() ? 'Search This Mac' : 'Search'}
              title={isTauri() ? 'Search files across this Mac with Spotlight' : 'Search files'}
              className={`w-full bg-black/40 border rounded-lg pl-8.5 pr-9 py-1 text-sm font-medium text-neutral-100 placeholder-neutral-400 focus:outline-none focus:bg-black/60 transition-all font-sans ${
                systemSearchActive
                  ? 'border-cyan-400/40 focus:border-cyan-400/60'
                  : 'border-white/10 focus:border-cyan-400/50'
              }`}
            />
            {systemSearching && (
              <span
                className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin"
                aria-label="Searching This Mac"
              />
            )}
            <button
              type="button"
              onClick={() => {
                setFilterOpen(open => !open);
                setSortOpen(false);
              }}
              className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md transition-all flex items-center justify-center ${
                filterOpen || filtersActive
                  ? 'text-white bg-white/10'
                  : 'text-neutral-400 hover:text-white hover:bg-white/10'
              }`}
              title="Filter items"
              aria-label="Filter items"
              aria-haspopup="dialog"
              aria-expanded={filterOpen}
            >
              <ListFilter className="w-3.5 h-3.5" />
              {filtersActive && (
                <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 px-0.5 items-center justify-center rounded-full bg-cyan-500 text-[8px] font-bold text-neutral-950 font-mono leading-none">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {filterOpen && (
              <div
                role="dialog"
                aria-label="Filter items"
                className="absolute right-0 top-[calc(100%+6px)] z-50 w-64 rounded-xl border border-white/12 bg-neutral-950/95 shadow-2xl shadow-black/50 backdrop-blur-xl overflow-hidden"
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">Filter</span>
                  {filtersActive && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div className="px-2 py-2 border-b border-white/8">
                  <div className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Kind</div>
                  <div className="space-y-0.5">
                    {KIND_OPTIONS.map(option => {
                      const Icon = option.icon;
                      const selected = selectedCategory === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => onCategoryChange(option.id)}
                          className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                            selected ? 'bg-white/12 text-white' : 'text-neutral-300 hover:bg-white/6 hover:text-neutral-100'
                          }`}
                        >
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${
                            option.id === 'archive'
                              ? selected ? 'text-pink-400' : 'text-pink-400/70'
                              : 'text-neutral-400'
                          }`} />
                          <span className="flex-1 font-medium">{option.label}</span>
                          {selected && (
                            <Check className={`w-3.5 h-3.5 ${option.id === 'archive' ? 'text-pink-300' : 'text-cyan-300'}`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="px-2 py-2 border-b border-white/8">
                  <div className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Last opened</div>
                  <div className="space-y-0.5">
                    {DATE_OPTIONS.map(option => {
                      const selected = dateFilter === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => onDateFilterChange(option.id)}
                          className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                            selected ? 'bg-white/12 text-white' : 'text-neutral-300 hover:bg-white/6 hover:text-neutral-100'
                          }`}
                        >
                          <span className="flex-1 font-medium">{option.label}</span>
                          {selected && <Check className="w-3.5 h-3.5 text-cyan-300" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="px-2 py-2">
                  <div className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Show</div>
                  <button
                    type="button"
                    onClick={() => onStarredOnlyChange(!starredOnly)}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                      starredOnly ? 'bg-white/12 text-white' : 'text-neutral-300 hover:bg-white/6 hover:text-neutral-100'
                    }`}
                  >
                    <Star className={`w-3.5 h-3.5 shrink-0 ${starredOnly ? 'fill-amber-300 text-amber-300' : 'text-neutral-400'}`} />
                    <span className="flex-1 font-medium">Starred only</span>
                    {starredOnly && <Check className="w-3.5 h-3.5 text-cyan-300" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div ref={sortRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                setSortOpen(open => !open);
                setFilterOpen(false);
              }}
              className={`p-1.5 rounded-lg transition-all relative flex items-center justify-center ${
                sortOpen || sortIsCustom
                  ? 'bg-white/15 text-white'
                  : 'text-neutral-300 hover:text-white hover:bg-white/10'
              }`}
              title="Sort items"
              aria-label="Sort items"
              aria-haspopup="dialog"
              aria-expanded={sortOpen}
            >
              <ArrowUpDown className="w-[18px] h-[18px]" />
              {sortIsCustom && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-cyan-400" />
              )}
            </button>

            {sortOpen && (
              <div
                role="dialog"
                aria-label="Sort items"
                className="absolute right-0 top-[calc(100%+6px)] z-50 w-56 rounded-xl border border-white/12 bg-neutral-950/95 shadow-2xl shadow-black/50 backdrop-blur-xl overflow-hidden"
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">Sort by</span>
                  {sortIsCustom && (
                    <button
                      type="button"
                      onClick={() => {
                        onSortKeyChange('name');
                        onSortDirectionChange('asc');
                      }}
                      className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200"
                    >
                      Reset
                    </button>
                  )}
                </div>

                <div className="px-2 py-2 border-b border-white/8">
                  <div className="space-y-0.5">
                    {SORT_OPTIONS.map(option => {
                      const selected = sortKey === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => onSortKeyChange(option.id)}
                          className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                            selected ? 'bg-white/12 text-white' : 'text-neutral-300 hover:bg-white/6 hover:text-neutral-100'
                          }`}
                        >
                          <span className="flex-1 font-medium">{option.label}</span>
                          {selected && <Check className="w-3.5 h-3.5 text-cyan-300" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="px-2 py-2">
                  <div className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Order</div>
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => onSortDirectionChange('asc')}
                      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                        sortDirection === 'asc' ? 'bg-white/12 text-white' : 'text-neutral-300 hover:bg-white/6 hover:text-neutral-100'
                      }`}
                    >
                      <ArrowUpAZ className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                      <span className="flex-1 font-medium">Ascending</span>
                      {sortDirection === 'asc' && <Check className="w-3.5 h-3.5 text-cyan-300" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSortDirectionChange('desc')}
                      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                        sortDirection === 'desc' ? 'bg-white/12 text-white' : 'text-neutral-300 hover:bg-white/6 hover:text-neutral-100'
                      }`}
                    >
                      <ArrowDownAZ className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                      <span className="flex-1 font-medium">Descending</span>
                      {sortDirection === 'desc' && <Check className="w-3.5 h-3.5 text-cyan-300" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div data-tauri-drag-region className="ml-auto shrink-0 flex items-center gap-0.5">
          {onShowTerminal && (
            <button
              type="button"
              onClick={onShowTerminal}
              className={`p-1.5 rounded-lg transition-all ${
                isInspectorOpen && sidePanelMode === 'terminal'
                  ? 'text-[#65a30d] bg-[#65a30d]/15 hover:bg-[#65a30d]/25 border border-[#65a30d]/30'
                  : 'text-neutral-400 hover:text-white hover:bg-white/10'
              }`}
              title={
                isInspectorOpen && sidePanelMode === 'terminal'
                  ? 'Terminal open'
                  : 'Show system terminal'
              }
              aria-label="Show system terminal"
              aria-pressed={isInspectorOpen && sidePanelMode === 'terminal'}
            >
              <SquareTerminal className="w-[18px] h-[18px]" />
            </button>
          )}
          {onToggleInspector && (
            <button
              type="button"
              onClick={onToggleInspector}
              className={`p-1.5 rounded-lg transition-all ${
                isInspectorOpen && sidePanelMode === 'inspector'
                  ? 'text-neutral-200 hover:text-white hover:bg-white/10'
                  : !isInspectorOpen
                    ? 'text-sky-300 hover:bg-white/10'
                    : 'text-neutral-400 hover:text-white hover:bg-white/10'
              }`}
              title={
                isInspectorOpen && sidePanelMode === 'inspector'
                  ? 'Hide File Inspector'
                  : 'Show File Inspector'
              }
              aria-label={
                isInspectorOpen && sidePanelMode === 'inspector'
                  ? 'Hide File Inspector'
                  : 'Show File Inspector'
              }
              aria-pressed={isInspectorOpen && sidePanelMode === 'inspector'}
            >
              <PanelRight className="w-[18px] h-[18px]" />
            </button>
          )}
        </div>
      </div>

    </div>
  );
};
