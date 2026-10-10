import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight, Check } from '@/src/icons';
import { FileItem } from '../../types';
import { isEditableDocument, isMacAppBundle, isPdfDocument } from '../../utils/documentKind';
import { isZipArchive } from '../../utils/unzipArchive';

const SUGGESTED_TAGS = ['Favorite', 'Work', 'Personal', 'Review', 'Final'];

export interface FileContextMenuProps {
  file: FileItem;
  targets: FileItem[];
  x: number;
  y: number;
  onClose: () => void;
  onOpen: (file: FileItem) => void;
  onQuickLook: (file: FileItem) => void;
  onGetInfo: (file: FileItem) => void;
  onRename: (file: FileItem) => void;
  onDuplicate: (files: FileItem[]) => void;
  onCopy: (files: FileItem[]) => void;
  onShare: (file: FileItem) => void;
  onUnzip?: (file: FileItem) => void;
  onTrash: (files: FileItem[]) => void;
  onToggleTag: (files: FileItem[], tag: string) => void;
  onToggleEncrypt?: (file: FileItem) => void;
}

export const FileContextMenu: React.FC<FileContextMenuProps> = ({
  file,
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
  onUnzip,
  onTrash,
  onToggleTag,
  onToggleEncrypt,
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

  const isApp = isMacAppBundle(file);
  const openWith = [
    { id: 'quick-look', label: 'Quick Look', enabled: true, action: () => onQuickLook(file) },
    { id: 'app', label: 'Open Application', enabled: isApp, action: () => onOpen(file) },
    { id: 'photo', label: 'Photo Studio', enabled: file.category === 'photo' && !isApp, action: () => onOpen(file) },
    { id: 'video', label: 'Video Player', enabled: file.category === 'video', action: () => onOpen(file) },
    { id: 'audio', label: 'Audio Player', enabled: file.category === 'audio', action: () => onOpen(file) },
    {
      id: 'document',
      label: isPdfDocument(file) ? 'Open Document' : 'Document Editor',
      enabled: isEditableDocument(file),
      action: () => onOpen(file),
    },
    {
      id: 'archive',
      label: 'Extract Archive',
      enabled: !!onUnzip && isZipArchive(file) && !multiple,
      action: () => onUnzip?.(file),
    },
  ].filter(item => item.enabled);

  const tags = Array.from(new Set([...targets.flatMap(item => item.tags), ...SUGGESTED_TAGS]));

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
      <MenuItem label="Open" onClick={() => run(() => onOpen(file))} />
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
      {onUnzip && isZipArchive(file) && !multiple && (
        <MenuItem label="Unzip / Extract" onClick={() => run(() => onUnzip(file))} />
      )}

      <Separator />
      <MenuItem label="Move to Trash" onClick={() => run(() => onTrash(targets))} />
      <Separator />
      <MenuItem label="Get Info" shortcut="⌘I" onClick={() => run(() => onGetInfo(file))} />
      <MenuItem label="Rename" disabled={multiple} onClick={() => run(() => onRename(file))} />
      <MenuItem label="Duplicate" shortcut="⌘D" onClick={() => run(() => onDuplicate(targets))} />
      <MenuItem label="Quick Look" shortcut="Space" onClick={() => run(() => onQuickLook(file))} />
      <Separator />
      <MenuItem label="Copy" shortcut="⌘C" onClick={() => run(() => onCopy(targets))} />
      <MenuItem label="Share…" onClick={() => run(() => onShare(file))} />
      {onToggleEncrypt && !multiple && (
        <MenuItem
          label={file.encryption.isEncrypted ? 'Decrypt with Vault' : 'Encrypt with Vault'}
          onClick={() => run(() => onToggleEncrypt(file))}
        />
      )}
      <Separator />
      <SubmenuItem
        label="Tags"
        open={submenu === 'tags'}
        flip={flipSubmenu}
        onOpen={() => setSubmenu('tags')}
        onClose={() => setSubmenu(current => current === 'tags' ? null : current)}
      >
        {tags.map(tag => {
          const checked = targets.every(item => item.tags.includes(tag));
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

export const FileRenameField: React.FC<{
  file: FileItem;
  x: number;
  y: number;
  onCommit: (name: string) => void;
  onCancel: () => void;
}> = ({ file, x, y, onCommit, onCancel }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const nextX = x + rect.width > window.innerWidth - 8 ? Math.max(8, window.innerWidth - rect.width - 8) : x;
    const nextY = y + rect.height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - rect.height - 8) : y;
    setPos({ x: nextX, y: nextY });
    const dot = input.value.lastIndexOf('.');
    input.focus();
    input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
  }, [x, y]);

  const commit = () => {
    const next = inputRef.current?.value.trim() ?? '';
    if (!next || next === file.name) onCancel();
    else onCommit(next);
  };

  return (
    <input
      ref={inputRef}
      defaultValue={file.name}
      aria-label="Rename"
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
