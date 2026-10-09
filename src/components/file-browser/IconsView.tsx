import React from 'react';
import { Play, CheckSquare, Square, Music2 } from 'lucide-react';
import { FileItem, FolderItem } from '../../types';
import { isEditableDocument } from '../../utils/documentKind';
import { FileThumbnail } from './FileThumbnail';
import { FolderTile } from './FolderTile';
import { SelectionAccent, SELECTION_CLASSES } from '../../utils/selectionAccent';
import { formatTimecode } from '../../utils/format';
import { setFileDragData } from '../../utils/fileDrag';
import { useMediaDuration } from '../../hooks/useMediaDuration';

const MediaDurationBadge: React.FC<{ file: FileItem }> = ({ file }) => {
  const duration = useMediaDuration(file.url, file.videoMeta?.durationSeconds);
  if (!(duration > 0)) return null;
  return (
    <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-[10px] font-mono text-white bg-black/75 px-1.5 py-0.5 rounded-md">
      {file.category === 'audio'
        ? <Music2 className="w-2.5 h-2.5" />
        : <Play className="w-2.5 h-2.5 fill-current" />}
      <span>{formatTimecode(duration)}</span>
    </div>
  );
};

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
      className="grid gap-x-3 gap-y-5"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(140 * (iconScale / 100))}px, 1fr))`,
      }}
    >
      {onOpenFolder && folders.map(folder => (
        <FolderTile key={folder.id} folder={folder} iconScale={iconScale} onOpen={onOpenFolder} />
      ))}
      {files.map(file => {
        const isSelected = selectedIds.has(file.id);
        const isCurrent = selectedFileId === file.id;
        const isPhoto = file.category === 'photo';

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
            className={`group relative rounded-xl px-2 pt-3 pb-2 transition-all cursor-pointer ${
              isCurrent
                ? SELECTION_CLASSES[accent].card
                : isSelected
                ? SELECTION_CLASSES[accent].cardMulti
                : 'hover:bg-white/5'
            }`}
          >
            {/* Finder-style thumbnail: rounded preview, no glass card chrome */}
            <div className="aspect-[4/3] flex items-center justify-center relative">
              <div
                className={`relative overflow-hidden shadow-md shadow-black/40 ${
                  isPhoto
                    ? 'w-[78%] aspect-square rounded-2xl'
                    : 'w-[82%] aspect-[4/3] rounded-xl'
                } ${isPhoto ? 'bg-neutral-800' : 'bg-black/50 border border-white/8'}`}
              >
                <FileThumbnail
                  file={file}
                  hoverZoom={isPhoto}
                  className="w-full h-full"
                  onContextMenu={event => onFileContextMenu(file, event)}
                />

                <button
                  onClick={e => toggleSelectOne(file.id, e)}
                  className={`absolute top-1.5 left-1.5 p-0.5 rounded-md backdrop-blur-md transition-opacity ${
                    isSelected
                      ? `${SELECTION_CLASSES[accent].checkIcon} bg-black/70 opacity-100`
                      : 'text-neutral-300 bg-black/45 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                </button>

                {(file.category === 'video' || file.category === 'audio') && (
                  <MediaDurationBadge file={file} />
                )}
              </div>
            </div>

            <div className="pt-1.5 px-1 text-center">
              <p className="text-xs font-medium text-neutral-200 truncate group-hover:text-white leading-snug break-words">
                {file.name}
              </p>
            </div>
          </div>
        );
      })}
    </div>
);
