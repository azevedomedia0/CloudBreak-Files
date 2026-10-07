import React, { useEffect, useRef } from 'react';
import { Play, Pause, Scissors, ChevronLeft, ChevronRight, MapPin, RotateCcw, Repeat } from 'lucide-react';
import { formatTimecode } from '../../utils/format';

const MIN_CLIP_SECONDS = 0.1;

export interface TrimPanelProps {
  duration: number;
  currentTime: number;
  fps: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  trimStart: number;
  setTrimStart: (value: number) => void;
  trimEnd: number;
  setTrimEnd: (value: number) => void;
  onSeek: (time: number) => void;
  playTrimLoop: () => void;
  onContinue: () => void;
}

type Handle = 'start' | 'end';

export const TrimPanel: React.FC<TrimPanelProps> = ({
  duration, currentTime, fps, isPlaying, onTogglePlay, trimStart, setTrimStart, trimEnd, setTrimEnd, onSeek, playTrimLoop, onContinue,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<Handle | null>(null);

  const safeDuration = Math.max(duration, MIN_CLIP_SECONDS);
  const pct = (t: number) => `${(t / safeDuration) * 100}%`;
  const frame = 1 / (fps || 30);
  const clipLength = Math.max(0, trimEnd - trimStart);
  const isFullClip = trimStart <= 0.001 && trimEnd >= duration - 0.001;

  const clampStart = (t: number) => Math.max(0, Math.min(trimEnd - MIN_CLIP_SECONDS, t));
  const clampEnd = (t: number) => Math.min(duration, Math.max(trimStart + MIN_CLIP_SECONDS, t));

  const moveStart = (t: number) => {
    const next = clampStart(t);
    setTrimStart(next);
    onSeek(next);
  };
  const moveEnd = (t: number) => {
    const next = clampEnd(t);
    setTrimEnd(next);
    onSeek(next);
  };

  const timeFromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * safeDuration;
  };

  const handlePointerDown = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    draggingRef.current = handle;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const t = timeFromPointer(e.clientX);
    if (draggingRef.current === 'start') moveStart(t);
    else moveEnd(t);
  };

  const handlePointerUp = () => {
    draggingRef.current = null;
  };

  const handleHandleKey = (handle: Handle) => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 1 : frame;
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    if (handle === 'start') moveStart(trimStart + dir * step);
    else moveEnd(trimEnd + dir * step);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'i' || e.key === 'I') {
        setTrimStart(Math.max(0, Math.min(trimEnd - MIN_CLIP_SECONDS, currentTime)));
      } else if (e.key === 'o' || e.key === 'O') {
        setTrimEnd(Math.min(duration, Math.max(trimStart + MIN_CLIP_SECONDS, currentTime)));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentTime, trimStart, trimEnd, duration, setTrimStart, setTrimEnd]);

  const nudgeButton = 'w-6 h-6 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white/80 transition-colors';

  const renderPoint = (label: string, shortcut: string, time: number, nudge: (delta: number) => void, setToPlayhead: () => void) => (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
      <div>
        <div className="flex items-center gap-1.5 text-[10px] text-white/60 mb-0.5">
          <span className="font-medium uppercase tracking-wider">{label}</span>
          <kbd className="px-1 rounded bg-white/10 text-white/70 font-mono text-[9px]">{shortcut}</kbd>
        </div>
        <div className="font-mono text-sm font-semibold text-amber-300 tabular-nums">{formatTimecode(time, true, fps)}</div>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => nudge(-frame)} className={nudgeButton} title="Back one frame">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => nudge(frame)} className={nudgeButton} title="Forward one frame">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button onClick={setToPlayhead} className={nudgeButton} title={`Set ${label.toLowerCase()} to the playhead`}>
          <MapPin className="w-3.5 h-3.5 text-amber-300" />
        </button>
      </div>
    </div>
  );

  return (
    <div
      onClick={e => e.stopPropagation()}
      className="absolute left-1/2 bottom-5 -translate-x-1/2 w-[min(820px,calc(100%-2rem))] rounded-2xl bg-neutral-900/70 backdrop-blur-xl border border-white/10 shadow-2xl px-4 pt-3 pb-3 select-none"
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onTogglePlay}
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white active:scale-95 transition-all"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
        </button>

        <div className="flex-1 min-w-0">
          <div
            ref={trackRef}
            onPointerDown={e => onSeek(timeFromPointer(e.clientX))}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative h-11 mx-2 rounded-md bg-white/10 cursor-pointer touch-none select-none"
          >
            <div className="absolute inset-y-0 left-0 rounded-l-md bg-neutral-950/70" style={{ width: pct(trimStart) }} />
            <div className="absolute inset-y-0 right-0 rounded-r-md bg-neutral-950/70" style={{ width: `calc(100% - ${pct(trimEnd)})` }} />
            <div
              className="absolute inset-y-0 border-y-2 border-amber-300 bg-amber-300/15 pointer-events-none"
              style={{ left: pct(trimStart), width: `calc(${pct(trimEnd)} - ${pct(trimStart)})` }}
            />

            <div className="absolute -top-1 -bottom-1 w-0.5 bg-white pointer-events-none" style={{ left: pct(currentTime) }}>
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white" />
            </div>

            {(['start', 'end'] as Handle[]).map(handle => {
              const time = handle === 'start' ? trimStart : trimEnd;
              return (
                <div
                  key={handle}
                  role="slider"
                  tabIndex={0}
                  aria-label={handle === 'start' ? 'Trim start' : 'Trim end'}
                  aria-valuemin={0}
                  aria-valuemax={duration}
                  aria-valuenow={Math.round(time * 100) / 100}
                  onPointerDown={handlePointerDown(handle)}
                  onKeyDown={handleHandleKey(handle)}
                  className="absolute -top-1 -bottom-1 w-3.5 -translate-x-1/2 rounded-md bg-amber-300 hover:bg-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-ew-resize flex items-center justify-center shadow-md"
                  style={{ left: pct(time) }}
                >
                  <div className="w-0.5 h-4 rounded bg-neutral-900/70" />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mx-2 mt-1 font-mono text-[10px] text-white/50 tabular-nums">
            <span>{formatTimecode(0)}</span>
            <span>Playhead {formatTimecode(currentTime, true, fps)}</span>
            <span>{formatTimecode(duration)}</span>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {renderPoint('Start', 'I', trimStart, d => moveStart(trimStart + d), () => moveStart(currentTime))}
        {renderPoint('End', 'O', trimEnd, d => moveEnd(trimEnd + d), () => moveEnd(currentTime))}

        <div className="px-2 text-xs text-white/60 leading-tight">
          <div>
            Keeping <span className="font-mono font-semibold text-white tabular-nums">{formatTimecode(clipLength, true, fps)}</span>
          </div>
          <button
            onClick={() => {
              setTrimStart(0);
              setTrimEnd(duration);
            }}
            disabled={isFullClip}
            className="mt-0.5 flex items-center gap-1 text-[11px] text-white/60 hover:text-white disabled:opacity-40 disabled:hover:text-white/60 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={playTrimLoop}
            className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Loop the selected range"
          >
            <Repeat className="w-3.5 h-3.5 text-amber-300" />
            <span>Preview</span>
          </button>
          <button
            onClick={onContinue}
            className="h-9 px-3 rounded-lg bg-amber-300 hover:bg-amber-200 text-neutral-950 text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="Next: choose a format and where to save"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Save clip</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
