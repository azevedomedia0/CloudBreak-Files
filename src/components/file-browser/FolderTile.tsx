import React from 'react';
import { Folder } from 'lucide-react';
import { FolderItem } from '../../types';
import { getFolderIcon } from '../../utils/folderIcons';

export interface FolderTileProps {
  folder: FolderItem;
  iconScale?: number;
  compact?: boolean;
  onOpen: (folderId: string) => void;
}

/** Finder-style folder thumbnail for Icons / List grids. */
export const FolderTile: React.FC<FolderTileProps> = ({ folder, iconScale = 100, compact = false, onOpen }) => {
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onOpen(folder.id)}
        onDoubleClick={() => onOpen(folder.id)}
        className="flex items-center gap-2.5 min-w-0 text-left w-full"
        title={`Open ${folder.name}`}
      >
        <span className="w-10 h-7 rounded border border-white/10 bg-sky-500/10 flex items-center justify-center shrink-0">
          {getFolderIcon(folder.name, false)}
        </span>
        <span className="truncate max-w-xs text-neutral-200">{folder.name}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(folder.id)}
      onDoubleClick={() => onOpen(folder.id)}
      className="group relative rounded-xl p-2 transition-all cursor-pointer hover:bg-white/5 text-left w-full"
      title={`Open ${folder.name}`}
    >
      <div
        className="aspect-[4/3] rounded-lg overflow-hidden relative border border-white/10 group-hover:border-sky-400/40 transition-all shadow-md flex flex-col items-center justify-center gap-2"
        style={{
          background:
            'linear-gradient(165deg, rgba(56,189,248,0.18) 0%, rgba(14,165,233,0.08) 45%, rgba(0,0,0,0.35) 100%)',
        }}
      >
        <div
          className="relative flex items-center justify-center text-sky-300/90 drop-shadow-md"
          style={{ transform: `scale(${Math.min(1.35, iconScale / 100)})` }}
        >
          <Folder className="w-14 h-14 fill-sky-500/30 stroke-sky-300/90" strokeWidth={1.25} />
        </div>
        {folder.itemCount > 0 && (
          <span className="absolute bottom-2 left-2 text-[10px] font-mono text-white/90 bg-black/70 px-1.5 py-0.5 rounded backdrop-blur-sm">
            {folder.itemCount} items
          </span>
        )}
      </div>
      <div className="pt-2 px-1 text-center">
        <p className="text-xs font-medium text-neutral-200 truncate group-hover:text-white">{folder.name}</p>
        <p className="text-[11px] text-neutral-500 mt-0.5">Folder</p>
      </div>
    </button>
  );
};
