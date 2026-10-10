import React from 'react';
import { Play, X } from '@/src/icons';
import { FileItem } from '../../types';
import { formatTimecode } from '../../utils/format';

/** Seconds the end-of-video countdown runs before the next video starts. */
export const AUTOPLAY_DELAY_SECONDS = 5;

interface UpNextPanelProps {
  next: FileItem;
  /** Shown while playback is idle or finished; hidden while the pointer is moving over the player. */
  visible: boolean;
  /** True once the current video has finished: the panel becomes clickable and stays put. */
  interactive: boolean;
  /** Seconds left before the next video starts, or null when no countdown is running. */
  countdown: number | null;
  onPlayNow: () => void;
  onCancel: () => void;
}

const RING_RADIUS = 15;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export const UpNextPanel: React.FC<UpNextPanelProps> = ({ next, visible, interactive, countdown, onPlayNow, onCancel }) => {
  const seconds = next.videoMeta?.durationSeconds;
  const counting = countdown !== null;
  const elapsed = counting ? (AUTOPLAY_DELAY_SECONDS - countdown) / AUTOPLAY_DELAY_SECONDS : 0;

  return (
    <div
      role="region"
      aria-label="Up next"
      aria-hidden={!visible}
      onClick={e => e.stopPropagation()}
      onMouseMove={e => e.stopPropagation()}
      className={`absolute right-4 bottom-36 w-72 rounded-2xl bg-neutral-900/75 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden select-none transition-all duration-500 ease-out ${
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-6'
      } ${visible && interactive ? 'pointer-events-auto' : 'pointer-events-none'}`}
    >
      <div className="flex gap-3 p-2.5">
        <div className="relative w-28 aspect-video shrink-0 rounded-lg overflow-hidden bg-neutral-950 border border-white/10">
          {next.thumbnailUrl ? (
            <img src={next.thumbnailUrl} alt="" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <video
              src={`${next.url}#t=0.1`}
              preload="metadata"
              muted
              playsInline
              tabIndex={-1}
              className="w-full h-full object-cover"
            />
          )}
          {seconds ? (
            <span className="absolute right-1 bottom-1 px-1 rounded bg-black/70 font-mono text-[10px] text-white/90 tabular-nums">
              {formatTimecode(seconds)}
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1 flex flex-col py-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">Up next</span>
          <span className="mt-0.5 text-[13px] font-medium leading-snug text-white line-clamp-2 break-words">{next.name}</span>
        </div>
      </div>

      {interactive && (
        <div className="flex items-center gap-2 px-2.5 pb-2.5" aria-live="polite">
          {counting && (
            <svg viewBox="0 0 36 36" className="w-9 h-9 shrink-0 -rotate-90" aria-hidden="true">
              <circle cx="18" cy="18" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />
              <circle
                cx="18"
                cy="18"
                r={RING_RADIUS}
                fill="none"
                stroke="rgb(125,211,252)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={RING_LENGTH}
                strokeDashoffset={RING_LENGTH * (1 - elapsed)}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
          )}
          <span className="flex-1 text-[11px] text-white/70 tabular-nums">
            {counting ? `Playing in ${countdown}s` : 'Finished'}
          </span>
          <button
            type="button"
            onClick={onPlayNow}
            className="h-8 px-3 rounded-full bg-white/90 hover:bg-white text-neutral-900 text-[11px] font-semibold flex items-center gap-1.5 active:scale-95 transition-all"
          >
            <Play className="w-3 h-3 fill-current" /> Play now
          </button>
          {counting && (
            <button
              type="button"
              onClick={onCancel}
              className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
              title="Cancel autoplay"
              aria-label="Cancel autoplay"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
