import React, { useEffect, useRef, useState } from 'react';
import { Wifi, ShieldCheck, Battery, Cloud, Moon } from '@/src/icons';
import {
  emitFileMenuAction,
  fileMenuActionLabel,
  type FileMenuAction,
} from '../utils/fileMenuBus';

interface MacMenuBarProps {
  onOpenVaultSecurity: () => void;
  isVaultUnlocked: boolean;
  activeAccountName: string;
  hasSelection?: boolean;
  isEncrypted?: boolean;
}

type MenuId = 'file' | null;

const FILE_ITEMS: { action: FileMenuAction; shortcut?: string; needsSelection?: boolean; separatorAfter?: boolean }[] = [
  { action: 'new-folder', shortcut: '⇧⌘N', separatorAfter: true },
  { action: 'upload', shortcut: '⌘U', separatorAfter: true },
  { action: 'open', shortcut: '⌘↓', needsSelection: true },
  { action: 'quick-look', shortcut: '␣', needsSelection: true, separatorAfter: true },
  { action: 'get-info', shortcut: '⌘I', needsSelection: true },
  { action: 'rename', needsSelection: true },
  { action: 'duplicate', shortcut: '⌘D', needsSelection: true, separatorAfter: true },
  { action: 'copy', shortcut: '⌘C', needsSelection: true },
  { action: 'share', needsSelection: true },
  { action: 'encrypt', needsSelection: true, separatorAfter: true },
  { action: 'trash', shortcut: '⌘⌫', needsSelection: true, separatorAfter: true },
  { action: 'select-all', shortcut: '⌘A' },
];

export const MacMenuBar: React.FC<MacMenuBarProps> = ({
  onOpenVaultSecurity,
  isVaultUnlocked,
  activeAccountName,
  hasSelection = false,
  isEncrypted = false,
}) => {
  const [timeString, setTimeString] = useState('');
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const fileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(
        now.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }) +
          ' ' +
          now.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }),
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const onPointer = (event: MouseEvent) => {
      if (fileRef.current && !fileRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const runFileAction = (action: FileMenuAction) => {
    setOpenMenu(null);
    emitFileMenuAction(action);
  };

  return (
    <div
      data-tauri-drag-region
      className="h-7 w-full px-4 flex items-center justify-between text-[13px] font-medium text-neutral-300 bg-black/40 backdrop-blur-2xl border-b border-white/8 select-none z-40 shrink-0"
    >
      <div className="flex items-center gap-4">
        <span className="text-white hover:text-neutral-300 cursor-default text-sm font-semibold pl-1">
          
        </span>
        <span className="font-semibold text-white tracking-tight cursor-default">
          Cloudbreak
        </span>
        <div className="hidden sm:flex items-center gap-1 text-xs text-neutral-300">
          <div ref={fileRef} className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}
              onMouseEnter={() => {
                if (openMenu) setOpenMenu('file');
              }}
              className={`px-2 py-0.5 rounded transition-colors ${
                openMenu === 'file' ? 'bg-sky-500/80 text-white' : 'hover:text-white'
              }`}
            >
              File
            </button>
            {openMenu === 'file' && (
              <div
                role="menu"
                className="app-modal-panel absolute left-0 top-full mt-0.5 z-[90] min-w-[240px] p-1 rounded-lg border border-white/15 bg-neutral-800/95 text-neutral-100 shadow-2xl backdrop-blur-xl"
              >
                {FILE_ITEMS.map(item => (
                  <React.Fragment key={item.action}>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={item.needsSelection && !hasSelection}
                      onClick={() => runFileAction(item.action)}
                      className="w-full flex items-center justify-between gap-6 px-2.5 py-1 rounded-md text-left text-[12px] disabled:opacity-40 disabled:pointer-events-none hover:bg-sky-500/80 hover:text-white"
                    >
                      <span>
                        {fileMenuActionLabel(
                          item.action,
                          item.action === 'encrypt' ? isEncrypted : undefined,
                        )}
                      </span>
                      {item.shortcut && (
                        <span className="text-[11px] text-neutral-400 tabular-nums">{item.shortcut}</span>
                      )}
                    </button>
                    {item.separatorAfter && <div className="my-1 h-px bg-white/10" />}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
          <span className="px-2 py-0.5 cursor-default opacity-50">Edit</span>
          <span className="px-2 py-0.5 cursor-default opacity-50">View</span>
          <span className="px-2 py-0.5 cursor-default opacity-50">Go</span>
          <span className="px-2 py-0.5 cursor-default opacity-50">Cloud</span>
          <span className="px-2 py-0.5 cursor-default opacity-50">Window</span>
          <span className="px-2 py-0.5 cursor-default opacity-50">Help</span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-neutral-300">
        <button
          type="button"
          onClick={onOpenVaultSecurity}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-white/10 transition-colors group"
          title="Vault settings"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isVaultUnlocked ? 'bg-cyan-400' : 'bg-amber-400'} animate-pulse`} />
          <span className="font-mono text-[11px] text-neutral-400 group-hover:text-cyan-300 transition-colors">
            {isVaultUnlocked ? 'Vault Unlocked' : 'Vault Locked'}
          </span>
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
        </button>

        <div className="flex items-center gap-1 text-neutral-400" title={`Connected to ${activeAccountName}`}>
          <Cloud className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-[11px] hidden md:inline">{activeAccountName}</span>
        </div>

        <Wifi className="w-3.5 h-3.5 text-neutral-400" />
        <Battery className="w-4 h-4 text-neutral-400" />

        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/8 text-[11px] text-neutral-300 select-none shadow-xs"
          title="Appearance"
        >
          <Moon className="w-3 h-3 text-sky-400" />
          <span className="text-[10px] font-medium hidden sm:inline text-neutral-300">Dark</span>
        </div>

        <span className="text-xs font-normal text-neutral-200 pl-1 font-mono">
          {timeString}
        </span>
      </div>
    </div>
  );
};
