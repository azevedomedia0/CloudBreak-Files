import React, { useEffect, useRef, useState } from 'react';
import {
  Play, Pause, Rewind, FastForward, Volume2, Volume1, VolumeX, Repeat,
  StepBack, StepForward, Shuffle, Maximize, Minimize, Cast, Check,
} from 'lucide-react';
import { formatTimecode } from '../../utils/format';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const CAST_TARGETS = [
  { id: 'living-room', label: 'Living Room TV' },
  { id: 'studio-display', label: 'Studio Display' },
  { id: 'bedroom', label: 'Bedroom Chromecast' },
] as const;

interface PlaybackControlsProps {
  visible: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isLooping: boolean;
  playbackRate: number;
  isFullscreen?: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSkip: (seconds: number) => void;
  onStepFrame: (frames: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onToggleLoop: () => void;
  onChangeSpeed: (rate: number) => void;
  onToggleFullscreen?: () => void;
  onCast?: (deviceId: string | null) => void;
  onPreviousMedia?: () => void;
  onNextMedia?: () => void;
  canPreviousMedia?: boolean;
  canNextMedia?: boolean;
}

const iconButton = 'w-8 h-8 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition-all';

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  visible, isPlaying, currentTime, duration, volume, isMuted, isLooping, playbackRate,
  isFullscreen = false,
  onTogglePlay, onSeek, onSkip, onStepFrame, onVolumeChange, onToggleMute, onToggleLoop, onChangeSpeed,
  onToggleFullscreen, onCast,
  onPreviousMedia, onNextMedia, canPreviousMedia = false, canNextMedia = false,
}) => {
  const [speedOpen, setSpeedOpen] = useState(false);
  const [castOpen, setCastOpen] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [castingTo, setCastingTo] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const effectiveVolume = isMuted ? 0 : volume;
  const VolumeIcon = effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const remaining = Math.max(0, duration - currentTime);

  useEffect(() => {
    if (!speedOpen && !castOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setSpeedOpen(false);
        setCastOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [speedOpen, castOpen]);

  const selectCastTarget = (deviceId: string | null) => {
    setCastingTo(deviceId);
    setCastOpen(false);
    onCast?.(deviceId);
  };

  return (
    <div
      onClick={e => e.stopPropagation()}
      ref={menuRef}
      className={`video-playback-controls absolute left-1/2 bottom-5 -translate-x-1/2 w-[min(720px,calc(100%-2rem))] rounded-2xl bg-neutral-900/70 backdrop-blur-xl border border-white/10 shadow-2xl px-4 pt-3 pb-2.5 select-none transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="w-14 text-right font-mono text-[11px] text-white/80 tabular-nums">{formatTimecode(currentTime)}</span>
        <div className="relative flex-1 flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.01}
            value={currentTime}
            onChange={e => onSeek(parseFloat(e.target.value))}
            style={{ '--fill': `${progressPct}%` } as React.CSSProperties}
            className="iina-range w-full"
            aria-label="Seek"
          />
        </div>
        <span className="w-14 font-mono text-[11px] text-white/60 tabular-nums">-{formatTimecode(remaining)}</span>
      </div>

      <div className="mt-1.5 grid grid-cols-3 items-center">
        <div className="flex items-center gap-1.5 group/vol">
          <button onClick={onToggleMute} className={iconButton} title={effectiveVolume === 0 ? 'Unmute' : 'Mute'}>
            <VolumeIcon className="w-4 h-4" />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={effectiveVolume}
            onChange={e => onVolumeChange(parseFloat(e.target.value))}
            style={{ '--fill': `${effectiveVolume * 100}%` } as React.CSSProperties}
            className="iina-range w-16"
            aria-label="Volume"
          />
        </div>

        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => onPreviousMedia?.()}
            disabled={!canPreviousMedia}
            className={`${iconButton} disabled:opacity-40 disabled:cursor-not-allowed`}
            title="Previous media"
          >
            <StepBack className="w-4 h-4" />
          </button>
          <button onClick={() => onSkip(-10)} className={iconButton} title="Back 10 seconds">
            <Rewind className="w-4 h-4 fill-current" />
          </button>
          <button
            onClick={onTogglePlay}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white active:scale-95 transition-all"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 ml-0.5 fill-current" />}
          </button>
          <button onClick={() => onSkip(10)} className={iconButton} title="Forward 10 seconds">
            <FastForward className="w-4 h-4 fill-current" />
          </button>
          <button
            onClick={() => onNextMedia?.()}
            disabled={!canNextMedia}
            className={`${iconButton} disabled:opacity-40 disabled:cursor-not-allowed`}
            title="Next media"
          >
            <StepForward className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-0.5 relative">
          <button
            onClick={() => setIsShuffled(!isShuffled)}
            className={`${iconButton} ${isShuffled ? '!text-white bg-white/20' : ''}`}
            title="Shuffle"
          >
            <Shuffle className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleLoop}
            className={`${iconButton} ${isLooping ? '!text-white bg-white/20' : ''}`}
            title="Loop playback"
          >
            <Repeat className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setCastOpen(false);
              setSpeedOpen(o => !o);
            }}
            className="h-8 min-w-9 px-2 flex items-center justify-center rounded-full text-[11px] font-semibold text-white/80 hover:text-white hover:bg-white/10 tabular-nums transition-all"
            title="Playback speed"
          >
            {playbackRate}x
          </button>
          {speedOpen && (
            <div className="absolute bottom-10 right-16 py-1 rounded-xl bg-neutral-900/90 backdrop-blur-xl border border-white/10 shadow-xl min-w-20 z-10">
              {SPEEDS.map(speed => (
                <button
                  key={speed}
                  onClick={() => {
                    onChangeSpeed(speed);
                    setSpeedOpen(false);
                  }}
                  className={`w-full px-3 py-1 text-left text-[11px] tabular-nums transition-colors ${
                    playbackRate === speed ? 'text-white font-semibold bg-white/10' : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => {
              setSpeedOpen(false);
              setCastOpen(o => !o);
            }}
            className={`${iconButton} ${castingTo || castOpen ? '!text-white bg-white/20' : ''}`}
            title={castingTo ? `Casting to ${CAST_TARGETS.find(t => t.id === castingTo)?.label ?? 'device'}` : 'Cast'}
            aria-label="Cast"
          >
            <Cast className="w-4 h-4" />
          </button>
          {castOpen && (
            <div className="absolute bottom-10 right-8 py-1.5 rounded-xl bg-neutral-900/95 backdrop-blur-xl border border-white/10 shadow-xl min-w-48 z-10">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Cast to device
              </div>
              {CAST_TARGETS.map(target => (
                <button
                  key={target.id}
                  onClick={() => selectCastTarget(target.id)}
                  className={`w-full px-3 py-1.5 text-left text-[11px] flex items-center justify-between gap-2 transition-colors ${
                    castingTo === target.id
                      ? 'text-white font-semibold bg-white/10'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>{target.label}</span>
                  {castingTo === target.id && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </button>
              ))}
              {castingTo && (
                <button
                  onClick={() => selectCastTarget(null)}
                  className="w-full px-3 py-1.5 mt-0.5 border-t border-white/10 text-left text-[11px] text-rose-300 hover:bg-white/10"
                >
                  Stop casting
                </button>
              )}
            </div>
          )}
          <button
            onClick={onToggleFullscreen}
            className={iconButton}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
