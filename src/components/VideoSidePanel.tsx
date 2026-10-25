import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from '@/src/icons';
import { FileItem } from '../types';
import { formatTimecode } from '../utils/format';
import { mediaLabel, QueueDropOverlay, UpcomingList, useQueueDropZone } from './PlayingNextPanel';

const AUTOPLAY_KEY = 'cloudbreak.video.autoplay';
/** Seconds to wait after a video ends before the next one starts. */
const NEXT_DELAY_SECONDS = 3;

function loadAutoplay(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== 'off';
  } catch {
    return true;
  }
}

interface VideoSidePanelProps {
  width?: number;
  file: FileItem;
  /** What follows this video (a queued item first), for the countdown line. */
  nextMedia: FileItem | null;
  upcoming: FileItem[];
  queuedIds: string[];
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  /** Open the full player window (trim, convert, bigger picture) at the current position. */
  onExpand: (atSeconds: number) => void;
  onPlay: (file: FileItem) => void;
  /** Double-click on a video in the queue: the full player in the center area. */
  onOpenFull?: (file: FileItem) => void;
  onQueueDrop: (ids: string[]) => void;
  onRemoveQueued: (file: FileItem) => void;
}

const iconBtn =
  'w-8 h-8 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition disabled:opacity-35 disabled:pointer-events-none';

/** The video player, shown in the right-hand panel in place of the inspector. The queue sits below it. */
export const VideoSidePanel: React.FC<VideoSidePanelProps> = ({
  width = 320, file, nextMedia, upcoming, queuedIds, canPrevious, canNext,
  onPrevious, onNext, onClose, onExpand, onPlay, onOpenFull, onQueueDrop, onRemoveQueued,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  // A video opened in the panel waits for Play; "autoplay next" only applies once something has played here.
  const hasPlayed = useRef(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(file.videoMeta?.durationSeconds || 0);
  const [muted, setMuted] = useState(false);
  const [autoplay, setAutoplay] = useState(loadAutoplay);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const { dragOver, zoneProps } = useQueueDropZone(onQueueDrop);

  useEffect(() => {
    try {
      localStorage.setItem(AUTOPLAY_KEY, autoplay ? 'on' : 'off');
    } catch { /* storage unavailable */ }
    if (!autoplay) setCountdown(null);
  }, [autoplay]);

  // Count down to the next item after this one ends.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      onNext();
      return;
    }
    const timer = setTimeout(() => setCountdown(c => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const toggle = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(err => {
        if (err?.name !== 'AbortError') setError('This video couldn’t be played. Its format may not be supported yet.');
      });
    } else {
      el.pause();
    }
  };

  const seek = (value: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = value;
    setTime(value);
    setCountdown(null);
  };

  const progress = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <div
      style={{ width: `${width}px` }}
      className="relative macos-sidebar-glass border-l border-white/8 flex flex-col h-full overflow-hidden select-none shrink-0"
      {...zoneProps}
    >
      {dragOver && <QueueDropOverlay message="Drop to play next" />}

      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 macos-toolbar-glass border-b border-white/8 shrink-0">
        <p className="min-w-0 truncate text-xs font-semibold text-neutral-100" title={file.name}>{mediaLabel(file)}</p>
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={() => onExpand(videoRef.current?.currentTime ?? 0)} className={iconBtn} title="Open in the full player" aria-label="Open in the full player">
            <Maximize2 className="w-4 h-4" />
          </button>
          <button type="button" onClick={onClose} className={iconBtn} title="Close video" aria-label="Close video">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="shrink-0 px-3 pt-3">
        <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
          <video
            key={file.id}
            ref={videoRef}
            src={file.url}
            autoPlay={autoplay && hasPlayed.current}
            playsInline
            onClick={toggle}
            onLoadedMetadata={() => {
              const d = videoRef.current?.duration;
              if (d && Number.isFinite(d)) setDuration(d);
            }}
            onTimeUpdate={() => setTime(videoRef.current?.currentTime ?? 0)}
            onPlay={() => { hasPlayed.current = true; setPlaying(true); setCountdown(null); setError(null); }}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              if (autoplay && canNext) setCountdown(NEXT_DELAY_SECONDS);
            }}
            onError={() => setError('This video couldn’t be loaded. Its format may not be supported yet.')}
            className="w-full h-full object-contain cursor-pointer"
          />
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/70 text-center text-xs text-neutral-200">
              {error}
            </div>
          )}
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <span className="w-10 text-right font-mono text-[10px] text-white/70 tabular-nums">{formatTimecode(time)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.01}
            value={Math.min(time, duration || 100)}
            onChange={e => seek(parseFloat(e.target.value))}
            style={{ '--fill': `${progress}%` } as React.CSSProperties}
            className="iina-range flex-1"
            aria-label="Seek"
          />
          <span className="w-10 font-mono text-[10px] text-white/50 tabular-nums">-{formatTimecode(Math.max(0, duration - time))}</span>
        </div>

        <div className="mt-1 flex items-center justify-between">
          <button type="button" onClick={() => setMuted(m => { if (videoRef.current) videoRef.current.muted = !m; return !m; })} className={iconBtn} title={muted ? 'Unmute' : 'Mute'} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onPrevious} disabled={!canPrevious} className={iconBtn} title="Previous video" aria-label="Previous video">
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggle}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white active:scale-95 transition"
              title={playing ? 'Pause' : 'Play'}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 ml-0.5 fill-current" />}
            </button>
            <button type="button" onClick={onNext} disabled={!canNext} className={iconBtn} title="Next" aria-label="Next">
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoplay}
            onClick={() => setAutoplay(a => !a)}
            className={`${iconBtn} ${autoplay ? '!text-white bg-white/20' : ''}`}
            title={autoplay ? 'Autoplay next: on' : 'Autoplay next: off'}
            aria-label="Autoplay"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 4v5h-5" />
              <path d="M10 9l5 3-5 3z" fill="currentColor" />
            </svg>
          </button>
        </div>

        {countdown !== null && nextMedia && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-sky-400/10 border border-sky-400/20 px-2.5 py-1.5 text-[11px] text-sky-100" aria-live="polite">
            <span className="min-w-0 flex-1 truncate">Next: {mediaLabel(nextMedia)} in {countdown}s</span>
            <button type="button" onClick={() => setCountdown(null)} className="shrink-0 font-semibold text-sky-200 hover:text-white">Cancel</button>
          </div>
        )}
      </div>

      <div className="px-3 pt-4 pb-1 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Next up</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-0.5">
        <UpcomingList upcoming={upcoming} queuedIds={queuedIds} onPlay={onPlay} onOpenFull={onOpenFull} onRemoveQueued={onRemoveQueued} />
      </div>
    </div>
  );
};
