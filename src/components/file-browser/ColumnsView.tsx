import React from 'react';
import { Folder, FileText, Download, ChevronRight, HardDrive, Monitor, Music2 } from '@/src/icons';
import { FileItem, FolderItem } from '../../types';
import { isEditableDocument, isMacAppBundle } from '../../utils/documentKind';
import { previewBridge } from '../../services/previewBridge';
import { FileThumbnail } from './FileThumbnail';
import { HoverSelectCheckbox } from './HoverSelectCheckbox';
import { ApplicationsIcon } from './ApplicationsIcon';
import { PhotosIcon } from './PhotosIcon';
import { VideosIcon } from './VideosIcon';
import { SelectionAccent, SELECTION_CLASSES } from '../../utils/selectionAccent';
import { formatBytes } from '../../utils/format';
import { setFileDragData } from '../../utils/fileDrag';

export interface ColumnsViewProps {
  accent: SelectionAccent;
  files: FileItem[];
  selectedFolder: FolderItem | null;
  selectedFileId: string | null;
  selectedIds: Set<string>;
  folders: FolderItem[];
  totalSize: number;
  onSelectFile: (file: FileItem) => void;
  onEditPhoto: (file: FileItem) => void;
  onOpenDocument: (file: FileItem) => void;
  onOpenVideo: (file: FileItem) => void;
  onOpenAudio: (file: FileItem) => void;
  onOpenQuickLook: () => void;
  onFileContextMenu: (file: FileItem, event: React.MouseEvent) => void;
  onSelectFolder: (folderId: string | null) => void;
  toggleSelectOne: (id: string, e: React.MouseEvent) => void;
}

/** Shared width so every Columns view pane stays equal (Finder-style). */
const COLUMN_WIDTH_CLASS = 'w-64';

export const ColumnsView: React.FC<ColumnsViewProps> = ({
  accent, files, selectedFolder, selectedFileId, selectedIds, folders, totalSize,
  onSelectFile, onEditPhoto, onOpenDocument, onOpenVideo, onOpenAudio, onOpenQuickLook, onFileContextMenu, onSelectFolder, toggleSelectOne,
}) => (
    <div className="h-full flex gap-3 overflow-x-auto min-h-[480px] w-max max-w-full">
      {/* Col 1: Local Files & Folders */}
      <div className={`${COLUMN_WIDTH_CLASS} macos-glass-card rounded-xl flex flex-col shrink-0 overflow-hidden`}>
        <div className="px-3 py-2 border-b border-white/8 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
          Local Files
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <button
            onClick={() => onSelectFolder(null)}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
              !selectedFolder ? 'bg-sky-500/20 text-sky-200 font-medium' : 'text-neutral-300 hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <HardDrive className="w-4 h-4 text-sky-400" />
              <span>Root Bucket</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
          </button>

          {folders.map(f => {
            const isSel = selectedFolder?.id === f.id;
            const iconClass = `w-4 h-4 ${isSel ? 'text-sky-400' : 'text-neutral-400'}`;
            const renderIcon = () => {
              switch (f.name.toLowerCase()) {
                case 'desktop': return <Monitor className={iconClass} />;
                case 'documents': return <FileText className={iconClass} />;
                case 'photos': return <PhotosIcon className={iconClass} title="Photos" />;
                case 'videos': return <VideosIcon className={iconClass} title="Videos" />;
                case 'music': return <Music2 className={iconClass} />;
                case 'downloads': return <Download className={iconClass} />;
                case 'applications': return <ApplicationsIcon className={iconClass} title="Applications" />;
                default: return <Folder className={iconClass} />;
              }
            };
            return (
              <button
                key={f.id}
                onClick={() => onSelectFolder(f.id)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
                  isSel ? 'bg-sky-500/20 text-sky-200 font-medium' : 'text-neutral-300 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {renderIcon()}
                  <span className="truncate">{f.name}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Col 2: Files in Folder */}
      <div className={`${COLUMN_WIDTH_CLASS} macos-glass-card rounded-xl flex flex-col shrink-0 overflow-hidden`}>
        <div className="px-3 py-2 border-b border-white/8 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex justify-between">
          <span>Items ({files.length})</span>
          <span className="font-mono text-neutral-400">{formatBytes(totalSize)}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {files.map(file => {
            const isCurrent = selectedFileId === file.id;
            const isSelected = selectedIds.has(file.id);
            return (
              <button
                key={file.id}
                type="button"
                draggable
                onDragStart={e => setFileDragData(e.dataTransfer, file)}
                onClick={() => onSelectFile(file)}
                onContextMenu={event => onFileContextMenu(file, event)}
                onDoubleClick={() => {
                  if (isMacAppBundle(file) && file.localPath && previewBridge.available()) {
                    void previewBridge.openWithDefault(file.localPath).catch(() => {});
                  } else if (file.category === 'photo') onEditPhoto(file);
                  else if (file.category === 'video') onOpenVideo(file);
                  else if (file.category === 'audio') onOpenAudio(file);
                  else if (isEditableDocument(file)) onOpenDocument(file);
                  else onOpenQuickLook();
                }}
                className={`group w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-all ${
                  isCurrent
                    ? SELECTION_CLASSES[accent].columnRow
                    : isSelected
                    ? SELECTION_CLASSES[accent].rowMulti
                    : 'text-neutral-300 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate min-w-0">
                  <div className="relative w-8 h-6 shrink-0">
                    <FileThumbnail file={file} compact className="w-8 h-6 rounded border border-white/10 bg-black/40" iconClassName="w-3 h-3" onContextMenu={event => onFileContextMenu(file, event)} />
                    <HoverSelectCheckbox
                      accent={accent}
                      selected={isSelected}
                      compact
                      className="!top-0 !left-0 scale-90 origin-top-left"
                      onToggle={e => toggleSelectOne(file.id, e)}
                    />
                  </div>
                  <span className="truncate">{file.name}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
);
