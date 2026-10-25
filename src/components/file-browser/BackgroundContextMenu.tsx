import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { emitFileMenuAction, type FileMenuAction } from '../../utils/fileMenuBus';
import { MenuItem, Separator } from './FolderContextMenu';

export interface BackgroundContextMenuProps {
  x: number;
  y: number;
  /** Select All has nothing to act on in an empty folder. */
  hasItems: boolean;
  onClose: () => void;
}

/** Right-click on the empty part of a folder: the File menu's actions that need no selection. */
export const BackgroundContextMenu: React.FC<BackgroundContextMenuProps> = ({ x, y, hasItems, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      x: x + rect.width > window.innerWidth - 8 ? Math.max(8, window.innerWidth - rect.width - 8) : x,
      y: y + rect.height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - rect.height - 8) : y,
    });
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  const run = (action: FileMenuAction) => {
    onClose();
    emitFileMenuAction(action);
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="app-modal-panel fixed z-[80] min-w-[220px] p-1 rounded-lg border border-white/15 bg-neutral-800/95 text-neutral-100 shadow-2xl backdrop-blur-xl"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
      onContextMenu={event => event.preventDefault()}
    >
      <MenuItem label="New Folder" shortcut="⇧⌘N" onClick={() => run('new-folder')} />
      <MenuItem label="Upload Files…" shortcut="⌘U" onClick={() => run('upload')} />
      <Separator />
      <MenuItem label="Select All" shortcut="⌘A" disabled={!hasItems} onClick={() => run('select-all')} />
      <Separator />
      <MenuItem label="Take Screenshot…" shortcut="⇧⌘6" onClick={() => run('screenshot')} />
      <MenuItem label="Start/Stop Screen Recording" shortcut="⇧⌘7" onClick={() => run('screen-recording')} />
    </div>
  );
};
