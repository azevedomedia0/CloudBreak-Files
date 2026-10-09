import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Edit3 } from '@/src/icons';
import { FileItem } from '../../types';
import { isEditableDocument } from '../../utils/documentKind';
import { SelectionAccent, SELECTION_CLASSES } from '../../utils/selectionAccent';
import { setFileDragData } from '../../utils/fileDrag';
import { FileThumbnail } from './FileThumbnail';
import { HoverSelectCheckbox } from './HoverSelectCheckbox';

export interface GalleryViewProps {
  accent: SelectionAccent;
  files: FileItem[];
  selectedFile: FileItem;
  selectedIds: Set<string>;
  onSelectFile: (file: FileItem) => void;
  onEditPhoto: (file: FileItem) => void;
  onOpenDocument: (file: FileItem) => void;
  onFileContextMenu: (file: FileItem, event: React.MouseEvent) => void;
  toggleSelectOne: (id: string, e: React.MouseEvent) => void;
}

const SCROLL_STEP = 280;

export const GalleryView: React.FC<GalleryViewProps> = ({
  accent, files, selectedFile, selectedIds, onSelectFile, onEditPhoto, onOpenDocument, onFileContextMenu, toggleSelectOne,
}) => {
  const reelRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollEdges = useCallback(() => {
    const el = reelRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  useEffect(() => {
    updateScrollEdges();
    const el = reelRef.current;
    if (!el) return;
    const onScroll = () => updateScrollEdges();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(updateScrollEdges);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [files.length, updateScrollEdges]);

  useEffect(() => {
    const el = reelRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(`[data-file-id="${selectedFile.id}"]`);
    active?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    // After scroll settles, refresh arrow visibility.
    const t = window.setTimeout(updateScrollEdges, 320);
    return () => window.clearTimeout(t);
  }, [selectedFile.id, updateScrollEdges]);

  const scrollByDir = (dir: -1 | 1) => {
    reelRef.current?.scrollBy({ left: dir * SCROLL_STEP, behavior: 'smooth' });
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Center Big Gallery Viewport */}
      <div
        className="flex-1 min-h-[380px] flex items-center justify-center relative p-6 overflow-hidden"
        onContextMenu={event => onFileContextMenu(selectedFile, event)}
      >
        {selectedFile.category === 'photo' && (
          <img
            src={selectedFile.url}
            alt={selectedFile.name}
            className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
            onContextMenu={event => onFileContextMenu(selectedFile, event)}
          />
        )}
        {selectedFile.category === 'video' && (
          <video
            src={selectedFile.url}
            controls
            className="max-h-full max-w-full rounded-xl shadow-2xl"
            onContextMenu={event => onFileContextMenu(selectedFile, event)}
          />
        )}
        {selectedFile.category !== 'photo' && selectedFile.category !== 'video' && (
          <FileThumbnail
            file={selectedFile}
            className="w-full h-full"
            iconClassName="w-16 h-16"
            onContextMenu={event => onFileContextMenu(selectedFile, event)}
          />
        )}

        <div className="absolute top-4 right-4 flex items-center gap-2">
          {selectedFile.category === 'photo' && (
            <button
              onClick={() => onEditPhoto(selectedFile)}
              className="px-3 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-neutral-950 font-bold text-xs flex items-center gap-1.5 shadow-lg"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Photo</span>
            </button>
          )}
          {isEditableDocument(selectedFile) && (
            <button
              onClick={() => onOpenDocument(selectedFile)}
              className="px-3 py-1.5 rounded-lg bg-[#0060df] hover:bg-[#0250bb] text-white font-bold text-xs flex items-center gap-1.5 shadow-lg"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit document</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom scrubber reel with arrows + scrollbar */}
      <div className="relative h-28 macos-glass-card rounded-xl">
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollByDir(-1)}
            className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-neutral-950/90 border border-white/15 text-neutral-100 hover:bg-neutral-800 hover:text-white shadow-lg transition-colors"
            title="Scroll left"
            aria-label="Scroll gallery left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollByDir(1)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-neutral-950/90 border border-white/15 text-neutral-100 hover:bg-neutral-800 hover:text-white shadow-lg transition-colors"
            title="Scroll right"
            aria-label="Scroll gallery right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        <div
          ref={reelRef}
          className="gallery-scrubber h-full overflow-x-auto overflow-y-hidden flex gap-3 p-2.5 pb-1"
        >
          {files.map(file => {
            const isActive = selectedFile.id === file.id;
            const isSelected = selectedIds.has(file.id);
            return (
              <div
                key={file.id}
                data-file-id={file.id}
                draggable
                onDragStart={e => setFileDragData(e.dataTransfer, file)}
                onClick={() => onSelectFile(file)}
                onContextMenu={event => onFileContextMenu(file, event)}
                className={`group h-[calc(100%-6px)] aspect-video rounded-lg border shrink-0 cursor-pointer relative transition-all overflow-hidden ${
                  isActive
                    ? SELECTION_CLASSES[accent].galleryRing
                    : isSelected
                    ? 'border-white/25 opacity-100'
                    : 'border-white/10 opacity-60 hover:opacity-100 hover:border-white/20'
                }`}
              >
                <FileThumbnail
                  file={file}
                  compact
                  iconClassName="w-5 h-5"
                  onContextMenu={event => onFileContextMenu(file, event)}
                />
                <HoverSelectCheckbox
                  accent={accent}
                  selected={isSelected}
                  compact
                  onToggle={e => toggleSelectOne(file.id, e)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
