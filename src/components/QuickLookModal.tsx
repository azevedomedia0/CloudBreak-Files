import React, { useEffect } from 'react';
import {
  X, Eye, Edit3, Scissors, Share2, Download, ShieldCheck, 
  Video, Image as ImageIcon, FileText, Lock, HardDrive, Maximize2
} from 'lucide-react';
import { FileItem, CloudAccount } from '../types';
import { formatBytes, formatDate, formatTimecode } from '../utils/format';
import { PhotoNav, PhotoNavArrows } from './PhotoNavArrows';

interface QuickLookModalProps {
  file: FileItem | null;
  accounts: CloudAccount[];
  isOpen: boolean;
  onClose: () => void;
  onEditPhoto: (file: FileItem) => void;
  onOpenVideo: (file: FileItem) => void;
  onShare: (file: FileItem) => void;
  photoNav?: PhotoNav | null;
}

export const QuickLookModal: React.FC<QuickLookModalProps> = ({
  file,
  accounts,
  isOpen,
  onClose,
  onEditPhoto,
  onOpenVideo,
  onShare,
  photoNav,
}) => {
  // Listen for Space or Escape to toggle / close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape' || e.code === 'Space') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' && photoNav?.hasPrev) {
        e.preventDefault();
        photoNav.onPrev();
      } else if (e.key === 'ArrowRight' && photoNav?.hasNext) {
        e.preventDefault();
        photoNav.onNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, photoNav]);

  if (!isOpen || !file) return null;

  const account = accounts.find(a => a.id === file.accountId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl p-4 animate-fadeIn">
      <div 
        className="relative flex flex-col w-full max-w-4xl max-h-[85vh] rounded-2xl overflow-hidden macos-window animate-scaleUp select-none"
        onClick={e => e.stopPropagation()}
      >
        {/* macOS Quick Look Header */}
        <div className="flex items-center justify-between px-4 py-2.5 macos-toolbar-glass">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={onClose}
                className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E] hover:opacity-80 transition-opacity flex items-center justify-center group"
                title="Close (Space)"
              >
                <X className="w-2 h-2 text-[#4A0002] opacity-0 group-hover:opacity-100" />
              </button>
              <div className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
              <div className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
            </div>

            <div className="flex items-center gap-2 pl-2">
              <span className="text-xs font-medium text-neutral-200 truncate max-w-sm">
                {file.name}
              </span>
              {file.encryption.isEncrypted && (
                <span className="flex items-center gap-1 text-[10px] text-cyan-300 bg-cyan-500/20 border border-cyan-400/30 px-1.5 py-0.5 rounded font-mono">
                  <ShieldCheck className="w-3 h-3" /> E2EE
                </span>
              )}
            </div>
          </div>

          {/* Quick Action Button in Titlebar */}
          <div className="flex items-center gap-2">
            {file.category === 'photo' && (
              <button
                onClick={() => {
                  onClose();
                  onEditPhoto(file);
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-neutral-950 font-semibold text-xs transition-colors shadow-sm"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Open in Studio</span>
              </button>
            )}

            {file.category === 'video' && (
              <button
                onClick={() => {
                  onClose();
                  onOpenVideo(file);
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-neutral-950 font-semibold text-xs transition-colors shadow-sm"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Open in Cinema Suite</span>
              </button>
            )}

            <button
              onClick={() => {
                onClose();
                onShare(file);
              }}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-neutral-300 transition-colors"
              title="Share Library"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Media Preview Screen */}
        <div className="flex-1 min-h-[420px] bg-black/40 flex items-center justify-center p-6 relative overflow-hidden">
          {file.category === 'photo' && photoNav && <PhotoNavArrows nav={photoNav} />}
          {file.category === 'photo' && (
            <img
              src={file.url}
              alt={file.name}
              className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-2xl"
            />
          )}

          {file.category === 'video' && (
            <video
              src={file.url}
              controls
              autoPlay
              className="max-h-[60vh] max-w-full rounded-lg shadow-2xl"
            />
          )}

          {file.category !== 'photo' && file.category !== 'video' && (
            <div className="flex flex-col items-center justify-center text-neutral-400 gap-3">
              <FileText className="w-16 h-16 text-cyan-400" />
              <div className="text-sm font-medium text-neutral-200">{file.name}</div>
              <div className="text-xs text-neutral-500 font-mono">SHA-256: {file.encryption.checksumSha256.slice(0, 24)}...</div>
            </div>
          )}
        </div>

        {/* Bottom macOS Metadata Footer */}
        <div className="px-5 py-3 macos-toolbar-glass flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-3">
            <span>{formatBytes(file.sizeBytes)}</span>
            <span>·</span>
            <span>{file.mimeType}</span>
            <span>·</span>
            <span>{account?.name}</span>
            {file.photoExif?.dimensions && (
              <>
                <span>·</span>
                <span className="font-mono">{file.photoExif.dimensions.width} × {file.photoExif.dimensions.height}</span>
              </>
            )}
            {file.videoMeta && (
              <>
                <span>·</span>
                <span className="font-mono">{formatTimecode(file.videoMeta.durationSeconds)} · {file.videoMeta.framerate} fps</span>
              </>
            )}
          </div>

          <div className="text-[11px] text-neutral-400 flex items-center gap-1.5 font-mono">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-neutral-300 text-[10px]">Space</kbd>
            <span>to close</span>
          </div>
        </div>
      </div>
    </div>
  );
};
