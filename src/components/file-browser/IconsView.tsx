import React from 'react';
import { Edit3, Scissors, Play, CheckSquare, Square, Music2 } from 'lucide-react';
import { FileItem, FolderItem } from '../../types';
import { isEditableDocument } from '../../utils/documentKind';
import { FileThumbnail } from './FileThumbnail';
import { FolderTile } from './FolderTile';
import { SelectionAccent, SELECTION_CLASSES } from '../../utils/selectionAccent';
import { formatBytes, formatTimecode } from '../../utils/format';
import { setFileDragData } from '../../utils/fileDrag';

export interface IconsViewProps {
  accent: SelectionAccent;
  files: FileItem[];
  folders?: FolderItem[];
  selectedFileId: string | null;
  selectedIds: Set<string>;
  iconScale: number;
  onSelectFile: (file: FileItem) => void;
  onOpenFolder?: (folderId: string) => void;
  onEditPhoto: (file: FileItem) => void;
  onOpenDocument: (file: FileItem) => void;
  onOpenVideo: (file: FileItem) => void;
  onOpenAudio: (file: FileItem) => void;
  onOpenQuickLook: () => void;
  onFileContextMenu: (file: FileItem, event: React.MouseEvent) => void;
  toggleSelectOne: (id: string, e: React.MouseEvent) => void;
}

export const IconsView: React.FC<IconsViewProps> = ({
  accent, files, folders = [], selectedFileId, selectedIds, iconScale,
  onSelectFile, onOpenFolder, onEditPhoto, onOpenDocument, onOpenVideo, onOpenAudio, onOpenQuickLook, onFileContextMenu, toggleSelectOne,
}) => (
    <div 
      className="grid gap-4"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(200 * (iconScale / 100))}px, 1fr))`,
      }}
    >
      {onOpenFolder && folders.map(folder => (
        <FolderTile key={folder.id} folder={folder} iconScale={iconScale} onOpen={onOpenFolder} />
      ))}
      {files.map(file => {
        const isSelected = selectedIds.has(file.id);
        const isCurrent = selectedFileId === file.id;

        return (
          <div
            key={file.id}
            draggable
            onDragStart={e => setFileDragData(e.dataTransfer, file)}
            onClick={() => onSelectFile(file)}
            onContextMenu={event => onFileContextMenu(file, event)}
            onDoubleClick={() => {
              if (file.category === 'photo') onEditPhoto(file);
              else if (file.category === 'video') onOpenVideo(file);
              else if (file.category === 'audio') onOpenAudio(file);
              else if (isEditableDocument(file)) onOpenDocument(file);
              else onOpenQuickLook();
            }}
            className={`group relative rounded-xl p-2 transition-all cursor-pointer ${
              isCurrent
                ? SELECTION_CLASSES[accent].card
                : isSelected
                ? SELECTION_CLASSES[accent].cardMulti
                : 'hover:bg-white/5'
            }`}
          >
            {/* Thumbnail / Glass Card */}
            <div className="aspect-[4/3] rounded-lg overflow-hidden relative bg-black/40 border border-white/8 group-hover:border-white/15 transition-all shadow-md">
              <FileThumbnail file={file} hoverZoom onContextMenu={event => onFileContextMenu(file, event)} />

              {/* Checkbox */}
              <button
                onClick={e => toggleSelectOne(file.id, e)}
                className={`absolute top-2 left-2 p-1 rounded backdrop-blur-md transition-opacity ${
                  isSelected ? `${SELECTION_CLASSES[accent].checkIcon} bg-black/70 opacity-100` : 'text-neutral-400 bg-black/50 opacity-0 group-hover:opacity-100'
                }`}
              >
                {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              </button>

              {/* Duration badge */}
              {file.videoMeta && (file.category === 'video' || file.category === 'audio') && (
                <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-mono text-white bg-black/80 px-1.5 py-0.5 rounded backdrop-blur-sm">
                  {file.category === 'audio'
                    ? <Music2 className="w-2.5 h-2.5" />
                    : <Play className="w-2.5 h-2.5 fill-current" />}
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
                {isEditableDocument(file) && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onOpenDocument(file);
                    }}
                    className="p-1 rounded-md bg-[#0060df] hover:bg-[#0250bb] text-white shadow-md font-bold"
                    title="Edit document"
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
                {file.category === 'audio' && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onOpenAudio(file);
                    }}
                    className="p-1 rounded-md bg-violet-400 hover:bg-violet-300 text-neutral-950 shadow-md font-bold"
                    title="Play audio"
                  >
                    <Play className="w-3 h-3 fill-current" />
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
