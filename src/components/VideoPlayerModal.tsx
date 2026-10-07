import React, { useState, useRef, useEffect } from 'react';
import { Play } from 'lucide-react';
import { FileItem, VideoConvertOptions, CloudAccount, FolderItem } from '../types';
import { PlayerHeader } from './video-player/PlayerHeader';
import { TrimPanel } from './video-player/TrimPanel';
import { ConvertPanel, SaveDestination } from './video-player/ConvertPanel';
import { PlaybackControls } from './video-player/PlaybackControls';

interface LocalDirectoryHandle {
  name: string;
  getFileHandle: (name: string, opts: { create: boolean }) => Promise<{
    createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
  }>;
}

interface VideoPlayerModalProps {
  file: FileItem;
  isOpen: boolean;
  onClose: () => void;
  onSaveTrimmedVideo: (newFile: FileItem) => void;
  initialTab?: 'player' | 'trim' | 'convert';
  accounts: CloudAccount[];
  folders: FolderItem[];
  canPreviousMedia?: boolean;
  canNextMedia?: boolean;
  onPreviousMedia?: () => void;
  onNextMedia?: () => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  file,
  isOpen,
  onClose,
  onSaveTrimmedVideo,
  initialTab = 'player',
  accounts,
  folders,
  canPreviousMedia = false,
  canNextMedia = false,
  onPreviousMedia,
  onNextMedia,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Playback states
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(file.videoMeta?.durationSeconds || 15);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const [playError, setPlayError] = useState<string | null>(null);

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
  const [destination, setDestination] = useState<SaveDestination>(() => {
    const sourceAccount = accounts.find(a => a.id === file.accountId) ?? accounts[0];
    return sourceAccount
      ? { kind: 'cloud', accountId: sourceAccount.id, folderId: null }
      : { kind: 'computer', accountId: 'all', folderId: null };
  });
  const [customBaseName, setCustomBaseName] = useState<string>('');
  const [savedLocalName, setSavedLocalName] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [localFolder, setLocalFolder] = useState<{ name: string; handle: LocalDirectoryHandle } | null>(null);

  // Initialize durations and reset on file change
  useEffect(() => {
    if (!isOpen) return;
    setIsPlaying(false);
    setPlayError(null);
    setCurrentTime(0);
    setTranscodeComplete(false);
    setIsTranscoding(false);
    setTranscodeProgress(0);
    setTranscodedResultUrl(null);
    setCustomBaseName('');
    setSavedLocalName(null);
    setSaveError(null);
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [file.id, isOpen, initialTab]);

  useEffect(() => {
    setConvertOptions(prev => ({ ...prev, trimStart, trimEnd }));
  }, [trimStart, trimEnd]);

  useEffect(() => {
    setTranscodeComplete(false);
    setSavedLocalName(null);
    setSaveError(null);
  }, [convertOptions.format, convertOptions.resolution, convertOptions.quality, trimStart, trimEnd]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const raw = videoRef.current.duration;
      const dur = Number.isFinite(raw) && raw > 0 ? raw : file.videoMeta?.durationSeconds || 15;
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

  const startPlayback = () => {
    videoRef.current?.play().catch(err => {
      if (err?.name !== 'AbortError') {
        setPlayError("This video couldn't be played. Its format may not be supported yet.");
      }
    });
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      startPlayback();
    } else {
      videoRef.current.pause();
      setIsPlayingTrimLoop(false);
    }
  };

  const seek = (time: number) => {
    if (!videoRef.current) return;
    const bounded = Math.max(0, Math.min(duration, time));
    videoRef.current.currentTime = bounded;
    setCurrentTime(bounded);
  };

  const revealControls = () => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 2500);
  };

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

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
    startPlayback();
    setIsPlayingTrimLoop(true);
  };

  const continueToConvert = () => {
    videoRef.current?.pause();
    setIsPlayingTrimLoop(false);
    setActiveTab('convert');
  };

  const isTrimmed = trimStart > 0.001 || trimEnd < duration - 0.001;
  const clipLength = Math.max(0.1, trimEnd - trimStart);
  const sourceBaseName = file.name.replace(/\.[^/.]+$/, '');
  const defaultBaseName = `${sourceBaseName}${isTrimmed ? '_clip' : ''}${convertOptions.format === 'mp3' ? '' : `_${convertOptions.resolution}`}`;
  const outputName = `${customBaseName.trim() || defaultBaseName}.${convertOptions.format}`;

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
    const folder = folders.find(f => f.id === destination.folderId);
    const resolutionScale = convertOptions.resolution === '4k' ? 1.6 : convertOptions.resolution === '720p' ? 0.5 : 0.8;
    const convertedFile: FileItem = {
      ...file,
      id: `file-conv-${Date.now()}`,
      name: outputName,
      accountId: destination.accountId,
      folderId: folder?.id,
      folderPath: folder ? `/${folder.name}` : '/',
      mimeType: ext === 'gif' ? 'image/gif' : ext === 'mp3' ? 'audio/mpeg' : `video/${ext}`,
      category: ext === 'gif' ? 'photo' : ext === 'mp3' ? 'audio' : 'video',
      sizeBytes: Math.round(file.sizeBytes * resolutionScale * (clipLength / Math.max(duration, 1))),
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
        durationSeconds: parseFloat(clipLength.toFixed(2)),
      },
    };

    onSaveTrimmedVideo(convertedFile);
    onClose();
  };

  const browseLocalFolder = async () => {
    setSaveError(null);
    const showDirectoryPicker = (window as unknown as {
      showDirectoryPicker?: (opts: { mode: 'readwrite' }) => Promise<LocalDirectoryHandle>;
    }).showDirectoryPicker;

    if (!showDirectoryPicker) {
      setSaveError("Folder picking isn't available here. You'll choose a location when you save.");
      return;
    }
    try {
      const handle = await showDirectoryPicker({ mode: 'readwrite' });
      setLocalFolder({ name: handle.name, handle });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setSaveError("Couldn't open that folder. Try another one.");
    }
  };

  const handleSaveToComputer = async () => {
    setSaveError(null);
    try {
      if (localFolder) {
        const blob = await (await fetch(file.url)).blob();
        const fileHandle = await localFolder.handle.getFileHandle(outputName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        setSavedLocalName(`${localFolder.name}/${outputName}`);
        return;
      }

      const showSaveFilePicker = (window as unknown as {
        showSaveFilePicker?: (opts: { suggestedName: string }) => Promise<{ name: string; createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;
      }).showSaveFilePicker;

      if (showSaveFilePicker) {
        const handle = await showSaveFilePicker({ suggestedName: outputName });
        const blob = await (await fetch(file.url)).blob();
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        setSavedLocalName(handle.name);
      } else {
        const link = document.createElement('a');
        link.href = file.url;
        link.download = outputName;
        link.click();
        setSavedLocalName(outputName);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setSaveError("Couldn't save the file. Try again or pick another location.");
    }
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
              onMouseMove={revealControls}
              onMouseLeave={() => isPlaying && setControlsVisible(false)}
              className="flex-1 flex items-center justify-center p-2 relative cursor-pointer select-none group overflow-hidden"
            >
              <video
                ref={videoRef}
                src={file.url}
                className="max-h-full max-w-full rounded object-contain shadow-2xl"
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={() => setPlayError("This video couldn't be loaded. Its format may not be supported yet.")}
                onEnded={() => {
                  if (isLooping) {
                    seek(0);
                    startPlayback();
                  } else {
                    setIsPlaying(false);
                  }
                }}
                playsInline
              />

              {playError && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="max-w-sm text-center px-5 py-4 rounded-xl bg-neutral-900/85 border border-white/10 text-sm text-neutral-200">
                    {playError}
                  </div>
                </div>
              )}

              {/* Center Play Overlay when paused */}
              {!isPlaying && !playError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-all pointer-events-none">
                  <div className="w-16 h-16 rounded-full bg-neutral-900/60 backdrop-blur-md border border-white/15 text-white flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-transform">
                    <Play className="w-8 h-8 ml-1" />
                  </div>
                </div>
              )}

              {activeTab === 'player' ? (
                <PlaybackControls
                  visible={controlsVisible || !isPlaying}
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                  duration={duration}
                  volume={volume}
                  isMuted={isMuted}
                  isLooping={isLooping}
                  playbackRate={playbackRate}
                  onTogglePlay={togglePlay}
                  onSeek={seek}
                  onSkip={seconds => seek((videoRef.current?.currentTime ?? currentTime) + seconds)}
                  onStepFrame={stepFrame}
                  onVolumeChange={handleVolumeChange}
                  onToggleMute={toggleMute}
                  onToggleLoop={() => setIsLooping(l => !l)}
                  onChangeSpeed={changeSpeed}
                  onPreviousMedia={onPreviousMedia}
                  onNextMedia={onNextMedia}
                  canPreviousMedia={canPreviousMedia}
                  canNextMedia={canNextMedia}
                />
              ) : (
                <TrimPanel
                  duration={duration}
                  currentTime={currentTime}
                  fps={file.videoMeta?.framerate || 30}
                  isPlaying={isPlaying}
                  onTogglePlay={togglePlay}
                  onSeek={seek}
                  trimStart={trimStart}
                  setTrimStart={setTrimStart}
                  trimEnd={trimEnd}
                  setTrimEnd={setTrimEnd}
                  playTrimLoop={playTrimLoop}
                  onContinue={activeTab === 'trim' ? continueToConvert : undefined}
                />
              )}
            </div>

          </div>

          {/* Right Tool Sidebar for Convert */}
          {activeTab === 'convert' && (
            <div className="w-80 md:w-96 flex flex-col border-l border-neutral-800 bg-neutral-900/95 overflow-y-auto p-5">
              <ConvertPanel
                file={file}
                duration={duration}
                convertOptions={convertOptions}
                setConvertOptions={setConvertOptions}
                isTranscoding={isTranscoding}
                transcodeProgress={transcodeProgress}
                transcodeComplete={transcodeComplete}
                startTranscode={startTranscode}
                accounts={accounts}
                folders={folders}
                destination={destination}
                setDestination={setDestination}
                baseName={customBaseName}
                defaultBaseName={defaultBaseName}
                setBaseName={setCustomBaseName}
                isTrimmed={isTrimmed}
                onEditTrim={() => setActiveTab('trim')}
                savedLocalName={savedLocalName}
                saveError={saveError}
                localFolderName={localFolder?.name ?? null}
                onBrowseLocal={browseLocalFolder}
                handleSaveConvertedToCloud={handleSaveConvertedToCloud}
                handleSaveToComputer={handleSaveToComputer}
              />
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
