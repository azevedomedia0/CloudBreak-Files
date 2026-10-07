import React from 'react';
import { ShieldCheck, Edit3, Scissors, Play, CheckSquare, Square } from 'lucide-react';
import { FileItem } from '../../types';
import { FileThumbnail } from './FileThumbnail';
import { formatBytes, formatTimecode } from '../../utils/format';

export interface IconsViewProps {
  files: FileItem[];
  selectedFileId: string | null;
  selectedIds: Set<string>;
  iconScale: number;
  onSelectFile: (file: FileItem) => void;
  onEditPhoto: (file: FileItem) => void;
  onOpenVideo: (file: FileItem) => void;
  onOpenQuickLook: () => void;
  toggleSelectOne: (id: string, e: React.MouseEvent) => void;
}

export const IconsView: React.FC<IconsViewProps> = ({ files, selectedFileId, selectedIds, iconScale, onSelectFile, onEditPhoto, onOpenVideo, onOpenQuickLook, toggleSelectOne }) => (
    <div 
      className="grid gap-4"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(200 * (iconScale / 100))}px, 1fr))`,
      }}
    >
      {files.map(file => {
        const isSelected = selectedIds.has(file.id);
        const isCurrent = selectedFileId === file.id;

        return (
          <div
            key={file.id}
            onClick={() => onSelectFile(file)}
            onDoubleClick={() => {
              if (file.category === 'photo') onEditPhoto(file);
              else if (file.category === 'video') onOpenVideo(file);
              else onOpenQuickLook();
            }}
            className={`group relative rounded-xl p-2 transition-all cursor-pointer ${
              isCurrent
                ? 'bg-sky-500/25 ring-1 ring-sky-400/60 shadow-lg shadow-sky-950/50'
                : isSelected
                ? 'bg-sky-500/15 ring-1 ring-sky-500/30'
                : 'hover:bg-white/5'
            }`}
          >
            {/* Thumbnail / Glass Card */}
            <div className="aspect-[4/3] rounded-lg overflow-hidden relative bg-black/40 border border-white/8 group-hover:border-white/15 transition-all shadow-md">
              <FileThumbnail file={file} hoverZoom />

              {/* Checkbox */}
              <button
                onClick={e => toggleSelectOne(file.id, e)}
                className={`absolute top-2 left-2 p-1 rounded backdrop-blur-md transition-opacity ${
                  isSelected ? 'text-sky-300 bg-black/70 opacity-100' : 'text-neutral-400 bg-black/50 opacity-0 group-hover:opacity-100'
                }`}
              >
                {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              </button>

              {/* E2EE Lock */}
              {file.encryption.isEncrypted && (
                <div className="absolute top-2 right-2 flex items-center gap-1 text-[9px] text-cyan-300 bg-black/75 border border-cyan-500/30 px-1.5 py-0.5 rounded backdrop-blur-md font-mono">
                  <ShieldCheck className="w-2.5 h-2.5 text-cyan-400" />
                  <span>AES</span>
                </div>
              )}

              {/* Video Duration */}
              {file.videoMeta && (
                <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-mono text-white bg-black/80 px-1.5 py-0.5 rounded backdrop-blur-sm">
                  <Play className="w-2.5 h-2.5 fill-current" />
                  <span>{formatTimecode(file.videoMeta.durationSeconds)}</span>
                </div>
              )}

              {/* Quick Action Floating Pill */}
              <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {file.category === 'photo' && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onEditPhoto(file);
                    }}
                    className="p-1 rounded-md bg-cyan-400 hover:bg-cyan-300 text-neutral-950 shadow-md font-bold"
                    title="Open Photo Studio"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                )}
                {file.category === 'video' && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onOpenVideo(file);
                    }}
                    className="p-1 rounded-md bg-amber-400 hover:bg-amber-300 text-neutral-950 shadow-md font-bold"
                    title="Open Cinema Suite"
                  >
                    <Scissors className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Title & Metadata */}
            <div className="pt-2 px-1 text-center">
              <p className="text-xs font-medium text-neutral-200 truncate group-hover:text-white">
                {file.name}
              </p>
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-neutral-400 mt-0.5 font-mono">
                <span>{formatBytes(file.sizeBytes)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
);
