import React, { useEffect, useRef } from 'react';
import { Play, Music2 } from '@/src/icons';
import { FileItem, FolderItem } from '../../types';
import { isEditableDocument, isMacAppBundle } from '../../utils/documentKind';
import { previewBridge } from '../../services/previewBridge';
import { FileThumbnail } from './FileThumbnail';
import { FolderTile } from './FolderTile';
import { HoverSelectCheckbox } from './HoverSelectCheckbox';
import { SelectionAccent, SELECTION_CLASSES } from '../../utils/selectionAccent';
import { formatTimecode } from '../../utils/format';
import { setFileDragData } from '../../utils/fileDrag';
import { useProgressiveItems } from '../../hooks/useProgressiveItems';

/** Badge only when duration is already known — avoids a hidden <video> per tile. */
const MediaDurationBadge: React.FC<{ file: FileItem }> = ({ file }) => {
  const duration = file.videoMeta?.durationSeconds;
  if (!(duration && duration > 0)) return null;
  return (
    <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-[10px] font-mono text-white bg-black/75 px-1.5 py-0.5 rounded-md">
      {file.category === 'audio'
        ? <Music2 className="w-2.5 h-2.5" />
        : <Play className="w-2.5 h-2.5 fill-current" />}
      <span>{formatTimecode(duration)}</span>
    </div>
  );
};

export interface IconsViewProps {
  accent: SelectionAccent;
  files: FileItem[];
  folders?: FolderItem[];
  selectedFileId: string | null;
  selectedIds: Set<string>;
  iconScale: number;
  onSelectFile: (file: FileItem) => void;
  onOpenFolder?: (folderId: string) => void;
  onEditPhoto: (file: FileItem) => void;
  onOpenDocument: (file: FileItem) => void;
  onOpenVideo: (file: FileItem) => void;
  onOpenAudio: (file: FileItem) => void;
  onOpenQuickLook: () => void;
  onFileContextMenu: (file: FileItem, event: React.MouseEvent) => void;
  onFolderContextMenu?: (folder: FolderItem, event: React.MouseEvent) => void;
  toggleSelectOne: (id: string, e: React.MouseEvent) => void;
}

export const IconsView: React.FC<IconsViewProps> = ({
  accent, files, folders = [], selectedFileId, selectedIds, iconScale,
  onSelectFile, onOpenFolder, onEditPhoto, onOpenDocument, onOpenVideo, onOpenAudio, onOpenQuickLook, onFileContextMenu, onFolderContextMenu, toggleSelectOne,
}) => {
  // Large folders (Applications) must not mount every tile in one paint.
  const { visible: visibleFiles, hasMore, showMore, shownCount, totalCount } = useProgressiveItems(
    files,
    48,
    48,
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) showMore();
      },
      { root: null, rootMargin: '400px', threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, showMore, shownCount]);

  return (
    <div
      className="grid gap-x-3 gap-y-5"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(140 * (iconScale / 100))}px, 1fr))`,
      }}
    >
      {onOpenFolder && folders.map(folder => (
        <FolderTile
          key={folder.id}
          folder={folder}
          iconScale={iconScale}
          onOpen={onOpenFolder}
          accent={accent}
          selected={selectedIds.has(folder.id)}
          onToggleSelect={e => toggleSelectOne(folder.id, e)}
          onContextMenu={onFolderContextMenu}
        />
      ))}
      {visibleFiles.map(file => {
        const isSelected = selectedIds.has(file.id);
        const isCurrent = selectedFileId === file.id;
        const isApp = isMacAppBundle(file);
        const isPhoto = file.category === 'photo' && !isApp;

        return (
          <div
            key={file.id}
            draggable
            onDragStart={e => setFileDragData(e.dataTransfer, file)}
            onClick={() => onSelectFile(file)}
            onContextMenu={event => onFileContextMenu(file, event)}
            onDoubleClick={() => {
              if (isApp && file.localPath && previewBridge.available()) {
                void previewBridge.openWithDefault(file.localPath).catch(() => {});
              } else if (file.category === 'photo') onEditPhoto(file);
              else if (file.category === 'video') onOpenVideo(file);
              else if (file.category === 'audio') onOpenAudio(file);
              else if (isEditableDocument(file)) onOpenDocument(file);
              else onOpenQuickLook();
            }}
            className={`group relative rounded-xl px-2 pt-3 pb-2 transition-all cursor-pointer [content-visibility:auto] [contain-intrinsic-size:180px] ${
              isCurrent
                ? SELECTION_CLASSES[accent].card
                : isSelected
                ? SELECTION_CLASSES[accent].cardMulti
                : 'hover:bg-white/5'
            }`}
          >
            {/* Finder-style thumbnail: rounded preview, no glass card chrome */}
            <div className="aspect-[4/3] flex items-center justify-center relative">
              <div
                className={`relative overflow-hidden shadow-md shadow-black/40 ${
                  isApp
                    ? 'w-[72%] aspect-square rounded-[22%]'
                    : isPhoto
                    ? 'w-[78%] aspect-square rounded-2xl'
                    : 'w-[82%] aspect-[4/3] rounded-xl'
                } ${
                  isApp
                    ? 'bg-transparent'
                    : isPhoto
                    ? 'bg-neutral-800'
                    : 'bg-black/50 border border-white/8'
                }`}
              >
                <HoverSelectCheckbox
                  accent={accent}
                  selected={isSelected}
                  onToggle={e => toggleSelectOne(file.id, e)}
                />
                <FileThumbnail
                  file={file}
                  hoverZoom={isPhoto}
                  className="w-full h-full"
                  onContextMenu={event => onFileContextMenu(file, event)}
                />

                {(file.category === 'video' || file.category === 'audio') && (
                  <MediaDurationBadge file={file} />
                )}
              </div>
            </div>

            <div className="pt-1.5 px-1 text-center">
              <p className="text-xs font-medium text-neutral-200 truncate group-hover:text-white leading-snug break-words">
                {file.name}
              </p>
            </div>
          </div>
        );
      })}
      {hasMore && (
        <div
          ref={sentinelRef}
          className="col-span-full flex items-center justify-center py-4 text-[11px] text-neutral-500"
          aria-hidden
        >
          Showing {shownCount} of {totalCount}…
        </div>
      )}
    </div>
  );
};
