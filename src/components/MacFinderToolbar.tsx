import React, { useRef } from 'react';
import {
  ChevronLeft, ChevronRight, LayoutGrid, List, Columns, 
  GalleryVertical, Eye, Share2, Search, Upload, Plus, 
  ShieldCheck, Layers, Image as ImageIcon, Video, FileText, 
  Lock, SlidersHorizontal, HardDrive, PanelLeft, Bell
} from 'lucide-react';
import { FileCategory, CloudAccount, AppNotification } from '../types';
import { NotificationPanel } from './NotificationPanel';

export type MacViewMode = 'icons' | 'list' | 'columns' | 'gallery';

interface MacFinderToolbarProps {
  viewMode: MacViewMode;
  onViewModeChange: (mode: MacViewMode) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: FileCategory;
  onCategoryChange: (cat: FileCategory) => void;
  onQuickLook: () => void;
  hasSelectedFile: boolean;
  onShare: () => void;
  onUploadFiles: (files: FileList) => void;
  onOpenAddAccount: () => void;
  activePathTitle: string;
  activeAccount: CloudAccount | undefined;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  // Notifications props
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

export const MacFinderToolbar: React.FC<MacFinderToolbarProps> = ({
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  onQuickLook,
  hasSelectedFile,
  onShare,
  onUploadFiles,
  onOpenAddAccount,
  activePathTitle,
  activeAccount,
  isSidebarCollapsed = false,
  onToggleSidebar,
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
  const categories: { id: FileCategory; label: string; icon: any }[] = [
    { id: 'document', label: 'Files', icon: FileText },
    { id: 'photo', label: 'Photos', icon: ImageIcon },
    { id: 'video', label: 'Videos', icon: Video },
    { id: 'archive', label: 'Vault', icon: Lock },
  ];

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="h-10 px-3 flex items-center justify-between gap-2 sm:gap-3 macos-toolbar-glass select-none shrink-0 z-30">
      
      {/* Left Section: Traffic Lights & Navigation */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* macOS Traffic Lights */}
        <div className="flex items-center gap-1.5 group/lights shrink-0">
          <button 
            className="w-3.5 h-3.5 rounded-full bg-[#FF5F56] border border-[#E0443E] hover:opacity-85 transition-opacity flex items-center justify-center text-[9px] font-bold text-[#4A0002]"
            title="Close Window"
          >
            <span className="opacity-0 group-hover/lights:opacity-100">×</span>
          </button>
          <button 
            className="w-3.5 h-3.5 rounded-full bg-[#FFBD2E] border border-[#DEA123] hover:opacity-85 transition-opacity flex items-center justify-center text-[9px] font-bold text-[#563C00]"
            title="Minimize Window"
          >
            <span className="opacity-0 group-hover/lights:opacity-100">−</span>
          </button>
          <button 
            className="w-3.5 h-3.5 rounded-full bg-[#27C93F] border border-[#1AAB29] hover:opacity-85 transition-opacity flex items-center justify-center text-[8px] font-bold text-[#0A4714]"
            title="Full Screen Window"
          >
            <span className="opacity-0 group-hover/lights:opacity-100">+</span>
          </button>
        </div>

        {/* History Nav Chevrons */}
        <div className="flex items-center gap-0.5 text-neutral-300">
          <button className="p-1 rounded-md hover:bg-white/10 hover:text-white transition-colors" title="Back">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button className="p-1 rounded-md hover:bg-white/10 hover:text-white transition-colors" title="Forward">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* macOS Sidebar Toggle */}
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className={`p-1.5 rounded-lg border transition-all ${
              isSidebarCollapsed
                ? 'bg-sky-500/20 border-sky-400/40 text-sky-300 hover:bg-sky-500/30'
                : 'bg-white/5 border-white/10 text-neutral-200 hover:text-white hover:bg-white/10'
            }`}
            title={isSidebarCollapsed ? "Show Sidebar (⌘+Ctrl+S)" : "Hide Sidebar (⌘+Ctrl+S)"}
          >
            <PanelLeft className="w-[18px] h-[18px]" />
          </button>
        )}

        {/* Path Label in Titlebar */}
        <div className="flex items-center gap-2 font-semibold text-neutral-100 truncate max-w-[210px] md:max-w-sm">
          <HardDrive className="w-[18px] h-[18px] text-sky-400 shrink-0" />
          <span className="truncate text-sm sm:text-[14px] font-semibold tracking-tight text-white">{activePathTitle}</span>
        </div>
      </div>

      {/* Center Section: macOS Segmented 4-Way View Switcher */}
      <div className="flex items-center gap-2.5">
        <div className="flex p-0.5 rounded-lg macos-segmented-pill">
          <button
            onClick={() => onViewModeChange('icons')}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === 'icons'
                ? 'bg-white/15 text-white shadow-xs'
                : 'text-neutral-300 hover:text-neutral-100'
            }`}
            title="Icons View (⊞ 1)"
          >
            <LayoutGrid className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === 'list'
                ? 'bg-white/15 text-white shadow-xs'
                : 'text-neutral-300 hover:text-neutral-100'
            }`}
            title="List View (☰ 2)"
          >
            <List className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={() => onViewModeChange('columns')}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === 'columns'
                ? 'bg-white/15 text-white shadow-xs'
                : 'text-neutral-300 hover:text-neutral-100'
            }`}
            title="Miller Columns View (☷ 3)"
          >
            <Columns className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={() => onViewModeChange('gallery')}
            className={`p-1.5 rounded-md transition-all ${
              viewMode === 'gallery'
                ? 'bg-white/15 text-white shadow-xs'
                : 'text-neutral-300 hover:text-neutral-100'
            }`}
            title="Gallery View (▯ 4)"
          >
            <GalleryVertical className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* Category Filter Pills */}
        <div className="hidden lg:flex items-center gap-1 p-0.5 rounded-lg macos-segmented-pill">
          {categories.map(c => {
            const isSel = selectedCategory === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onCategoryChange(isSel ? 'all' : c.id)}
                className={`px-3.5 py-1 rounded-md text-[13px] font-semibold transition-colors ${
                  isSel ? 'bg-white/20 text-white shadow-xs' : 'text-neutral-300 hover:text-neutral-100'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Section: Notification Button & Search Bar */}
      <div className="flex items-center gap-2">
        {/* Notification Icon Button to the left of search */}
        <div className="relative">
          <button
            type="button"
            onClick={onToggleNotifications}
            className={`notif-toggle-btn p-1.5 rounded-lg border transition-all relative flex items-center justify-center cursor-pointer ${
              isNotificationOpen
                ? 'bg-sky-500/20 border-sky-400/40 text-sky-200 shadow-sm'
                : unreadCount > 0
                ? 'bg-white/10 border-white/20 text-white hover:bg-white/15 hover:border-white/30'
                : 'bg-white/5 border-white/10 text-neutral-300 hover:text-white hover:bg-white/10'
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

          {/* Floating Notification Panel */}
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

        {/* Search Capsule */}
        <div className="relative w-36 sm:w-56 md:w-64">
          <Search className="w-4 h-4 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search"
            className="w-full bg-black/40 border border-white/10 rounded-lg pl-8.5 pr-3 py-1 text-sm font-medium text-neutral-100 placeholder-neutral-400 focus:outline-none focus:border-cyan-400/50 focus:bg-black/60 transition-all font-sans"
          />
        </div>
      </div>

    </div>
  );
};
