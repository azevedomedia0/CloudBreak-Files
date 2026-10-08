import React, { useState, useRef, useEffect } from 'react';
import {
  Image as ImageIcon, Video, FileText, Lock, 
  Unlock, Download, Trash2, Edit3, Scissors, Archive,
  Share2, Info, HardDrive, Sparkles, Key,
  ChevronDown, ChevronUp, ChevronRight, Minimize2, Maximize2,
  PanelRightClose, PanelRight, Play, Pause, RotateCcw, Volume2, VolumeX,
  Copy, ClipboardPaste, Pencil, FolderInput, FileArchive, FolderPlus,
} from 'lucide-react';
import { FileItem, CloudAccount, FolderItem } from '../types';
import { isEditableDocument } from '../utils/documentKind';
import { formatBytes, formatDate, formatTimecode } from '../utils/format';
import { isZipArchive } from '../utils/unzipArchive';
import { DocumentPreview } from './document-editor/DocumentPreview';
import { emitFileContextMenu } from '../utils/fileContextMenuBus';

import { PhotoNav, PhotoNavArrows } from './PhotoNavArrows';

interface FileInspectorProps {
  file: FileItem | null;
  accounts: CloudAccount[];
  folders?: FolderItem[];
  isOpen: boolean;
  onEditPhoto: (file: FileItem) => void;
  onOpenDocument: (file: FileItem) => void;
  onOpenVideo: (file: FileItem, tab?: 'player' | 'trim' | 'convert') => void;
  onShare: (file: FileItem) => void;
  onToggleEncrypt: (file: FileItem) => void;
  onDeleteFile: (fileId: string) => void;
  onUnzipFile?: (file: FileItem) => void;
  onCopyFile?: (file: FileItem) => void;
  onPasteFiles?: () => void;
  onRenameFile?: (fileId: string, name: string) => void;
  onMoveFile?: (fileId: string, folder: FolderItem) => void;
  onCompressFile?: (file: FileItem) => void;
  onNewFolder?: () => void;
  canPaste?: boolean;
  width?: number;
  photoNav?: PhotoNav | null;
}

export const FileInspector: React.FC<FileInspectorProps> = ({
  file,
  accounts,
  folders = [],
  isOpen,
  onEditPhoto,
  onOpenDocument,
  onOpenVideo,
  onShare,
  onToggleEncrypt,
  onDeleteFile,
  onUnzipFile,
  onCopyFile,
  onPasteFiles,
  onRenameFile,
  onMoveFile,
  onCompressFile,
  onNewFolder,
  canPaste = false,
  width = 320,
  photoNav,
}) => {
  const [isBodyCollapsed, setIsBodyCollapsed] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(file?.videoMeta?.durationSeconds || 15);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [movePickerOpen, setMovePickerOpen] = useState(false);

  useEffect(() => {
    setMovePickerOpen(false);
  }, [file?.id]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (file?.videoMeta?.durationSeconds) {
      setDuration(file.videoMeta.durationSeconds);
    }
  }, [file?.id]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration || file?.videoMeta?.durationSeconds || 15;
      setDuration(dur);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSkip = (seconds: number) => {
    if (videoRef.current) {
      const target = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
      videoRef.current.currentTime = target;
      setCurrentTime(target);
    }
  };

  const [collapsedSections, setCollapsedSections] = useState<{
    preview?: boolean;
    general?: boolean;
    actions?: boolean;
    specs?: boolean;
  }>({});

  const toggleSection = (section: 'preview' | 'general' | 'actions' | 'specs') => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  if (!isOpen || !file) return null;

  const account = accounts.find(a => a.id === file.accountId);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.name;
    link.click();
  };

  return (
    <div 
      style={{ width: `${width}px` }}
      className="macos-sidebar-glass border-l border-white/8 flex flex-col h-full overflow-y-auto select-none shrink-0 transition-all duration-300"
    >
      
      {/* Inspector Header */}
      <div className="flex items-center px-3.5 py-2.5 macos-toolbar-glass border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-semibold text-neutral-200">File Inspector</span>
        </div>
      </div>

      {/* Inspector Body (Collapsible) */}
      {isBodyCollapsed ? (
        <div 
          onClick={() => setIsBodyCollapsed(false)}
          className="p-4 flex flex-col items-center justify-center text-center gap-3 cursor-pointer hover:bg-white/5 transition-colors flex-1"
          title="Click to expand inspector details"
        >
          <div className={`p-3 rounded-2xl shadow-sm border ${
            isZipArchive(file)
              ? 'bg-pink-500/10 border-pink-400/25 text-pink-300'
              : 'bg-sky-500/10 border-sky-400/20 text-sky-300'
          }`}>
            {file.category === 'photo' && <ImageIcon className="w-6 h-6" />}
            {file.category === 'video' && <Video className="w-6 h-6" />}
            {isZipArchive(file) && <Archive className="w-6 h-6" />}
            {file.category !== 'photo' && file.category !== 'video' && !isZipArchive(file) && <FileText className="w-6 h-6" />}
          </div>
          <div className="max-w-[200px]">
            <p className="text-xs font-semibold text-neutral-200 truncate">{file.name}</p>
            <p className="text-[11px] text-neutral-400">{formatBytes(file.sizeBytes)}</p>
          </div>
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsBodyCollapsed(false);
            }}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/30 transition-all flex items-center gap-1.5"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            <span>Expand Details</span>
          </button>
        </div>
      ) : (
      <div className="p-4 space-y-4 flex-1">
        
        {/* Preview Container Section */}
        <div className="space-y-2">
          <div 
            onClick={() => toggleSection('preview')}
            className="flex items-center justify-between text-[10px] font-semibold tracking-wider uppercase text-neutral-400 cursor-pointer hover:text-neutral-200 transition-colors group select-none"
          >
            <div className="flex items-center gap-1.5">
              <span>Preview</span>
              <ChevronDown className={`w-3 h-3 text-neutral-500 group-hover:text-neutral-300 transition-transform duration-200 ${collapsedSections.preview ? '-rotate-90' : ''}`} />
            </div>
          </div>

          {!collapsedSections.preview && (
            <div
              className="aspect-video rounded-xl overflow-hidden bg-black/50 border border-white/10 relative shadow-lg"
              onContextMenu={event => {
                event.preventDefault();
                emitFileContextMenu(file, event.clientX, event.clientY);
              }}
            >
              {file.category === 'photo' && (
                <img
                  src={file.url}
                  alt={file.name}
                  className="w-full h-full object-cover"
                  onContextMenu={event => {
                    event.preventDefault();
                    emitFileContextMenu(file, event.clientX, event.clientY);
                  }}
                />
              )}
              {file.category === 'photo' && photoNav && <PhotoNavArrows nav={photoNav} compact />}

              {file.category === 'video' && (
                <div className="w-full h-full relative group/player bg-black flex flex-col justify-between overflow-hidden">
                  <video
                    ref={videoRef}
                    src={file.url}
                    poster={file.thumbnailUrl}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={() => setIsPlaying(false)}
                    onClick={togglePlay}
                    className="w-full h-full object-contain cursor-pointer"
                    playsInline
                    onContextMenu={event => {
                      event.preventDefault();
                      emitFileContextMenu(file, event.clientX, event.clientY);
                    }}
                  />

                  {/* Center Play Button Overlay (when paused) */}
                  {!isPlaying && (
                    <div 
                      onClick={togglePlay}
                      className="absolute inset-0 bg-black/40 flex items-center justify-center cursor-pointer transition-opacity"
                    >
                      <button 
                        type="button"
                        className="p-3 rounded-full bg-cyan-400 hover:bg-cyan-300 text-neutral-950 shadow-lg shadow-cyan-500/25 transition-transform hover:scale-105"
                        title="Play Video"
                      >
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </button>
                    </div>
                  )}

                  {/* Bottom macOS Glass Playback Controls Bar */}
                  <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col gap-1 transition-opacity opacity-90 group-hover/player:opacity-100">
                    {/* Scrubber Range */}
                    <div className="w-full flex items-center gap-1.5">
                      <input
                        type="range"
                        min={0}
                        max={duration || file.videoMeta?.durationSeconds || 15}
                        step={0.1}
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-1 bg-white/20 accent-white rounded-lg cursor-pointer hover:h-1.5 transition-all"
                        title="Seek"
                      />
                    </div>

                    {/* Controls Row: Play/Pause, Skip, Timecode, Volume, Fullscreen */}
                    <div className="flex items-center justify-between text-[#ffffff] text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={togglePlay}
                          className="p-1 rounded hover:bg-white/10 text-[#ffffff] transition-colors"
                          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                        >
                          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSkip(-5)}
                          className="p-1 rounded hover:bg-white/10 text-[#ffffff] transition-colors"
                          title="Rewind 5s"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>

                        <span className="font-mono text-[9px] text-[#ffffff] tracking-tight pl-0.5">
                          {formatTimecode(currentTime)} / {formatTimecode(duration || file.videoMeta?.durationSeconds || 15)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={toggleMute}
                          className="p-1 rounded hover:bg-white/10 text-[#ffffff] transition-colors"
                          title={isMuted ? "Unmute" : "Mute"}
                        >
                          {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => onOpenVideo(file)}
                          className="p-1 rounded hover:bg-white/10 text-[#ffffff] transition-colors"
                          title="Open Cinema Suite"
                        >
                          <Maximize2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {file.category !== 'photo' && file.category !== 'video' && (
                <DocumentPreview file={file} />
              )}

            </div>
          )}
        </div>

        {/* Title & Storage Node Section */}
        <div className="space-y-2">
          <div 
            onClick={() => toggleSection('general')}
            className="flex items-center justify-between text-[10px] font-semibold tracking-wider uppercase text-neutral-400 cursor-pointer hover:text-neutral-200 transition-colors group select-none"
          >
            <div className="flex items-center gap-1.5">
              <span>General Info</span>
              <ChevronDown className={`w-3 h-3 text-neutral-500 group-hover:text-neutral-300 transition-transform duration-200 ${collapsedSections.general ? '-rotate-90' : ''}`} />
            </div>
            <span className="text-[10px] font-mono text-neutral-500">{formatBytes(file.sizeBytes)}</span>
          </div>

          {!collapsedSections.general && (
            <div className="space-y-2 bg-black/25 p-2.5 rounded-xl border border-white/5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-neutral-100 break-words leading-tight">
                  {file.name}
                </h3>
              </div>

              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-neutral-300 font-medium">{account?.name || 'Cloud Bucket'}</span>
                <span className="text-neutral-600">·</span>
                <span className="font-mono text-[11px] text-neutral-400">{file.folderPath}</span>
              </div>
            </div>
          )}
        </div>

        {/* Primary Action Buttons Section */}
        <div className="space-y-2">
          <div 
            onClick={() => toggleSection('actions')}
            className="flex items-center justify-between text-[10px] font-semibold tracking-wider uppercase text-neutral-400 cursor-pointer hover:text-neutral-200 transition-colors group select-none"
          >
            <div className="flex items-center gap-1.5">
              <span>Quick Actions</span>
              <ChevronDown className={`w-3 h-3 text-neutral-500 group-hover:text-neutral-300 transition-transform duration-200 ${collapsedSections.actions ? '-rotate-90' : ''}`} />
            </div>
          </div>

          {!collapsedSections.actions && (
            <div className="grid grid-cols-4 gap-2">
              {file.category === 'video' ? (
                <button
                  type="button"
                  onClick={() => onOpenVideo(file, 'trim')}
                  className="col-span-2 h-9 rounded-lg bg-amber-800/15 hover:bg-amber-800/25 border border-amber-700/30 text-amber-600 flex items-center justify-center gap-1.5 text-xs font-medium transition-all shadow-xs cursor-pointer"
                  title="Edit Video"
                  aria-label="Edit Video"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>Edit Video</span>
                </button>
              ) : file.category === 'photo' ? (
                <button
                  type="button"
                  onClick={() => onEditPhoto(file)}
                  className="col-span-2 h-9 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-cyan-300 flex items-center justify-center gap-1.5 text-xs font-medium transition-all shadow-xs cursor-pointer"
                  title="Edit Photo"
                  aria-label="Edit Photo"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Photo</span>
                </button>
              ) : isZipArchive(file) && onUnzipFile ? (
                <button
                  type="button"
                  onClick={() => onUnzipFile(file)}
                  className="col-span-2 h-9 rounded-lg bg-pink-500/15 hover:bg-pink-500/25 border border-pink-400/30 text-pink-300 flex items-center justify-center gap-1.5 text-xs font-medium transition-all shadow-xs cursor-pointer"
                  title="Unzip archive"
                  aria-label="Unzip archive"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Unzip</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (isEditableDocument(file)) onOpenDocument(file);
                    else onEditPhoto(file);
                  }}
                  className="col-span-2 h-9 rounded-lg bg-[#c45c26]/18 hover:bg-[#c45c26]/28 border border-[#e07a45]/40 text-[#e8a070] flex items-center justify-center gap-1.5 text-xs font-medium transition-all shadow-xs cursor-pointer"
                  title={isEditableDocument(file) ? 'Edit document' : 'Open'}
                  aria-label={isEditableDocument(file) ? 'Edit document' : 'Open'}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditableDocument(file) ? 'Edit Document' : 'Open'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDownload}
                className="h-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-neutral-300 hover:text-white flex items-center justify-center transition-all shadow-xs cursor-pointer"
                title="Download to Local Disk"
                aria-label="Download"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onShare(file)}
                className="h-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-sky-400/30 text-neutral-300 hover:text-sky-300 flex items-center justify-center transition-all shadow-xs cursor-pointer"
                title="Share Library / Asset"
                aria-label="Share Library"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* File management actions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider uppercase text-neutral-400 select-none">
            <span>Organize</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onNewFolder?.()}
              disabled={!onNewFolder}
              className="h-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-400/30 text-neutral-200 hover:text-cyan-200 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title="New Folder"
              aria-label="New Folder"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onCopyFile?.(file)}
              disabled={!onCopyFile}
              className="h-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-sky-400/30 text-neutral-200 hover:text-sky-200 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title="Copy"
              aria-label="Copy"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onPasteFiles?.()}
              disabled={!onPasteFiles || !canPaste}
              className="h-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-sky-400/30 text-neutral-200 hover:text-sky-200 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title={canPaste ? 'Paste' : 'Copy a file first'}
              aria-label="Paste"
            >
              <ClipboardPaste className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!onRenameFile) return;
                const next = window.prompt('Rename file', file.name);
                if (next && next.trim() && next.trim() !== file.name) {
                  onRenameFile(file.id, next.trim());
                }
              }}
              disabled={!onRenameFile}
              className="h-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-400/30 text-neutral-200 hover:text-amber-200 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title="Rename"
              aria-label="Rename"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMovePickerOpen(open => !open)}
                disabled={!onMoveFile || folders.length === 0}
                className="w-full h-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-violet-400/30 text-neutral-200 hover:text-violet-200 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                title="Move to…"
                aria-label="Move to…"
                aria-expanded={movePickerOpen}
              >
                <FolderInput className="w-4 h-4" />
              </button>
              {movePickerOpen && onMoveFile && (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 max-h-48 overflow-y-auto rounded-xl border border-white/12 bg-neutral-950/95 shadow-xl backdrop-blur-xl py-1">
                  {folders.map(folder => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => {
                        onMoveFile(file.id, folder);
                        setMovePickerOpen(false);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs text-neutral-200 hover:bg-white/10 truncate"
                    >
                      {folder.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onCompressFile?.(file)}
              disabled={!onCompressFile || isZipArchive(file)}
              className="h-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-400/30 text-neutral-200 hover:text-emerald-200 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title={isZipArchive(file) ? 'Already an archive' : 'Compress'}
              aria-label="Compress"
            >
              <FileArchive className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Technical EXIF or Video Info Section */}
        {file.photoExif && (
          <div className="space-y-2">
            <div 
              onClick={() => toggleSection('specs')}
              className="flex items-center justify-between text-[10px] font-semibold tracking-wider uppercase text-neutral-400 cursor-pointer hover:text-neutral-200 transition-colors group select-none"
            >
              <div className="flex items-center gap-1.5">
                <span>Camera Specifications</span>
                <ChevronDown className={`w-3 h-3 text-neutral-500 group-hover:text-neutral-300 transition-transform duration-200 ${collapsedSections.specs ? '-rotate-90' : ''}`} />
              </div>
            </div>

            {!collapsedSections.specs && (
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <div className="p-2 bg-black/30 rounded-lg border border-white/5">
                  <span className="text-neutral-500 text-[9px] block">Sensor / Camera</span>
                  <span className="text-neutral-200 text-[11px] truncate block">{file.photoExif.camera || 'RAW'}</span>
                </div>
                <div className="p-2 bg-black/30 rounded-lg border border-white/5">
                  <span className="text-neutral-500 text-[9px] block">Aperture</span>
                  <span className="text-neutral-200 text-[11px]">{file.photoExif.aperture || 'f/2.8'}</span>
                </div>
                <div className="p-2 bg-black/30 rounded-lg border border-white/5">
                  <span className="text-neutral-500 text-[9px] block">Shutter</span>
                  <span className="text-neutral-200 text-[11px]">{file.photoExif.shutterSpeed || '1/250s'}</span>
                </div>
                <div className="p-2 bg-black/30 rounded-lg border border-white/5">
                  <span className="text-neutral-500 text-[9px] block">ISO</span>
                  <span className="text-neutral-200 text-[11px]">{file.photoExif.iso || '100'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {file.videoMeta && (
          <div className="space-y-2">
            <div 
              onClick={() => toggleSection('specs')}
              className="flex items-center justify-between text-[10px] font-semibold tracking-wider uppercase text-neutral-400 cursor-pointer hover:text-neutral-200 transition-colors group select-none"
            >
              <div className="flex items-center gap-1.5">
                <span>Video Stream Specs</span>
                <ChevronDown className={`w-3 h-3 text-neutral-500 group-hover:text-neutral-300 transition-transform duration-200 ${collapsedSections.specs ? '-rotate-90' : ''}`} />
              </div>
            </div>

            {!collapsedSections.specs && (
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <div className="p-2 bg-black/30 rounded-lg border border-white/5">
                  <span className="text-neutral-500 text-[9px] block">Length</span>
                  <span className="text-neutral-200 font-mono text-[11px]">{formatTimecode(file.videoMeta.durationSeconds)}</span>
                </div>
                <div className="p-2 bg-black/30 rounded-lg border border-white/5">
                  <span className="text-neutral-500 text-[9px] block">Frame Rate</span>
                  <span className="text-neutral-200 text-[11px]">{file.videoMeta.framerate} fps</span>
                </div>
                <div className="p-2 bg-black/30 rounded-lg border border-white/5">
                  <span className="text-neutral-500 text-[9px] block">Codec</span>
                  <span className="text-neutral-200 text-[11px]">{file.videoMeta.codec}</span>
                </div>
                <div className="p-2 bg-black/30 rounded-lg border border-white/5">
                  <span className="text-neutral-500 text-[9px] block">Bitrate</span>
                  <span className="text-neutral-200 text-[11px]">{file.videoMeta.bitrate}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Delete File */}
        <div className="pt-2">
          <button
            onClick={() => onDeleteFile(file.id)}
            className="w-full h-9 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-400/30 text-red-300 flex items-center justify-center gap-1.5 text-xs font-medium transition-all shadow-xs cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Move to Trash</span>
          </button>
        </div>

      </div>
      )}
    </div>
  );
};
