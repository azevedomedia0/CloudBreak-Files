import React, { useState } from 'react';
import { Folder, Lock, Trash2, ChevronRight, HardDrive } from 'lucide-react';
import { FileItem, CloudAccount, FolderItem, SharedLibrary, CloudProviderId } from '../types';
import { MacViewMode } from './MacFinderToolbar';
import { LibraryBanner } from './file-browser/LibraryBanner';
import { IconsView } from './file-browser/IconsView';
import { ListView } from './file-browser/ListView';
import { ColumnsView } from './file-browser/ColumnsView';
import { GalleryView } from './file-browser/GalleryView';

interface FileBrowserProps {
  files: FileItem[];
  accounts: CloudAccount[];
  selectedAccountId: CloudProviderId;
  selectedFolder: FolderItem | null;
  selectedLibrary: SharedLibrary | null;
  selectedFileId: string | null;
  viewMode: MacViewMode;
  onSelectFile: (file: FileItem) => void;
  onEditPhoto: (file: FileItem) => void;
  onOpenVideo: (file: FileItem) => void;
  onShareFile: (file: FileItem) => void;
  onToggleEncrypt: (file: FileItem) => void;
  onDeleteFile: (fileId: string) => void;
  onBatchEncrypt: (fileIds: string[]) => void;
  onBatchDelete: (fileIds: string[]) => void;
  onOpenQuickLook: () => void;
  folders: FolderItem[];
  onSelectFolder: (folderId: string | null) => void;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({
  files,
  accounts,
  selectedAccountId,
  selectedFolder,
  selectedLibrary,
  selectedFileId,
  viewMode,
  onSelectFile,
  onEditPhoto,
  onOpenVideo,
  onShareFile,
  onToggleEncrypt,
  onDeleteFile,
  onBatchEncrypt,
  onBatchDelete,
  onOpenQuickLook,
  folders,
  onSelectFolder,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [iconScale, setIconScale] = useState<number>(100); // 75 to 150%

  const selectedFile = files.find(f => f.id === selectedFileId) || files[0] || null;

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === files.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(files.map(f => f.id)));
    }
  };

  const getAccount = (accountId: CloudProviderId) => {
    return accounts.find(a => a.id === accountId);
  };

  const totalSize = files.reduce((acc, f) => acc + f.sizeBytes, 0);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none relative">
      
      {/* Batch Selection Banner */}
      {selectedIds.size > 0 && (
        <div className="px-4 py-2 bg-sky-950/60 border-b border-sky-500/30 backdrop-blur-md flex items-center justify-between text-xs text-sky-200 z-20">
          <div className="flex items-center gap-3">
            <span className="font-semibold">{selectedIds.size} assets selected</span>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-[11px] underline text-sky-400 hover:text-sky-100"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onBatchEncrypt(Array.from(selectedIds))}
              className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 border border-white/10 text-xs flex items-center gap-1.5 transition-colors"
            >
              <Lock className="w-3 h-3 text-cyan-400" />
              <span>Encrypt with AES-256</span>
            </button>
            <button
              onClick={() => onBatchDelete(Array.from(selectedIds))}
              className="px-2.5 py-1 rounded-md bg-red-950/50 hover:bg-red-900/60 border border-red-800/60 text-red-300 text-xs flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      )}

      {/* P2P Media Library Protocol & Seeding Status Banner */}
      {selectedLibrary && (
        <LibraryBanner files={files} selectedLibrary={selectedLibrary} totalSize={totalSize} onShareFile={onShareFile} />
      )}

      {/* Main Viewport Content based on macOS View Mode */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 relative">
        
        {files.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-neutral-400">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-neutral-500 mb-3 shadow-inner">
              <Folder className="w-8 h-8" />
            </div>
            <p className="text-sm font-medium text-neutral-300">This directory is empty</p>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm">
              Drag & drop media files to upload directly into this cloud storage bucket.
            </p>
          </div>
        )}

        {/* 1. ICONS / GRID MODE */}
        {viewMode === 'icons' && files.length > 0 && <IconsView files={files} selectedFileId={selectedFileId} selectedIds={selectedIds} iconScale={iconScale} onSelectFile={onSelectFile} onEditPhoto={onEditPhoto} onOpenVideo={onOpenVideo} onOpenQuickLook={onOpenQuickLook} toggleSelectOne={toggleSelectOne} />}

        {/* 2. LIST MODE */}
        {viewMode === 'list' && files.length > 0 && <ListView files={files} selectedFileId={selectedFileId} selectedIds={selectedIds} onSelectFile={onSelectFile} onEditPhoto={onEditPhoto} onOpenVideo={onOpenVideo} onShareFile={onShareFile} onOpenQuickLook={onOpenQuickLook} toggleSelectOne={toggleSelectOne} toggleSelectAll={toggleSelectAll} getAccount={getAccount} />}

        {/* 3. COLUMNS (MILLER COLUMNS) MODE */}
        {viewMode === 'columns' && <ColumnsView files={files} selectedFolder={selectedFolder} selectedFileId={selectedFileId} selectedFile={selectedFile} folders={folders} totalSize={totalSize} onSelectFile={onSelectFile} onEditPhoto={onEditPhoto} onOpenVideo={onOpenVideo} onOpenQuickLook={onOpenQuickLook} onSelectFolder={onSelectFolder} getAccount={getAccount} />}

        {/* 4. GALLERY MODE */}
        {viewMode === 'gallery' && selectedFile && <GalleryView files={files} selectedFile={selectedFile} onSelectFile={onSelectFile} onEditPhoto={onEditPhoto} onOpenVideo={onOpenVideo} />}

      </div>

      {/* Bottom macOS Path Bar & Status Bar */}
      <div className="h-7 px-4 macos-toolbar-glass flex items-center justify-between text-[11px] text-neutral-400 border-t border-white/8 select-none z-20 shrink-0">
        {/* Clickable Breadcrumbs Path */}
        <div className="flex items-center gap-1 text-neutral-300 truncate">
          <HardDrive className="w-3 h-3 text-sky-400" />
          <span>AetherCloud</span>
          <ChevronRight className="w-3 h-3 text-neutral-600" />
          <span className="text-neutral-400">
            {selectedLibrary ? selectedLibrary.name : selectedAccountId === 'all' ? 'All Mounted Clouds' : accounts.find(a => a.id === selectedAccountId)?.name}
          </span>
          {selectedFolder && (
            <>
              <ChevronRight className="w-3 h-3 text-neutral-600" />
              <span className="text-neutral-400">{selectedFolder.name}</span>
            </>
          )}
          {selectedFile && (
            <>
              <ChevronRight className="w-3 h-3 text-neutral-600" />
              <span className="text-sky-300 font-medium truncate">{selectedFile.name}</span>
            </>
          )}
        </div>

        {/* Item count & icon size zoomer */}
        <div className="flex items-center gap-4 shrink-0">
          <span>{files.length} items, 1.2 TB available</span>
          
          {viewMode === 'icons' && (
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="text-[10px] text-neutral-400">Icon Size</span>
              <input
                type="range"
                min={75}
                max={150}
                value={iconScale}
                onChange={e => setIconScale(parseInt(e.target.value, 10))}
                className="w-16 custom-range"
              />
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
