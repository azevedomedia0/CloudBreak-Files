import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  SkipBack, SkipForward, Pause, Play, Shuffle, Repeat, MoreHorizontal, X,
  Volume2, VolumeX, ListMusic,
} from 'lucide-react';
import { FileItem } from '../types';
import { formatTimecode } from '../utils/format';

interface AudioPlayerBarProps {
  file: FileItem;
  playlist: FileItem[];
  onSelectTrack: (file: FileItem) => void;
  onClose: () => void;
}

const VOLUME_KEY = 'cloudbreak.audio.volume';

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Prefer "Artist - Title" from the filename; fall back to the stem. */
function trackLabel(file: FileItem): string {
  const stem = file.name.replace(/\.[^.]+$/, '');
  return stem.includes(' - ') ? stem : stem.replace(/_/g, ' ');
}

function loadVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw == null) return 0.85;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0.85;
    return Math.min(1, Math.max(0, n));
  } catch {
    return 0.85;
  }
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  file,
  playlist,
  onSelectTrack,
  onClose,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const queueRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(file.videoMeta?.durationSeconds ?? 0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [volume, setVolume] = useState(loadVolume);
  const [muted, setMuted] = useState(false);
  const [volumeBeforeMute, setVolumeBeforeMute] = useState(0.85);

  const index = playlist.findIndex(item => item.id === file.id);

  const upNext = useMemo(() => {
    if (playlist.length === 0) return [] as FileItem[];
    if (index < 0) return playlist.filter(item => item.id !== file.id);
    const after = playlist.slice(index + 1);
    const before = playlist.slice(0, index);
    return [...after, ...before];
  }, [playlist, index, file.id]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.load();
    el.volume = muted ? 0 : volume;
    void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    setCurrentTime(0);
    setDuration(file.videoMeta?.durationSeconds ?? 0);
    setMenuOpen(false);
  }, [file.id, file.url]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [playing]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      // ignore
    }
  }, [volume]);

  useEffect(() => {
    if (!queueOpen && !menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (queueRef.current?.contains(target)) return;
      const bar = document.querySelector('.audio-player-bar');
      if (bar?.contains(target) && (event.target as HTMLElement).closest('.audio-player-queue-btn, .audio-player-more-btn')) {
        return;
      }
      setQueueOpen(false);
      setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setQueueOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [queueOpen, menuOpen]);

  const goRelative = (delta: number) => {
    if (playlist.length === 0) return;
    if (shuffle && playlist.length > 1) {
      let next = Math.floor(Math.random() * playlist.length);
      if (next === index) next = (next + 1) % playlist.length;
      onSelectTrack(playlist[next]);
      return;
    }
    const base = index >= 0 ? index : 0;
    const next = (base + delta + playlist.length) % playlist.length;
    onSelectTrack(playlist[next]);
  };

  const onEnded = () => {
    if (repeat) {
      const el = audioRef.current;
      if (el) {
        el.currentTime = 0;
        void el.play();
      }
      return;
    }
    if (playlist.length > 1) goRelative(1);
    else setPlaying(false);
  };

  const toggleMute = () => {
    if (muted || volume === 0) {
      const restore = volumeBeforeMute > 0 ? volumeBeforeMute : 0.85;
      setVolume(restore);
      setMuted(false);
    } else {
      setVolumeBeforeMute(volume);
      setMuted(true);
    }
  };

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const remaining = Math.max(0, duration - currentTime);
  const art = file.thumbnailUrl;
  const effectiveVolume = muted ? 0 : volume;

  return (
    <div
      className="audio-player-bar shrink-0 z-30 w-full border-t border-white/8 flex items-stretch overflow-visible"
      style={{
        ['--audio-progress' as string]: `${progress * 100}%`,
        ['--audio-volume' as string]: `${effectiveVolume * 100}%`,
      }}
    >
      <audio
        ref={audioRef}
        src={file.url}
        preload="metadata"
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || file.videoMeta?.durationSeconds || 0)}
        onEnded={onEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      {/* Artwork + transport */}
      <div className="flex items-center gap-3 px-3 py-2.5 shrink-0">
        <div className="audio-player-art w-11 h-11 rounded-lg overflow-hidden shrink-0">
          {art ? (
            <img src={art} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-violet-500/70 to-sky-600/60" />
          )}
        </div>
        <div className="audio-player-controls flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => goRelative(-1)}
            className="audio-player-btn p-1.5 rounded-full transition-colors"
            title="Previous"
            disabled={playlist.length < 2}
          >
            <SkipBack className="w-4 h-4" fill="currentColor" />
          </button>
          <button
            type="button"
            onClick={() => setPlaying(p => !p)}
            className="audio-player-btn audio-player-play p-1.5 rounded-full transition-colors"
            title={playing ? 'Pause' : 'Play'}
          >
            {playing
              ? <Pause className="w-4 h-4" fill="currentColor" />
              : <Play className="w-4 h-4 ml-0.5" fill="currentColor" />}
          </button>
          <button
            type="button"
            onClick={() => goRelative(1)}
            className="audio-player-btn p-1.5 rounded-full transition-colors"
            title="Next"
            disabled={playlist.length < 2}
          >
            <SkipForward className="w-4 h-4" fill="currentColor" />
          </button>
        </div>
      </div>

      <div className="audio-player-divider w-px self-stretch my-2 shrink-0" />

      {/* Title + scrubber */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5 px-4 py-2">
        <p className="audio-player-title text-[13px] font-medium truncate tracking-tight">
          {trackLabel(file)}
        </p>
        <div className="flex items-center gap-2.5">
          <span className="audio-player-time text-[10px] font-mono tabular-nums w-8 shrink-0">
            {formatClock(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.05}
            value={Math.min(currentTime, duration || 0)}
            onChange={e => {
              const next = Number(e.target.value);
              setCurrentTime(next);
              if (audioRef.current) audioRef.current.currentTime = next;
            }}
            className="audio-scrubber flex-1 min-w-0"
            aria-label="Seek"
          />
          <span className="audio-player-time text-[10px] font-mono tabular-nums w-10 shrink-0 text-right">
            -{formatClock(remaining)}
          </span>
        </div>
      </div>

      <div className="audio-player-divider w-px self-stretch my-2 shrink-0" />

      {/* Volume */}
      <div className="audio-player-volume flex items-center gap-1.5 px-3 shrink-0">
        <button
          type="button"
          onClick={toggleMute}
          className="audio-player-btn p-1.5 rounded-full transition-colors"
          title={muted || volume === 0 ? 'Unmute' : 'Mute'}
        >
          {muted || volume === 0
            ? <VolumeX className="w-4 h-4" />
            : <Volume2 className="w-4 h-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={effectiveVolume}
          onChange={e => {
            const next = Number(e.target.value);
            setVolume(next);
            setMuted(next === 0);
            if (next > 0) setVolumeBeforeMute(next);
          }}
          className="audio-volume-scrubber w-20"
          aria-label="Volume"
        />
      </div>

      <div className="audio-player-divider w-px self-stretch my-2 shrink-0" />

      {/* Secondary controls */}
      <div className="relative flex items-center gap-1 px-3 shrink-0">
        <button
          type="button"
          onClick={() => {
            setQueueOpen(q => !q);
            setMenuOpen(false);
          }}
          className={`audio-player-btn audio-player-queue-btn p-1.5 rounded-full transition-colors ${queueOpen ? 'audio-player-btn-active' : ''}`}
          title="Up next"
          aria-expanded={queueOpen}
        >
          <ListMusic className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setShuffle(s => !s)}
          className={`audio-player-btn p-1.5 rounded-full transition-colors ${shuffle ? 'audio-player-btn-active' : ''}`}
          title="Shuffle"
        >
          <Shuffle className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setRepeat(r => !r)}
          className={`audio-player-btn p-1.5 rounded-full transition-colors ${repeat ? 'audio-player-btn-active' : 'audio-player-btn-muted'}`}
          title="Repeat"
        >
          <Repeat className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setMenuOpen(m => !m);
            setQueueOpen(false);
          }}
          className="audio-player-btn audio-player-more-btn p-1.5 rounded-full transition-colors"
          title="More"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {menuOpen && (
          <div className="audio-player-menu absolute right-2 bottom-full mb-2 min-w-[140px] rounded-lg py-1 z-40 shadow-xl">
            <button
              type="button"
              onClick={onClose}
              className="audio-player-menu-item w-full flex items-center gap-2 px-3 py-2 text-xs"
            >
              <X className="w-3.5 h-3.5" />
              Close player
            </button>
          </div>
        )}

        {queueOpen && (
          <div
            ref={queueRef}
            className="audio-player-queue absolute right-2 bottom-full mb-2 w-[320px] max-h-[360px] rounded-xl z-40 shadow-xl flex flex-col overflow-hidden"
          >
            <div className="audio-player-queue-header px-3 py-2.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <ListMusic className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs font-semibold tracking-tight">Up Next</span>
                <span className="audio-player-queue-count text-[10px] font-mono px-1.5 py-0.5 rounded">
                  {upNext.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setQueueOpen(false)}
                className="audio-player-btn p-1 rounded-md"
                title="Close queue"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="audio-player-queue-now px-3 py-2 shrink-0">
              <p className="audio-player-queue-label text-[10px] font-semibold uppercase tracking-wider mb-1.5">
                Now Playing
              </p>
              <button
                type="button"
                onClick={() => setQueueOpen(false)}
                className="audio-player-queue-row audio-player-queue-row-current w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left"
              >
                <div className="audio-player-art w-9 h-9 rounded-md overflow-hidden shrink-0">
                  {art ? (
                    <img src={art} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-violet-500/70 to-sky-600/60" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{trackLabel(file)}</p>
                  <p className="audio-player-time text-[10px] font-mono">
                    {file.videoMeta ? formatTimecode(file.videoMeta.durationSeconds) : '—'}
                  </p>
                </div>
                {playing && <span className="audio-player-queue-live text-[9px] font-semibold uppercase tracking-wide shrink-0">Live</span>}
              </button>
            </div>

            <div className="px-3 pb-1 pt-0.5 shrink-0">
              <p className="audio-player-queue-label text-[10px] font-semibold uppercase tracking-wider">
                Next Playing
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 min-h-0">
              {upNext.length === 0 ? (
                <p className="audio-player-time text-xs px-2 py-3">No more tracks in the queue.</p>
              ) : (
                upNext.map((track, i) => (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => {
                      onSelectTrack(track);
                      setQueueOpen(false);
                    }}
                    className="audio-player-queue-row w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left"
                  >
                    <span className="audio-player-time text-[10px] font-mono w-4 shrink-0 text-center">
                      {i + 1}
                    </span>
                    <div className="audio-player-art w-9 h-9 rounded-md overflow-hidden shrink-0">
                      {track.thumbnailUrl ? (
                        <img src={track.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-violet-500/70 to-sky-600/60" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{trackLabel(track)}</p>
                      <p className="audio-player-time text-[10px] font-mono truncate">
                        {track.videoMeta ? formatTimecode(track.videoMeta.durationSeconds) : '—'}
                      </p>
                    </div>
                    <Play className="audio-player-queue-play w-3 h-3 shrink-0 opacity-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
