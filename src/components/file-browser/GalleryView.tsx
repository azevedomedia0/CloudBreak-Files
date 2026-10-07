import React from 'react';
import { Edit3, Scissors } from 'lucide-react';
import { FileItem } from '../../types';
import { isEditableDocument } from '../../utils/documentKind';
import { SelectionAccent, SELECTION_CLASSES } from '../../utils/selectionAccent';
import { FileThumbnail } from './FileThumbnail';

export interface GalleryViewProps {
  accent: SelectionAccent;
  files: FileItem[];
  selectedFile: FileItem;
  onSelectFile: (file: FileItem) => void;
  onEditPhoto: (file: FileItem) => void;
  onOpenDocument: (file: FileItem) => void;
  onOpenVideo: (file: FileItem) => void;
}

export const GalleryView: React.FC<GalleryViewProps> = ({ accent, files, selectedFile, onSelectFile, onEditPhoto, onOpenDocument, onOpenVideo }) => (
    <div className="h-full flex flex-col space-y-4">
      {/* Center Big Gallery Viewport */}
      <div className="flex-1 min-h-[380px] macos-glass-card rounded-2xl flex items-center justify-center relative p-6 overflow-hidden">
        {selectedFile.category === 'photo' && (
          <img
            src={selectedFile.url}
            alt={selectedFile.name}
            className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
          />
        )}
        {selectedFile.category === 'video' && (
          <video
            src={selectedFile.url}
            controls
            className="max-h-full max-w-full rounded-xl shadow-2xl"
          />
        )}
        {selectedFile.category !== 'photo' && selectedFile.category !== 'video' && (
          <FileThumbnail file={selectedFile} className="w-full h-full" iconClassName="w-16 h-16" />
        )}

        {/* Action Floating Buttons */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {selectedFile.category === 'photo' && (
            <button
              onClick={() => onEditPhoto(selectedFile)}
              className="px-3 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-neutral-950 font-bold text-xs flex items-center gap-1.5 shadow-lg"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Open in Studio</span>
            </button>
          )}
          {isEditableDocument(selectedFile) && (
            <button
              onClick={() => onOpenDocument(selectedFile)}
              className="px-3 py-1.5 rounded-lg bg-[#0060df] hover:bg-[#0250bb] text-white font-bold text-xs flex items-center gap-1.5 shadow-lg"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit document</span>
            </button>
          )}
          {selectedFile.category === 'video' && (
            <button
              onClick={() => onOpenVideo(selectedFile)}
              className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs flex items-center gap-1.5 shadow-lg"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Open Cinema Suite</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom macOS Scrubber Reel */}
      <div className="h-28 overflow-x-auto flex gap-3 p-2.5 macos-glass-card rounded-xl">
        {files.map(file => {
          const isActive = selectedFile.id === file.id;
          return (
            <div
              key={file.id}
              onClick={() => onSelectFile(file)}
              className={`h-full aspect-video rounded-lg overflow-hidden border shrink-0 cursor-pointer relative transition-all ${
                isActive
                  ? SELECTION_CLASSES[accent].galleryRing
                  : 'border-white/10 opacity-60 hover:opacity-100 hover:border-white/20'
              }`}
            >
              <FileThumbnail file={file} compact iconClassName="w-5 h-5" />
            </div>
          );
        })}
      </div>
    </div>
);
