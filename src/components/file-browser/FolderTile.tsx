import React, { useEffect, useState } from 'react';
import { AppWindow } from '@/src/icons';
import { FolderItem } from '../../types';
import { previewBridge } from '../../services/previewBridge';
import { useNearViewport } from '../../hooks/useNearViewport';
import { FinderFolderIcon } from './FinderFolderIcon';
import { HoverSelectCheckbox } from './HoverSelectCheckbox';
import { SelectionAccent, SELECTION_CLASSES } from '../../utils/selectionAccent';

export interface FolderTileProps {
  folder: FolderItem;
  iconScale?: number;
  compact?: boolean;
  onOpen: (folderId: string) => void;
  accent?: SelectionAccent;
  selected?: boolean;
  onToggleSelect?: (e: React.MouseEvent) => void;
  onContextMenu?: (folder: FolderItem, event: React.MouseEvent) => void;
}

function localPathFromFolderId(id: string): string | null {
  const prefix = 'folder-local-';
  if (!id.startsWith(prefix)) return null;
  const rest = id.slice(prefix.length);
  return rest.startsWith('/') ? rest : null;
}

function isAppFolder(folder: FolderItem): boolean {
  return folder.name.toLowerCase().endsWith('.app');
}

/** Finder-style yellow folder for Icons / List grids. .app leftovers launch instead. */
export const FolderTile: React.FC<FolderTileProps> = ({
  folder,
  iconScale = 100,
  compact = false,
  onOpen,
  accent = 'sky',
  selected = false,
  onToggleSelect,
  onContextMenu,
}) => {
  const appPath = isAppFolder(folder) ? localPathFromFolderId(folder.id) : null;
  const [appIcon, setAppIcon] = useState<string | null>(null);
  const { ref, near } = useNearViewport<HTMLDivElement>('200px');

  useEffect(() => {
    if (!appPath || !previewBridge.available() || !near) {
      if (!appPath) setAppIcon(null);
      return;
    }
    const ac = new AbortController();
    void previewBridge.thumbnailUrl(appPath, 512, ac.signal).then(url => {
      if (!ac.signal.aborted && url) setAppIcon(url);
    });
    return () => {
      ac.abort();
    };
  }, [appPath, near]);

  const launchOrOpen = () => {
    if (appPath && previewBridge.available()) {
      void previewBridge.openWithDefault(appPath).catch(() => {});
      return;
    }
    onOpen(folder.id);
  };

  if (compact) {
    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        onClick={launchOrOpen}
        onDoubleClick={launchOrOpen}
        onContextMenu={e => onContextMenu?.(folder, e)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            launchOrOpen();
          }
        }}
        className="flex items-center gap-2.5 min-w-0 text-left w-full cursor-pointer"
        title={`Open ${folder.name}`}
      >
        {appPath ? (
          appIcon ? (
            <img src={appIcon} alt="" className="w-7 h-7 object-contain shrink-0" />
          ) : (
            <AppWindow className="w-7 h-7 shrink-0 text-sky-300/80" />
          )
        ) : (
          <FinderFolderIcon className="w-8 h-6 shrink-0 drop-shadow-sm" />
        )}
        <span className="truncate max-w-xs text-neutral-200">{folder.name}</span>
      </div>
    );
  }

  const scale = Math.min(2.5, Math.max(0.5, iconScale / 100));

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={launchOrOpen}
      onDoubleClick={launchOrOpen}
      onContextMenu={e => onContextMenu?.(folder, e)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          launchOrOpen();
        }
      }}
      className={`group relative rounded-xl px-2 pt-3 pb-2 transition-all cursor-pointer text-left w-full ${
        selected
          ? SELECTION_CLASSES[accent].cardMulti
          : 'hover:bg-white/5'
      }`}
      title={`Open ${folder.name}`}
    >
      <div className="aspect-[4/3] flex items-center justify-center relative">
        {onToggleSelect && (
          <HoverSelectCheckbox
            accent={accent}
            selected={selected}
            onToggle={onToggleSelect}
          />
        )}
        <div
          style={{ transform: `scale(${scale})` }}
          className="relative origin-center"
        >
          {appPath ? (
            appIcon ? (
              <img
                src={appIcon}
                alt=""
                className="w-[4.5rem] h-[4.5rem] object-contain drop-shadow-md group-hover:brightness-105 transition-[filter]"
              />
            ) : (
              <AppWindow className="w-[4.5rem] h-[4.5rem] text-sky-300/80 drop-shadow-md" />
            )
          ) : (
            <FinderFolderIcon className="w-[4.5rem] h-[3.6rem] drop-shadow-md group-hover:brightness-105 transition-[filter]" />
          )}
        </div>
      </div>
      <div className="pt-1 px-1 text-center">
        <p className="text-xs font-medium text-neutral-200 truncate group-hover:text-white leading-snug">
          {folder.name}
        </p>
      </div>
    </div>
  );
};
