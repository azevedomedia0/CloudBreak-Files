import React, { useMemo, useRef, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Share2, Edit3, CheckSquare, Square, Play } from '@/src/icons';
import { VideoTrimIcon } from '../video-player/VideoTrimIcon';
import { FileItem, FolderItem, CloudAccount, CloudProviderId } from '../../types';
import { isEditableDocument, isMacAppBundle } from '../../utils/documentKind';
import { previewBridge } from '../../services/previewBridge';
import { FileThumbnail } from './FileThumbnail';
import { FolderTile } from './FolderTile';
import { SelectionAccent, SELECTION_CLASSES } from '../../utils/selectionAccent';
import { formatBytes, formatDate } from '../../utils/format';
import { setFileDragData } from '../../utils/fileDrag';

const LOCAL_ROOTS = [
  '/desktop', '/documents', '/photos', '/videos', '/music', '/downloads', '/applications', '/trash',
];
const ROW_HEIGHT = 52;
const HEADER_HEIGHT = 40;

function isOnLocalSystem(file: FileItem): boolean {
  if (file.accountId === 'all') return true;
  const path = (file.folderPath || '').replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '') || '/';
  return LOCAL_ROOTS.some(root => path === root || path.startsWith(`${root}/`));
}

type Row =
  | { kind: 'folder'; folder: FolderItem }
  | { kind: 'file'; file: FileItem };

export interface ListViewProps {
  accent: SelectionAccent;
  files: FileItem[];
  folders?: FolderItem[];
  selectedFileId: string | null;
  selectedIds: Set<string>;
  /** Scroll parent from FileBrowser; falls back to an internal scroller. */
  scrollParentRef?: RefObject<HTMLElement | null>;
  onSelectFile: (file: FileItem) => void;
  onOpenFolder?: (folderId: string) => void;
  onEditPhoto: (file: FileItem) => void;
  onOpenDocument: (file: FileItem) => void;
  onOpenVideo: (file: FileItem) => void;
  onOpenAudio: (file: FileItem) => void;
  onShareFile: (file: FileItem) => void;
  onOpenQuickLook: () => void;
  onFileContextMenu: (file: FileItem, event: React.MouseEvent) => void;
  toggleSelectOne: (id: string, e: React.MouseEvent) => void;
  toggleSelectAll: () => void;
  getAccount: (accountId: CloudProviderId) => CloudAccount | undefined;
}

export const ListView: React.FC<ListViewProps> = ({
  accent, files, folders = [], selectedFileId, selectedIds, scrollParentRef,
  onSelectFile, onOpenFolder, onEditPhoto, onOpenDocument, onOpenVideo, onOpenAudio, onShareFile, onOpenQuickLook, onFileContextMenu, toggleSelectOne, toggleSelectAll, getAccount,
}) => {
  const localScrollRef = useRef<HTMLDivElement>(null);
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    if (onOpenFolder) {
      for (const folder of folders) list.push({ kind: 'folder', folder });
    }
    for (const file of files) list.push({ kind: 'file', file });
    return list;
  }, [folders, files, onOpenFolder]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollParentRef?.current ?? localScrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div
      ref={scrollParentRef ? undefined : localScrollRef}
      className={`rounded-xl overflow-hidden border border-white/8 bg-black/20 ${
        scrollParentRef ? '' : 'max-h-[min(70vh,720px)] overflow-y-auto'
      }`}
    >
      <div className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur-sm border-b border-white/8">
        <div
          className="grid items-center text-[11px] font-semibold text-neutral-400 uppercase tracking-wider px-3"
          style={{
            height: HEADER_HEIGHT,
            gridTemplateColumns: '32px minmax(160px, 2fr) 120px 80px 100px 140px 120px',
          }}
        >
          <button type="button" onClick={toggleSelectAll} className="flex items-center justify-center">
            {selectedIds.size === files.length && files.length > 0 ? (
              <CheckSquare className={`w-3.5 h-3.5 ${SELECTION_CLASSES[accent].checkIcon}`} />
            ) : (
              <Square className="w-3.5 h-3.5 text-neutral-500" />
            )}
          </button>
          <span>Name</span>
          <span>Date Modified</span>
          <span>Size</span>
          <span>Kind</span>
          <span>Cloud Storage</span>
          <span className="text-right">Actions</span>
        </div>
      </div>

      <div className="relative w-full" style={{ height: totalSize }}>
        {virtualRows.map(vRow => {
          const row = rows[vRow.index];
          if (!row) return null;
          const style: React.CSSProperties = {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: vRow.size,
            transform: `translateY(${vRow.start}px)`,
          };

          if (row.kind === 'folder') {
            const { folder } = row;
            return (
              <div
                key={folder.id}
                onClick={() => onOpenFolder?.(folder.id)}
                onDoubleClick={() => onOpenFolder?.(folder.id)}
                className="grid items-center px-3 cursor-pointer transition-colors hover:bg-white/5 border-b border-white/5 text-xs text-neutral-300"
                style={{
                  ...style,
                  gridTemplateColumns: '32px minmax(160px, 2fr) 120px 80px 100px 140px 120px',
                }}
              >
                <span />
                <FolderTile folder={folder} compact onOpen={onOpenFolder!} />
                <span className="text-neutral-500">—</span>
                <span className="text-neutral-500">—</span>
                <span className="text-neutral-400 font-mono text-[11px]">FOLDER</span>
                <span className="flex items-center gap-1.5 text-neutral-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-tr from-sky-400 to-cyan-500" />
                  <span>Local Files</span>
                </span>
                <span />
              </div>
            );
          }

          const { file } = row;
          const isSelected = selectedIds.has(file.id);
          const isCurrent = selectedFileId === file.id;
          const acc = getAccount(file.accountId);
          const onLocal = isOnLocalSystem(file);

          return (
            <div
              key={file.id}
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
              className={`group grid items-center px-3 cursor-pointer transition-colors border-b border-white/5 text-xs ${
                isCurrent
                  ? SELECTION_CLASSES[accent].row
                  : isSelected
                  ? SELECTION_CLASSES[accent].rowMulti
                  : 'hover:bg-white/5 text-neutral-300'
              }`}
              style={{
                ...style,
                gridTemplateColumns: '32px minmax(160px, 2fr) 120px 80px 100px 140px 120px',
              }}
            >
              <button
                type="button"
                onClick={e => toggleSelectOne(file.id, e)}
                className={`flex items-center justify-center transition-opacity ${
                  isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                {isSelected ? (
                  <CheckSquare className={`w-3.5 h-3.5 ${SELECTION_CLASSES[accent].checkIcon}`} />
                ) : (
                  <Square className="w-3.5 h-3.5 text-neutral-400" />
                )}
              </button>
              <div className="flex items-center gap-2.5 min-w-0">
                <FileThumbnail
                  file={file}
                  compact
                  className="w-10 h-7 rounded border border-white/10 bg-black/40 shrink-0"
                  iconClassName="w-3.5 h-3.5"
                  onContextMenu={event => onFileContextMenu(file, event)}
                />
                <span className="truncate">{file.name}</span>
              </div>
              <span className="text-neutral-400 truncate">{formatDate(file.updatedAt)}</span>
              <span className="font-mono text-neutral-400">{formatBytes(file.sizeBytes)}</span>
              <span className="text-neutral-400 font-mono text-[11px] truncate">
                {file.mimeType.split('/')[1]?.toUpperCase() || file.category}
              </span>
              <span className="flex items-center gap-1.5 text-neutral-300 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 bg-gradient-to-tr ${
                  onLocal ? 'from-sky-400 to-cyan-500' : (acc?.avatarColor || 'from-sky-400 to-cyan-500')
                }`} />
                <span className="truncate">{onLocal ? 'Local Files' : (acc?.name ?? '—')}</span>
              </span>
              <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                {file.category === 'photo' && (
                  <button
                    type="button"
                    onClick={() => onEditPhoto(file)}
                    className="p-1 rounded hover:bg-white/10 text-cyan-400"
                    title="Edit in Studio"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
                {isEditableDocument(file) && (
                  <button
                    type="button"
                    onClick={() => onOpenDocument(file)}
                    className="p-1 rounded hover:bg-white/10 text-[#7cacf8]"
                    title="Edit document"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
                {file.category === 'video' && (
                  <button
                    type="button"
                    onClick={() => onOpenVideo(file)}
                    className="p-1 rounded hover:bg-white/10 text-amber-400"
                    title="Cinema Suite"
                  >
                    <VideoTrimIcon className="w-3.5 h-3.5" title="Trim" />
                  </button>
                )}
                {file.category === 'audio' && (
                  <button
                    type="button"
                    onClick={() => onOpenAudio(file)}
                    className="p-1 rounded hover:bg-white/10 text-violet-400"
                    title="Play audio"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onShareFile(file)}
                  className="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white"
                  title="Share"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
