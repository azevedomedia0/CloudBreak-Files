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
      className="group relative rounded-2xl p-2 transition-all duration-200 cursor-pointer hover:bg-white/[0.04] text-left w-full"
      title={`Open ${folder.name}`}
    >
      <div
        className="file-thumb-frame aspect-[4/3] rounded-xl overflow-hidden relative ring-1 ring-white/10 group-hover:ring-sky-400/35 transition-[box-shadow,ring-color] duration-300 shadow-[0_10px_28px_-12px_rgba(0,0,0,0.65)] flex flex-col items-center justify-center gap-2"
        style={{
          background:
            'linear-gradient(155deg, rgba(56,189,248,0.22) 0%, rgba(14,165,233,0.08) 42%, rgba(10,10,12,0.72) 100%)',
        }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/[0.08] to-transparent" />
        <div
          className="relative flex items-center justify-center text-sky-300/90 drop-shadow-md transition-transform duration-300 group-hover:scale-105"
          style={{ transform: `scale(${Math.min(1.35, iconScale / 100)})` }}
        >
          <Folder className="w-14 h-14 fill-sky-500/35 stroke-sky-200/90" strokeWidth={1.2} />
        </div>
        {folder.itemCount > 0 && (
          <span className="absolute bottom-2 left-2 text-[10px] font-mono text-white/95 bg-black/55 px-1.5 py-0.5 rounded-md backdrop-blur-md border border-white/10">
            {folder.itemCount} items
          </span>
        )}
      </div>
      <div className="pt-2.5 px-1 text-center">
        <p className="text-xs font-medium text-neutral-200 truncate tracking-tight group-hover:text-white transition-colors">{folder.name}</p>
        <p className="text-[11px] text-neutral-500 mt-0.5">Folder</p>
      </div>
    </button>
  );
};
