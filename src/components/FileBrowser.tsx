import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Folder, RotateCcw, Trash2, ChevronRight, HardDrive } from 'lucide-react';
import { FileItem, CloudAccount, FolderItem, SharedLibrary, CloudProviderId, FileCategory } from '../types';
import { MacViewMode } from './MacFinderToolbar';
import { LibraryBanner } from './file-browser/LibraryBanner';
import { IconsView } from './file-browser/IconsView';
import { ListView } from './file-browser/ListView';
import { ColumnsView } from './file-browser/ColumnsView';
import { GalleryView } from './file-browser/GalleryView';
import { FileContextMenu, FileRenameField } from './file-browser/FileContextMenu';
import { FileGetInfo } from './file-browser/FileGetInfo';
import { isEditableDocument } from '../utils/documentKind';
import { getFolderIcon } from '../utils/folderIcons';
import { childFoldersOf, groupFilesByLocalFolders } from '../utils/groupFilesByLocation';
import { accentForSelection } from '../utils/selectionAccent';
import { isZipArchive } from '../utils/unzipArchive';
import { FILE_CONTEXT_MENU_EVENT, FileContextMenuDetail } from '../utils/fileContextMenuBus';
import type { SwarmStatus } from '../services/p2pBridge';

interface FileBrowserProps {
  files: FileItem[];
  accounts: CloudAccount[];
  selectedAccountId: CloudProviderId;
  selectedFolder: FolderItem | null;
  selectedLibrary: SharedLibrary | null;
  selectedCategory?: FileCategory;
  /** Network share name or removable device id when one is open. */
  selectedSourceId?: string | null;
  selectedFileId: string | null;
  viewMode: MacViewMode;
  onSelectFile: (file: FileItem) => void;
  onEditPhoto: (file: FileItem) => void;
  onOpenDocument: (file: FileItem) => void;
  onOpenVideo: (file: FileItem) => void;
  onShareFile: (file: FileItem) => void;
  onToggleEncrypt: (file: FileItem) => void;
  onDeleteFile: (fileId: string) => void;
  onBatchRestore: (fileIds: string[]) => void;
  onBatchDelete: (fileIds: string[]) => void;
  onRenameFile: (fileId: string, name: string) => void;
  onDuplicateFiles: (files: FileItem[]) => string[];
  onCopyFiles: (files: FileItem[]) => void;
  onToggleTag: (fileIds: string[], tag: string) => void;
  onUnzipFile: (file: FileItem) => void;
  onOpenQuickLook: () => void;
  folders: FolderItem[];
  onSelectFolder: (folderId: string | null) => void;
  swarmStatus?: SwarmStatus | null;
  onCopyLibraryInvite?: () => void;
  onRefreshSwarm?: () => void;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({
  files,
  accounts,
  selectedAccountId,
  selectedFolder,
  selectedLibrary,
  selectedCategory = 'all',
  selectedSourceId = null,
  selectedFileId,
  viewMode,
  onSelectFile,
  onEditPhoto,
  onOpenDocument,
  onOpenVideo,
  onShareFile,
  onToggleEncrypt,
  onDeleteFile,
  onBatchRestore,
  onBatchDelete,
  onRenameFile,
  onDuplicateFiles,
  onCopyFiles,
  onToggleTag,
  onUnzipFile,
  onOpenQuickLook,
  folders,
  onSelectFolder,
  swarmStatus = null,
  onCopyLibraryInvite,
  onRefreshSwarm,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [iconScale, setIconScale] = useState<number>(100); // 75 to 150%
  const [contextMenu, setContextMenu] = useState<{ file: FileItem; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<{ file: FileItem; x: number; y: number } | null>(null);
  const [infoFileId, setInfoFileId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedFile = files.find(f => f.id === selectedFileId) || files[0] || null;
  const accent = selectedFile && isZipArchive(selectedFile)
    ? 'pink'
    : accentForSelection(selectedLibrary, selectedSourceId);
  const groupByLocation =
    (selectedCategory === 'files' || selectedCategory === 'photo' || selectedCategory === 'video')
    && (viewMode === 'icons' || viewMode === 'list');
  const localFolders = useMemo(() => folders.filter(folder => folder.accountId === 'all'), [folders]);
  const locationSections = useMemo(
    () => (groupByLocation
      ? groupFilesByLocalFolders(files, localFolders, folders, {
          includeEmptySubfolders: selectedCategory === 'files',
        })
      : []),
    [groupByLocation, files, localFolders, folders, selectedCategory],
  );
  const browseSubfolders = useMemo(
    () => (groupByLocation ? [] : childFoldersOf(selectedFolder?.id, folders)),
    [groupByLocation, selectedFolder?.id, folders],
  );

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
  const infoFile = infoFileId ? files.find(file => file.id === infoFileId) || null : null;

  const selectFile = (file: FileItem) => {
    onSelectFile(file);
    rootRef.current?.focus({ preventScroll: true });
  };

  const targetsFor = (file: FileItem) => (
    selectedIds.has(file.id) && selectedIds.size > 1
      ? files.filter(item => selectedIds.has(item.id))
      : [file]
  );

  const openFile = (file: FileItem) => {
    selectFile(file);
    if (file.category === 'photo') onEditPhoto(file);
    else if (file.category === 'video') onOpenVideo(file);
    else if (isEditableDocument(file)) onOpenDocument(file);
    else if (file.name.toLowerCase().endsWith('.zip') || file.mimeType === 'application/zip') onUnzipFile(file);
    else onOpenQuickLook();
  };

  const quickLook = (file: FileItem) => {
    selectFile(file);
    onOpenQuickLook();
  };

  const trashFiles = (items: FileItem[]) => {
    if (items.length > 1) onBatchDelete(items.map(item => item.id));
    else if (items[0]) onDeleteFile(items[0].id);
    setSelectedIds(new Set());
  };

  const duplicateFiles = (items: FileItem[]) => {
    const ids = onDuplicateFiles(items);
    if (ids.length) setSelectedIds(new Set(ids));
  };

  const openContextMenuAt = (file: FileItem, x: number, y: number) => {
    if (!selectedIds.has(file.id)) setSelectedIds(new Set([file.id]));
    selectFile(file);
    setRenaming(null);
    setContextMenu({ file, x, y });
  };

  const openContextMenu = (file: FileItem, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    openContextMenuAt(file, event.clientX, event.clientY);
  };

  useEffect(() => {
    const onExternalMenu = (event: Event) => {
      const detail = (event as CustomEvent<FileContextMenuDetail>).detail;
      if (!detail?.file) return;
      setSelectedIds(prev => (prev.has(detail.file.id) ? prev : new Set([detail.file.id])));
      onSelectFile(detail.file);
      rootRef.current?.focus({ preventScroll: true });
      setRenaming(null);
      setContextMenu({ file: detail.file, x: detail.clientX, y: detail.clientY });
    };
    window.addEventListener(FILE_CONTEXT_MENU_EVENT, onExternalMenu);
    return () => window.removeEventListener(FILE_CONTEXT_MENU_EVENT, onExternalMenu);
  }, [onSelectFile]);

  const renderSectionViews = (sectionFiles: FileItem[], sectionFolders: FolderItem[] = []) => {
    const hasItems = sectionFiles.length > 0 || sectionFolders.length > 0;
    if (!hasItems) return null;
    return (
      <>
        {viewMode === 'icons' && (
          <IconsView
            accent={accent}
            files={sectionFiles}
            folders={sectionFolders}
            selectedFileId={selectedFileId}
            selectedIds={selectedIds}
            iconScale={iconScale}
            onSelectFile={selectFile}
            onOpenFolder={onSelectFolder}
            onEditPhoto={onEditPhoto}
            onOpenDocument={onOpenDocument}
            onOpenVideo={onOpenVideo}
            onOpenQuickLook={onOpenQuickLook}
            onFileContextMenu={openContextMenu}
            toggleSelectOne={toggleSelectOne}
          />
        )}
        {viewMode === 'list' && (
          <ListView
            accent={accent}
            files={sectionFiles}
            folders={sectionFolders}
            selectedFileId={selectedFileId}
            selectedIds={selectedIds}
            onSelectFile={selectFile}
            onOpenFolder={onSelectFolder}
            onEditPhoto={onEditPhoto}
            onOpenDocument={onOpenDocument}
            onOpenVideo={onOpenVideo}
            onShareFile={onShareFile}
            onOpenQuickLook={onOpenQuickLook}
            onFileContextMenu={openContextMenu}
            toggleSelectOne={toggleSelectOne}
            toggleSelectAll={toggleSelectAll}
            getAccount={getAccount}
          />
        )}
      </>
    );
  };

  const onBrowserKeyDown = (event: React.KeyboardEvent) => {
    if (contextMenu || renaming || infoFileId) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const file = files.find(item => item.id === selectedFileId);
    if (!file) return;
    const meta = event.metaKey || event.ctrlKey;
    const targets = targetsFor(file);
    if (meta && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      setInfoFileId(file.id);
    } else if (meta && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      duplicateFiles(targets);
    } else if (meta && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      onCopyFiles(targets);
    } else if (meta && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault();
      trashFiles(targets);
    } else if (event.key === 'Enter' && targets.length === 1) {
      event.preventDefault();
      const rect = rootRef.current?.getBoundingClientRect();
      setRenaming({ file, x: (rect?.left ?? 80) + 48, y: (rect?.top ?? 80) + 48 });
    }
  };

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onBrowserKeyDown}
      className="flex-1 flex flex-col h-full overflow-hidden select-none relative outline-none"
    >
      
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
              onClick={() => onBatchRestore(Array.from(selectedIds))}
              className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 border border-white/10 text-xs flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3 h-3 text-cyan-400" />
              <span>Restore</span>
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
        <LibraryBanner
          files={files}
          selectedLibrary={selectedLibrary}
          totalSize={totalSize}
          onShareFile={onShareFile}
          swarmStatus={swarmStatus}
          onCopyInvite={onCopyLibraryInvite}
          onRefreshSwarm={onRefreshSwarm}
        />
      )}

      {/* Main Viewport Content based on macOS View Mode */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 relative">
        
        {files.length === 0 && browseSubfolders.length === 0 && !groupByLocation && (
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

        {groupByLocation && locationSections.length > 0 ? (
          <div className="space-y-8">
            {locationSections.map(section => (
              <section key={section.folder?.id ?? 'other-locations'} className="space-y-3">
                <header className="flex items-center gap-2 sticky top-0 z-10 -mx-1 px-1 py-1.5">
                  {section.folder ? (
                    <button
                      type="button"
                      onClick={() => onSelectFolder(section.folder!.id)}
                      className="flex items-center gap-2 min-w-0 rounded-md hover:bg-white/6 px-1 -mx-1 py-0.5 transition-colors group/folder group"
                      title={`Open ${section.title}`}
                    >
                      {getFolderIcon(section.title, false)}
                      <h2 className="text-sm font-semibold text-neutral-100 tracking-tight group-hover/folder:text-white">
                        {section.title}
                      </h2>
                    </button>
                  ) : (
                    <>
                      {getFolderIcon(section.title, false)}
                      <h2 className="text-sm font-semibold text-neutral-100 tracking-tight">{section.title}</h2>
                    </>
                  )}
                  <span className="text-[10px] font-mono text-neutral-500 bg-white/8 px-1.5 py-0.5 rounded">
                    {section.subfolders.length + section.files.length}
                  </span>
                </header>
                {renderSectionViews(section.files, section.subfolders)}
              </section>
            ))}
          </div>
        ) : (
          <>
            {viewMode === 'icons' && (files.length > 0 || browseSubfolders.length > 0) && (
              <IconsView accent={accent} files={files} folders={browseSubfolders} selectedFileId={selectedFileId} selectedIds={selectedIds} iconScale={iconScale} onSelectFile={selectFile} onOpenFolder={onSelectFolder} onEditPhoto={onEditPhoto} onOpenDocument={onOpenDocument} onOpenVideo={onOpenVideo} onOpenQuickLook={onOpenQuickLook} onFileContextMenu={openContextMenu} toggleSelectOne={toggleSelectOne} />
            )}
            {viewMode === 'list' && (files.length > 0 || browseSubfolders.length > 0) && (
              <ListView accent={accent} files={files} folders={browseSubfolders} selectedFileId={selectedFileId} selectedIds={selectedIds} onSelectFile={selectFile} onOpenFolder={onSelectFolder} onEditPhoto={onEditPhoto} onOpenDocument={onOpenDocument} onOpenVideo={onOpenVideo} onShareFile={onShareFile} onOpenQuickLook={onOpenQuickLook} onFileContextMenu={openContextMenu} toggleSelectOne={toggleSelectOne} toggleSelectAll={toggleSelectAll} getAccount={getAccount} />
            )}
            {viewMode === 'columns' && (
              <ColumnsView accent={accent} files={files} selectedFolder={selectedFolder} selectedFileId={selectedFileId} folders={folders.filter(f => f.accountId === 'all' ? !f.parentId : true)} totalSize={totalSize} onSelectFile={selectFile} onEditPhoto={onEditPhoto} onOpenDocument={onOpenDocument} onOpenVideo={onOpenVideo} onOpenQuickLook={onOpenQuickLook} onFileContextMenu={openContextMenu} onSelectFolder={onSelectFolder} />
            )}
            {viewMode === 'gallery' && selectedFile && (
              <GalleryView accent={accent} files={files} selectedFile={selectedFile} onSelectFile={selectFile} onEditPhoto={onEditPhoto} onOpenDocument={onOpenDocument} onFileContextMenu={openContextMenu} />
            )}
          </>
        )}

      </div>

      {/* Bottom macOS Path Bar & Status Bar */}
      <div className="h-7 px-4 macos-toolbar-glass flex items-center justify-between text-[11px] text-neutral-400 border-t border-white/8 select-none z-20 shrink-0">
        {/* Clickable Breadcrumbs Path */}
        <div className="flex items-center gap-1 text-neutral-300 truncate">
          <HardDrive className="w-3 h-3 text-sky-400" />
          <button onClick={() => { onSelectFolder(null); }} className="hover:text-sky-300 transition-colors cursor-pointer">Cloudbreak</button>
          <ChevronRight className="w-3 h-3 text-neutral-600" />
          <button onClick={() => { onSelectFolder(null); }} className="text-neutral-400 hover:text-sky-300 transition-colors cursor-pointer">
            {selectedLibrary ? selectedLibrary.name : selectedAccountId === 'all' ? 'All Mounted Clouds' : accounts.find(a => a.id === selectedAccountId)?.name}
          </button>
          {selectedFolder && (() => {
            const trail: FolderItem[] = [];
            let current: FolderItem | undefined = selectedFolder;
            while (current) {
              trail.unshift(current);
              current = current.parentId ? folders.find(f => f.id === current!.parentId) : undefined;
            }
            return trail.map(folder => (
              <React.Fragment key={folder.id}>
                <ChevronRight className="w-3 h-3 text-neutral-600" />
                <button
                  type="button"
                  onClick={() => onSelectFolder(folder.id)}
                  className={`transition-colors cursor-pointer ${
                    folder.id === selectedFolder.id ? 'text-neutral-300' : 'text-neutral-400 hover:text-sky-300'
                  }`}
                >
                  {folder.name}
                </button>
              </React.Fragment>
            ));
          })()}
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
                className="w-28 custom-range"
              />
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <FileContextMenu
          file={contextMenu.file}
          targets={targetsFor(contextMenu.file)}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onOpen={openFile}
          onQuickLook={quickLook}
          onGetInfo={file => setInfoFileId(file.id)}
          onRename={file => setRenaming({ file, x: contextMenu.x, y: contextMenu.y })}
          onDuplicate={duplicateFiles}
          onCopy={onCopyFiles}
          onShare={onShareFile}
          onUnzip={onUnzipFile}
          onTrash={trashFiles}
          onToggleTag={(items, tag) => onToggleTag(items.map(item => item.id), tag)}
        />
      )}

      {renaming && (
        <FileRenameField
          file={renaming.file}
          x={renaming.x}
          y={renaming.y}
          onCommit={name => {
            onRenameFile(renaming.file.id, name);
            setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        />
      )}

      {infoFile && <FileGetInfo file={infoFile} onClose={() => setInfoFileId(null)} />}

    </div>
  );
};
