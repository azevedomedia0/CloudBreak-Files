import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight, Check, X } from '@/src/icons';
import { FolderItem } from '../../types';
import { FinderFolderIcon } from './FinderFolderIcon';

const SUGGESTED_TAGS = ['Favorite', 'Work', 'Personal', 'Review', 'Final'];

export function localPathFromFolderId(id: string): string | null {
  const prefix = 'folder-local-';
  if (!id.startsWith(prefix)) return null;
  const rest = id.slice(prefix.length);
  return rest.startsWith('/') ? rest : null;
}

export interface FolderContextMenuProps {
  folder: FolderItem;
  targets: FolderItem[];
  x: number;
  y: number;
  onClose: () => void;
  onOpen: (folder: FolderItem) => void;
  onQuickLook: (folder: FolderItem) => void;
  onGetInfo: (folder: FolderItem) => void;
  onRename: (folder: FolderItem) => void;
  onDuplicate: (folders: FolderItem[]) => void;
  onCopy: (folders: FolderItem[]) => void;
  onShare: (folder: FolderItem) => void;
  onTrash: (folders: FolderItem[]) => void;
  onToggleTag: (folders: FolderItem[], tag: string) => void;
}

export const FolderContextMenu: React.FC<FolderContextMenuProps> = ({
  folder,
  targets,
  x,
  y,
  onClose,
  onOpen,
  onQuickLook,
  onGetInfo,
  onRename,
  onDuplicate,
  onCopy,
  onShare,
  onTrash,
  onToggleTag,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [flipSubmenu, setFlipSubmenu] = useState(false);
  const [submenu, setSubmenu] = useState<'open' | 'tags' | null>(null);
  const multiple = targets.length > 1;

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nextX = x + rect.width > window.innerWidth - 8 ? Math.max(8, window.innerWidth - rect.width - 8) : x;
    const nextY = y + rect.height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - rect.height - 8) : y;
    setPos({ x: nextX, y: nextY });
    setFlipSubmenu(nextX + rect.width + 220 > window.innerWidth);
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

  const run = (action: () => void) => {
    action();
    onClose();
  };

  const openWith = [
    { id: 'quick-look', label: 'Quick Look', action: () => onQuickLook(folder) },
    { id: 'folder', label: 'Open Folder', action: () => onOpen(folder) },
  ];

  const tags = Array.from(new Set([
    ...targets.flatMap(item => item.tags ?? []),
    ...SUGGESTED_TAGS,
  ]));

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
      <MenuItem label="Open" onClick={() => run(() => onOpen(folder))} />
      <SubmenuItem
        label="Open With"
        open={submenu === 'open'}
        flip={flipSubmenu}
        onOpen={() => setSubmenu('open')}
        onClose={() => setSubmenu(current => current === 'open' ? null : current)}
      >
        {openWith.map(item => (
          <MenuItem key={item.id} label={item.label} onClick={() => run(item.action)} />
        ))}
      </SubmenuItem>

      <Separator />
      <MenuItem label="Move to Trash" onClick={() => run(() => onTrash(targets))} />
      <Separator />
      <MenuItem label="Get Info" shortcut="⌘I" onClick={() => run(() => onGetInfo(folder))} />
      <MenuItem label="Rename" disabled={multiple} onClick={() => run(() => onRename(folder))} />
      <MenuItem label="Duplicate" shortcut="⌘D" onClick={() => run(() => onDuplicate(targets))} />
      <MenuItem label="Quick Look" shortcut="Space" onClick={() => run(() => onQuickLook(folder))} />
      <Separator />
      <MenuItem label="Copy" shortcut="⌘C" onClick={() => run(() => onCopy(targets))} />
      <MenuItem label="Share…" onClick={() => run(() => onShare(folder))} />
      <Separator />
      <SubmenuItem
        label="Tags"
        open={submenu === 'tags'}
        flip={flipSubmenu}
        onOpen={() => setSubmenu('tags')}
        onClose={() => setSubmenu(current => current === 'tags' ? null : current)}
      >
        {tags.map(tag => {
          const checked = targets.every(item => (item.tags ?? []).includes(tag));
          return (
            <MenuItem
              key={tag}
              label={tag}
              checked={checked}
              onClick={() => run(() => onToggleTag(targets, tag))}
            />
          );
        })}
      </SubmenuItem>
    </div>
  );
};

export const FolderRenameField: React.FC<{
  folder: FolderItem;
  x: number;
  y: number;
  onCommit: (name: string) => void;
  onCancel: () => void;
}> = ({ folder, x, y, onCommit, onCancel }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const nextX = x + rect.width > window.innerWidth - 8 ? Math.max(8, window.innerWidth - rect.width - 8) : x;
    const nextY = y + rect.height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - rect.height - 8) : y;
    setPos({ x: nextX, y: nextY });
    input.focus();
    input.setSelectionRange(0, input.value.length);
  }, [x, y]);

  const commit = () => {
    const next = inputRef.current?.value.trim() ?? '';
    if (!next || next === folder.name) onCancel();
    else onCommit(next);
  };

  return (
    <input
      ref={inputRef}
      defaultValue={folder.name}
      aria-label="Rename folder"
      className="fixed z-[80] w-64 px-2 py-1 rounded-md border border-sky-400 bg-neutral-950 text-sm text-neutral-100 shadow-2xl outline-none"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
      onBlur={commit}
    />
  );
};

export const FolderGetInfo: React.FC<{
  folder: FolderItem;
  onClose: () => void;
}> = ({ folder, onClose }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const localPath = localPathFromFolderId(folder.id);
  const rows: [string, string][] = [
    ['Kind', 'Folder'],
    ['Name', folder.name],
    ['Items', String(folder.itemCount)],
    ['Where', localPath || folder.parentId || 'Local Files'],
  ];
  if (folder.tags?.length) {
    rows.push(['Tags', folder.tags.join(', ')]);
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={`Info for ${folder.name}`}
        className="w-[340px] rounded-xl border border-white/15 bg-neutral-900/95 text-neutral-100 shadow-2xl backdrop-blur-xl overflow-hidden"
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-neutral-950/80">
          <span className="text-[12px] font-medium text-neutral-300">Get Info</span>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white" aria-label="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <FinderFolderIcon className="w-14 h-11 shrink-0 drop-shadow-md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold break-words">{folder.name}</p>
              <p className="text-[11px] text-neutral-400 mt-0.5">Folder</p>
            </div>
          </div>
          <dl className="space-y-1.5 text-[12px]">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-neutral-400 shrink-0">{label}</dt>
                <dd className="text-neutral-100 text-right truncate" title={value}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
};

const Separator = () => <div className="my-1 h-px bg-white/10" />;

const MenuItem: React.FC<{
  label: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  onClick: () => void;
}> = ({ label, shortcut, disabled, checked, onClick }) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    onClick={onClick}
    className="group w-full flex items-center gap-2 px-2.5 py-[3px] rounded text-left text-[13px] text-neutral-100 hover:bg-[#0a84ff] hover:text-white disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-neutral-100"
  >
    <span className="w-3.5 shrink-0">{checked && <Check className="w-3.5 h-3.5" />}</span>
    <span className="flex-1 truncate">{label}</span>
    {shortcut && <span className="text-[11px] text-neutral-400 group-hover:text-white/80 group-disabled:text-neutral-500">{shortcut}</span>}
  </button>
);

const SubmenuItem: React.FC<{
  label: string;
  open: boolean;
  flip: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ label, open, flip, onOpen, onClose, children }) => (
  <div className="relative" onMouseEnter={onOpen} onMouseLeave={onClose}>
    <button
      type="button"
      role="menuitem"
      className={`w-full flex items-center gap-2 px-2.5 py-[3px] rounded text-left text-[13px] ${open ? 'bg-[#0a84ff] text-white' : 'text-neutral-100'}`}
    >
      <span className="w-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="w-3.5 h-3.5" />
    </button>
    {open && (
      <div className={`app-modal-panel absolute top-0 min-w-[180px] p-1 rounded-lg border border-white/15 bg-neutral-800/95 shadow-2xl backdrop-blur-xl ${flip ? 'right-full mr-1' : 'left-full ml-1'}`}>
        {children}
      </div>
    )}
  </div>
);
