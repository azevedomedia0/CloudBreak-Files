import React, { useRef, useState } from 'react';
import { ListMusic, Music2, Play, Video, X } from '@/src/icons';
import { FileItem } from '../types';
import { formatTimecode } from '../utils/format';
import { isCloudbreakFileDrag, readDroppedFileIds } from '../utils/fileDrag';

export function mediaLabel(file: FileItem): string {
  const stem = file.name.replace(/\.[^.]+$/, '');
  return stem.includes(' - ') ? stem : stem.replace(/_/g, ' ');
}

const Art: React.FC<{ file: FileItem; className?: string }> = ({ file, className = 'w-10 h-10' }) => (
  <div className={`${className} rounded-md overflow-hidden shrink-0 bg-white/5 border border-white/10 flex items-center justify-center text-neutral-500`}>
    {file.thumbnailUrl ? (
      <img src={file.thumbnailUrl} alt="" className="w-full h-full object-cover" draggable={false} />
    ) : file.category === 'video' && file.url ? (
      // No stored thumbnail: show a frame from the video itself (metadata only, nothing plays).
      <video
        src={`${file.url.split('#')[0]}#t=0.5`}
        preload="metadata"
        muted
        playsInline
        tabIndex={-1}
        aria-hidden
        className="w-full h-full object-cover pointer-events-none"
      />
    ) : file.category === 'video' ? (
      <Video className="w-4 h-4" />
    ) : (
      <Music2 className="w-4 h-4" />
    )}
  </div>
);

const Duration: React.FC<{ file: FileItem }> = ({ file }) => (
  <span className="text-[10px] font-mono text-neutral-500 tabular-nums">
    {file.videoMeta && file.videoMeta.durationSeconds > 0 ? formatTimecode(file.videoMeta.durationSeconds) : '—'}
  </span>
);

/**
 * Lets a panel accept thumbnails dragged from the file browser. Spread `zoneProps` on the panel's root element;
 * `dragOver` is true while a file is held over it.
 */
export function useQueueDropZone(onQueueDrop?: (ids: string[]) => void) {
  const [dragOver, setDragOver] = useState(false);
  // dragenter/leave fire for every child element, so count them instead of toggling on each event.
  const depth = useRef(0);
  const accepts = (e: React.DragEvent) => !!onQueueDrop && isCloudbreakFileDrag(e.dataTransfer);

  const zoneProps = {
    onDragEnter: (e: React.DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragOver(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!accepts(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current = 0;
      setDragOver(false);
      const ids = readDroppedFileIds(e.dataTransfer);
      if (ids.length) onQueueDrop?.(ids);
    },
  };
  return { dragOver, zoneProps };
}

export const QueueDropOverlay: React.FC<{ message: string }> = ({ message }) => (
  <div className="absolute inset-2 z-10 rounded-xl border-2 border-dashed border-sky-400/70 bg-sky-400/10 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 pointer-events-none">
    <ListMusic className="w-6 h-6 text-sky-300" />
    <p className="text-xs font-semibold text-sky-100">{message}</p>
  </div>
);

interface UpcomingListProps {
  upcoming: FileItem[];
  /** Ids the user queued by dragging; those rows get a remove button. */
  queuedIds?: string[];
  onPlay: (file: FileItem) => void;
  /** Double-click on a video: the full player in the center area. */
  onOpenFull?: (file: FileItem) => void;
  onRemoveQueued?: (file: FileItem) => void;
}

/** Numbered list of what plays next. */
export const UpcomingList: React.FC<UpcomingListProps> = ({ upcoming, queuedIds = [], onPlay, onOpenFull, onRemoveQueued }) => {
  const queued = new Set(queuedIds);
  if (upcoming.length === 0) {
    return <p className="text-xs text-neutral-500 px-2 py-3">Nothing else is queued. Drag songs or videos here to add them.</p>;
  }
  return (
    <>
      {upcoming.map((file, i) => (
        <div key={file.id} className="group relative">
          <button
            type="button"
            onClick={() => onPlay(file)}
            onDoubleClick={() => { if (file.category === 'video') onOpenFull?.(file); }}
            className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white/8 transition-colors"
            title={`Play ${mediaLabel(file)}`}
          >
            <span className="w-4 shrink-0 text-center text-[10px] font-mono text-neutral-500 tabular-nums">{i + 1}</span>
            <Art file={file} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-neutral-200 truncate">{mediaLabel(file)}</p>
              <Duration file={file} />
            </div>
            {!queued.has(file.id) && (
              <Play className="w-3 h-3 shrink-0 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </button>
          {queued.has(file.id) && onRemoveQueued && (
            <button
              type="button"
              onClick={() => onRemoveQueued(file)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition"
              title="Remove from queue"
              aria-label={`Remove ${mediaLabel(file)} from the queue`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </>
  );
};

interface PlayingNextPanelProps {
  width?: number;
  /** What is playing right now (audio or video), or null. */
  nowPlaying: FileItem | null;
  /** What plays after it, in order. */
  upcoming: FileItem[];
  onPlay: (file: FileItem) => void;
  onOpenFull?: (file: FileItem) => void;
  queuedIds?: string[];
  /** Files dragged onto the panel (ids from the browser). */
  onQueueDrop?: (ids: string[]) => void;
  onRemoveQueued?: (file: FileItem) => void;
  /** Hide the panel (the close button in the header). */
  onClose?: () => void;
  /** Replaces the title in the header: the File Inspector / Playing Next switch. */
  modeSwitch?: React.ReactNode;
}

/** Right side panel listing what is playing and what comes next. Thumbnails dragged here play next. */
export const PlayingNextPanel: React.FC<PlayingNextPanelProps> = ({
  width = 320, nowPlaying, upcoming, onPlay, onOpenFull, queuedIds = [], onQueueDrop, onRemoveQueued, onClose, modeSwitch,
}) => {
  const { dragOver, zoneProps } = useQueueDropZone(onQueueDrop);
  return (
    <div
      style={{ width: `${width}px` }}
      className="relative macos-sidebar-glass border-l border-white/8 flex flex-col h-full overflow-hidden select-none shrink-0"
      {...zoneProps}
    >
      {dragOver && <QueueDropOverlay message={nowPlaying ? 'Drop to play next' : 'Drop to start playing'} />}

      <div className="flex items-center justify-between px-3.5 py-2.5 macos-toolbar-glass border-b border-white/8 shrink-0">
        {modeSwitch ?? (
          <div className="flex items-center gap-2 leading-none">
            <ListMusic className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-semibold text-neutral-200">Playing Next</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          {nowPlaying && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/8 text-neutral-300">{upcoming.length}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close playing next"
            title="Close playing next"
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-100 hover:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!nowPlaying ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-neutral-400 inline-flex items-center justify-center">
            <ListMusic className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-200">Nothing is playing</p>
            <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">
              Play a song or video, or drag songs or videos here, and what comes next will line up.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="px-3 pt-3 pb-2 shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Now playing</p>
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 bg-sky-400/10 border border-sky-400/20">
              <Art file={nowPlaying} className="w-11 h-11" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-neutral-100 truncate">{mediaLabel(nowPlaying)}</p>
                <Duration file={nowPlaying} />
              </div>
            </div>
          </div>

          <div className="px-3 pt-1 pb-1 shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Next up</p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-0.5">
            <UpcomingList upcoming={upcoming} queuedIds={queuedIds} onPlay={onPlay} onOpenFull={onOpenFull} onRemoveQueued={onRemoveQueued} />
          </div>
        </>
      )}
    </div>
  );
};
