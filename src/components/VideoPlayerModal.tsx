import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { FileItem, VideoConvertOptions } from '../types';
import { formatTimecode } from '../utils/format';
import { PlayerHeader } from './video-player/PlayerHeader';
import { TrimPanel } from './video-player/TrimPanel';
import { ConvertPanel } from './video-player/ConvertPanel';

interface VideoPlayerModalProps {
  file: FileItem;
  isOpen: boolean;
  onClose: () => void;
  onSaveTrimmedVideo: (newFile: FileItem) => void;
  initialTab?: 'player' | 'trim' | 'convert';
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  file,
  isOpen,
  onClose,
  onSaveTrimmedVideo,
  initialTab = 'player',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Playback states
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(file.videoMeta?.durationSeconds || 15);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);

  // Active Tool Mode
  const [activeTab, setActiveTab] = useState<'player' | 'trim' | 'convert'>(initialTab);

  // Trimmer states
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(duration);
  const [isPlayingTrimLoop, setIsPlayingTrimLoop] = useState<boolean>(false);

  // Converter states
  const [convertOptions, setConvertOptions] = useState<VideoConvertOptions>({
    format: 'mp4',
    resolution: '1080p',
    quality: 'high',
    fps: 30,
    trimStart: 0,
    trimEnd: duration,
    includeAudio: true,
  });
  const [isTranscoding, setIsTranscoding] = useState<boolean>(false);
  const [transcodeProgress, setTranscodeProgress] = useState<number>(0);
  const [transcodeComplete, setTranscodeComplete] = useState<boolean>(false);
  const [transcodedResultUrl, setTranscodedResultUrl] = useState<string | null>(null);

  // Initialize durations and reset on file change
  useEffect(() => {
    if (!isOpen) return;
    setIsPlaying(false);
    setCurrentTime(0);
    setTranscodeComplete(false);
    setIsTranscoding(false);
    setTranscodeProgress(0);
    setTranscodedResultUrl(null);
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [file.id, isOpen, initialTab]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration || file.videoMeta?.durationSeconds || 15;
      setDuration(dur);
      setTrimStart(0);
      setTrimEnd(dur);
      setConvertOptions(prev => ({ ...prev, trimEnd: dur }));
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const curr = videoRef.current.currentTime;
      setCurrentTime(curr);

      // If trim loop is active, loop between start and end
      if (isPlayingTrimLoop) {
        if (curr >= trimEnd || curr < trimStart) {
          videoRef.current.currentTime = trimStart;
        }
      }
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      setIsPlayingTrimLoop(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const seek = (time: number) => {
    if (!videoRef.current) return;
    const bounded = Math.max(0, Math.min(duration, time));
    videoRef.current.currentTime = bounded;
    setCurrentTime(bounded);
  };

  const stepFrame = (frames: number) => {
    if (!videoRef.current) return;
    const fps = file.videoMeta?.framerate || 30;
    const newTime = videoRef.current.currentTime + frames * (1 / fps);
    seek(newTime);
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
      setIsMuted(newVol === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    videoRef.current.muted = nextMuted;
  };

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const playTrimLoop = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = trimStart;
    videoRef.current.play().catch(() => {});
    setIsPlaying(true);
    setIsPlayingTrimLoop(true);
  };

  // Perform Trim & Save to Cloud
  const handleSaveTrim = () => {
    const trimmedDuration = Math.max(0.1, trimEnd - trimStart);
    const newName = `${file.name.replace(/\.[^/.]+$/, '')}_trimmed_${Math.round(trimmedDuration)}s.mp4`;

    const trimmedFile: FileItem = {
      ...file,
      id: `file-trim-${Date.now()}`,
      name: newName,
      sizeBytes: Math.round(file.sizeBytes * (trimmedDuration / Math.max(duration, 1))),
      updatedAt: new Date().toISOString(),
      version: 1,
      videoMeta: {
        ...(file.videoMeta || {
          dimensions: { width: 1920, height: 1080 },
          framerate: 30,
          codec: 'H.264',
          bitrate: '30 Mbps',
          audioCodec: 'AAC',
        }),
        durationSeconds: parseFloat(trimmedDuration.toFixed(2)),
      },
    };

    onSaveTrimmedVideo(trimmedFile);
    onClose();
  };

  // Perform Transcode / Convert
  const startTranscode = () => {
    setIsTranscoding(true);
    setTranscodeProgress(5);
    setTranscodeComplete(false);

    let progress = 5;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 8;
      if (progress >= 100) {
        clearInterval(interval);
        setTranscodeProgress(100);
        setIsTranscoding(false);
        setTranscodeComplete(true);
        setTranscodedResultUrl(file.url);
      } else {
        setTranscodeProgress(progress);
      }
    }, 250);
  };

  const handleSaveConvertedToCloud = () => {
    const ext = convertOptions.format;
    const newName = `${file.name.replace(/\.[^/.]+$/, '')}_${convertOptions.resolution}.${ext}`;
    const convertedFile: FileItem = {
      ...file,
      id: `file-conv-${Date.now()}`,
      name: newName,
      mimeType: ext === 'gif' ? 'image/gif' : ext === 'mp3' ? 'audio/mpeg' : `video/${ext}`,
      category: ext === 'gif' ? 'photo' : ext === 'mp3' ? 'audio' : 'video',
      sizeBytes: Math.round(file.sizeBytes * (convertOptions.resolution === '4k' ? 1.6 : convertOptions.resolution === '720p' ? 0.5 : 0.8)),
      updatedAt: new Date().toISOString(),
      version: 1,
      videoMeta: ext === 'mp3' ? undefined : {
        ...(file.videoMeta || {
          dimensions: { width: 1920, height: 1080 },
          framerate: 30,
          codec: ext.toUpperCase(),
          bitrate: '15 Mbps',
          audioCodec: 'AAC',
        }),
        durationSeconds: duration,
      },
    };

    onSaveTrimmedVideo(convertedFile);
    onClose();
  };

  const handleDownloadConverted = () => {
    const ext = convertOptions.format;
    const link = document.createElement('a');
    link.href = file.url;
    link.download = `${file.name.replace(/\.[^/.]+$/, '')}_transcoded.${ext}`;
    link.click();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4">
      <div className="relative flex flex-col w-full h-[95vh] max-w-7xl bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
        
        {/* Header */}
        <PlayerHeader file={file} duration={duration} activeTab={activeTab} setActiveTab={setActiveTab} onClose={onClose} />

        {/* Video Viewport & Controls */}
        <div className="flex flex-1 overflow-hidden">
          
          <div className="flex-1 flex flex-col bg-neutral-950 relative">
            
            {/* Main Video Screen */}
            <div 
              onClick={togglePlay}
              className="flex-1 flex items-center justify-center p-2 relative cursor-pointer select-none group"
            >
              <video
                ref={videoRef}
                src={file.url}
                className="max-h-full max-w-full rounded object-contain shadow-2xl"
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => {
                  if (isLooping) {
                    seek(0);
                    videoRef.current?.play();
                  } else {
                    setIsPlaying(false);
                  }
                }}
                playsInline
              />

              {/* Center Play Overlay when paused */}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-all pointer-events-none">
                  <div className="w-16 h-16 rounded-full bg-cyan-500/90 text-neutral-950 flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-transform">
                    <Play className="w-8 h-8 ml-1" />
                  </div>
                </div>
              )}
            </div>

            {/* Custom Pro Timeline & Playback Bar */}
            <div className="px-5 py-3 border-t border-neutral-800/80 bg-neutral-900/95">
              
              {/* Timeline scrubber */}
              <div className="relative mb-3 flex items-center group">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.01}
                  value={currentTime}
                  onChange={e => seek(parseFloat(e.target.value))}
                  className="w-full custom-range cursor-pointer"
                />

                {/* Trim region highlight if active */}
                {activeTab === 'trim' && duration > 0 && (
                  <div 
                    className="absolute h-1.5 bg-cyan-400/50 rounded pointer-events-none top-1"
                    style={{
                      left: `${(trimStart / duration) * 100}%`,
                      width: `${((trimEnd - trimStart) / duration) * 100}%`,
                    }}
                  />
                )}
              </div>

              {/* Bottom control strip */}
              <div className="flex items-center justify-between text-xs text-neutral-300">
                <div className="flex items-center gap-3">
                  {/* Play/Pause */}
                  <button
                    onClick={togglePlay}
                    className="p-2 rounded-lg bg-cyan-400 text-neutral-950 hover:bg-cyan-300 transition-colors"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>

                  {/* Frame Steps */}
                  <div className="flex items-center gap-1 border-l border-neutral-800 pl-3">
                    <button
                      onClick={() => stepFrame(-1)}
                      className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-[11px] font-mono text-neutral-300"
                      title="Step back 1 frame"
                    >
                      -1f
                    </button>
                    <button
                      onClick={() => stepFrame(1)}
                      className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-[11px] font-mono text-neutral-300"
                      title="Step forward 1 frame"
                    >
                      +1f
                    </button>
                  </div>

                  {/* Timecode display */}
                  <div className="font-mono text-xs flex items-center gap-1.5 text-neutral-200">
                    <span className="text-cyan-400 font-semibold">{formatTimecode(currentTime, true)}</span>
                    <span className="text-neutral-600">/</span>
                    <span className="text-neutral-400">{formatTimecode(duration, true)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Playback Speed */}
                  <div className="flex items-center gap-1">
                    {[0.5, 1.0, 1.5, 2.0].map(speed => (
                      <button
                        key={speed}
                        onClick={() => changeSpeed(speed)}
                        className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                          playbackRate === speed
                            ? 'bg-neutral-700 text-cyan-300'
                            : 'text-neutral-500 hover:text-neutral-300'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>

                  {/* Volume Control */}
                  <div className="flex items-center gap-2 border-l border-neutral-800 pl-4">
                    <button onClick={toggleMute} className="text-neutral-400 hover:text-neutral-200">
                      {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={e => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-16 custom-range"
                    />
                  </div>

                  {/* Loop toggle */}
                  <button
                    onClick={() => setIsLooping(!isLooping)}
                    className={`p-1.5 rounded transition-colors ${
                      isLooping ? 'text-cyan-400 bg-neutral-800' : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                    title="Loop Playback"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>

          </div>

          {/* Right Tool Sidebar for Trim or Convert */}
          {(activeTab === 'trim' || activeTab === 'convert') && (
            <div className="w-80 md:w-96 flex flex-col border-l border-neutral-800 bg-neutral-900/95 overflow-y-auto p-5">
              
              {/* TRIM VIEW */}
              {activeTab === 'trim' && (
                <TrimPanel duration={duration} currentTime={currentTime} trimStart={trimStart} setTrimStart={setTrimStart} trimEnd={trimEnd} setTrimEnd={setTrimEnd} playTrimLoop={playTrimLoop} handleSaveTrim={handleSaveTrim} />
              )}

              {/* CONVERT VIEW */}
              {activeTab === 'convert' && (
                <ConvertPanel file={file} duration={duration} convertOptions={convertOptions} setConvertOptions={setConvertOptions} isTranscoding={isTranscoding} transcodeProgress={transcodeProgress} transcodeComplete={transcodeComplete} startTranscode={startTranscode} handleSaveConvertedToCloud={handleSaveConvertedToCloud} handleDownloadConverted={handleDownloadConverted} />
              )}

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
