import React from 'react';
import { FolderItem } from '../../types';
import { FinderFolderIcon } from './FinderFolderIcon';

export interface FolderTileProps {
  folder: FolderItem;
  iconScale?: number;
  compact?: boolean;
  onOpen: (folderId: string) => void;
}

/** Finder-style yellow folder for Icons / List grids. */
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
        <FinderFolderIcon className="w-8 h-6 shrink-0 drop-shadow-sm" />
        <span className="truncate max-w-xs text-neutral-200">{folder.name}</span>
      </button>
    );
  }

  const scale = Math.min(1.4, Math.max(0.75, iconScale / 100));

  return (
    <button
      type="button"
      onClick={() => onOpen(folder.id)}
      onDoubleClick={() => onOpen(folder.id)}
      className="group relative rounded-xl px-2 pt-3 pb-2 transition-all cursor-pointer hover:bg-white/5 text-left w-full"
      title={`Open ${folder.name}`}
    >
      <div className="aspect-[4/3] flex items-center justify-center">
        <div style={{ transform: `scale(${scale})` }} className="origin-center">
          <FinderFolderIcon className="w-[4.5rem] h-[3.6rem] drop-shadow-md group-hover:brightness-105 transition-[filter]" />
        </div>
      </div>
      <div className="pt-1 px-1 text-center">
        <p className="text-xs font-medium text-neutral-200 truncate group-hover:text-white leading-snug">
          {folder.name}
        </p>
      </div>
    </button>
  );
};
