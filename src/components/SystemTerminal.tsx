import React, { useEffect, useRef, useState } from 'react';
import { Plus, Terminal as TerminalIcon, X } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { quoteShellPath, readDroppedPaths } from '../utils/fileDrag';
import {
  onTerminalData,
  onTerminalExit,
  terminalAvailable,
  terminalCreate,
  terminalKill,
  terminalResize,
  terminalWrite,
} from '../services/terminalBridge';

export type TerminalContext = {
  cwdLabel: string;
  userName: string;
  isVaultUnlocked: boolean;
  peerId: string | null;
  fileNames: string[];
  libraryNames: string[];
};

type TerminalTab = {
  id: string;
  title: string;
  sessionId: string | null;
};

interface SystemTerminalProps {
  width?: number;
  context: TerminalContext;
}

let tabSeq = 1;

function createTab(title?: string): TerminalTab {
  const n = tabSeq++;
  return {
    id: `term-tab-${n}-${Math.random().toString(36).slice(2, 7)}`,
    title: title ?? `Tab ${n}`,
    sessionId: null,
  };
}

const XTERM_THEME_DARK = {
  // Transparent so the glass panel shows through (no solid black layer).
  background: '#00000000',
  foreground: '#c0c0c8',
  cursor: '#a3e635',
  cursorAccent: '#121214',
  selectionBackground: '#a3e63555',
  black: '#1a1a1e',
  red: '#f87171',
  green: '#a3e635',
  yellow: '#fbbf24',
  blue: '#38bdf8',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e5e5e5',
  brightBlack: '#737373',
  brightRed: '#fca5a5',
  brightGreen: '#bef264',
  brightYellow: '#fde68a',
  brightBlue: '#7dd3fc',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#fafafa',
};

const XTERM_THEME_LIGHT = {
  ...XTERM_THEME_DARK,
  background: '#001d3d',
  foreground: '#c8d4e0',
  cursorAccent: '#001d3d',
  black: '#001d3d',
};

function currentXtermTheme() {
  if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light') {
    return XTERM_THEME_LIGHT;
  }
  return XTERM_THEME_DARK;
}

/** One xterm + PTY session bound to a tab. Hidden when inactive. */
const PtyPane: React.FC<{
  active: boolean;
  tabId: string;
  onSession: (tabId: string, sessionId: string | null) => void;
  registerInsert: (tabId: string, fn: ((paths: string[]) => void) | null) => void;
}> = ({ active, tabId, onSession, registerInsert }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const real = terminalAvailable();

  useEffect(() => {
    if (!hostRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: 'JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 11,
      lineHeight: 1.35,
      theme: currentXtermTheme(),
      allowProposedApi: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    termRef.current = term;
    fitRef.current = fit;

    const themeObserver = new MutationObserver(() => {
      term.options.theme = currentXtermTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    let disposed = false;
    let unlistenData: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;

    const start = async () => {
      try {
        fit.fit();
      } catch {
        /* host may be display:none */
      }

      if (!real) {
        term.writeln('\x1b[38;2;192;192;200mCloudbreak Files — system terminal\x1b[0m');
        term.writeln(
          '\x1b[38;2;163;230;53mReal Mac Terminal (zsh) requires the desktop app.\x1b[0m',
        );
        term.writeln('Run \x1b[1mnpm run tauri dev\x1b[0m for a full login shell.');
        term.writeln('');
        term.write('\x1b[38;2;163;230;53m$\x1b[0m ');
        term.onData(data => {
          if (data === '\r') {
            term.write('\r\n\x1b[38;2;163;230;53m$\x1b[0m ');
          } else if (data === '\u007f') {
            term.write('\b \b');
          } else {
            term.write(data);
          }
        });
        return;
      }

      try {
        const cols = term.cols || 80;
        const rows = term.rows || 24;
        const id = await terminalCreate(cols, rows);
        if (disposed) {
          await terminalKill(id);
          return;
        }
        sessionRef.current = id;
        onSession(tabId, id);

        unlistenData = await onTerminalData(ev => {
          if (ev.id === id) term.write(ev.data);
        });
        unlistenExit = await onTerminalExit(ev => {
          if (ev.id !== id) return;
          term.writeln(`\r\n\x1b[90m[process exited${ev.code != null ? ` with ${ev.code}` : ''}]\x1b[0m`);
          sessionRef.current = null;
          onSession(tabId, null);
        });

        term.onData(data => {
          const sid = sessionRef.current;
          if (sid) void terminalWrite(sid, data);
        });

        term.onResize(({ cols: c, rows: r }) => {
          const sid = sessionRef.current;
          if (sid) void terminalResize(sid, c, r);
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        term.writeln(`\x1b[31mFailed to start shell: ${msg}\x1b[0m`);
      }
    };

    void start();

    registerInsert(tabId, (paths: string[]) => {
      if (!paths.length) return;
      const quoted = paths.map(quoteShellPath).join(' ');
      const sid = sessionRef.current;
      if (sid) {
        void terminalWrite(sid, quoted);
        return;
      }
      term.write(quoted);
    });

    return () => {
      disposed = true;
      themeObserver.disconnect();
      registerInsert(tabId, null);
      unlistenData?.();
      unlistenExit?.();
      const sid = sessionRef.current;
      sessionRef.current = null;
      onSession(tabId, null);
      if (sid) void terminalKill(sid);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // One PTY per tab mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, real]);

  useEffect(() => {
    if (!active) return;
    const fit = fitRef.current;
    const term = termRef.current;
    const timer = window.setTimeout(() => {
      try {
        fit?.fit();
      } catch {
        /* ignore */
      }
      term?.focus();
      const sid = sessionRef.current;
      if (sid && term) void terminalResize(sid, term.cols, term.rows);
    }, 30);
    return () => window.clearTimeout(timer);
  }, [active]);

  useEffect(() => {
    if (!active || !hostRef.current) return;
    const el = hostRef.current.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      try {
        fitRef.current?.fit();
      } catch {
        /* ignore */
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  return (
    <div
      ref={hostRef}
      className="h-full w-full min-h-0 px-1 py-1"
      style={{ display: active ? 'block' : 'none' }}
      aria-hidden={!active}
    />
  );
};

export const SystemTerminal: React.FC<SystemTerminalProps> = ({ width = 320, context }) => {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => {
    tabSeq = 1;
    return [createTab('Tab 1')];
  });
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const insertFns = useRef(new Map<string, (paths: string[]) => void>());

  const active = tabs.find(t => t.id === activeId) ?? tabs[0];

  const registerInsert = (tabId: string, fn: ((paths: string[]) => void) | null) => {
    if (!fn) insertFns.current.delete(tabId);
    else insertFns.current.set(tabId, fn);
  };

  const onSession = (tabId: string, sessionId: string | null) => {
    setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, sessionId } : t)));
  };

  const addTab = () => {
    const tab = createTab();
    setTabs(prev => [...prev, tab]);
    setActiveId(tab.id);
  };

  const closeTab = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTabs(prev => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex(t => t.id === id);
      const next = prev.filter(t => t.id !== id);
      if (activeId === id) {
        const fallback = next[Math.max(0, idx - 1)] ?? next[0];
        setActiveId(fallback.id);
      }
      return next;
    });
  };

  const insertPaths = (paths: string[]) => {
    if (!paths.length || !active) return;
    insertFns.current.get(active.id)?.(paths);
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragOver(false);
    insertPaths(readDroppedPaths(e.dataTransfer));
  };

  if (!active) return null;

  return (
    <aside
      style={{ width }}
      className={`system-terminal-panel macos-sidebar-glass relative h-full shrink-0 flex flex-col border-l border-white/10 select-text ${
        dragOver ? 'ring-1 ring-inset ring-[#a3e635]/50' : ''
      }`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="terminal-panel-header h-7 px-1.5 flex items-center gap-1 border-b border-white/8 macos-toolbar-glass shrink-0 select-none">
        <TerminalIcon className="w-3 h-3 text-[#a3e635] shrink-0 ml-0.5" />
        <span className="text-[10px] font-semibold text-[#ececef] tracking-tight shrink-0">
          Terminal
        </span>
        {!terminalAvailable() && (
          <span className="text-[8px] text-[#fbbf24] font-medium shrink-0 hidden sm:inline">
            preview
          </span>
        )}

        <div className="flex-1 min-w-0 flex items-center gap-px overflow-x-auto mx-0.5">
          {tabs.map(tab => {
            const selected = tab.id === activeId;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setActiveId(tab.id);
                }}
                className={`group flex items-center gap-0.5 max-w-[5.5rem] h-5 px-1.5 rounded text-[9px] font-mono leading-none transition-colors shrink-0 ${
                  selected
                    ? 'bg-[#a3e635]/15 text-[#a3e635] border border-[#a3e635]/35'
                    : 'text-[#a1a1aa] hover:text-[#ececef] hover:bg-white/5 border border-transparent'
                }`}
                title={tab.title}
              >
                <span className="truncate">{tab.title}</span>
                {tabs.length > 1 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => closeTab(tab.id, e)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') closeTab(tab.id);
                    }}
                    className="p-px rounded opacity-50 hover:opacity-100 hover:bg-white/10"
                    aria-label={`Close ${tab.title}`}
                  >
                    <X className="w-2 h-2" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            addTab();
          }}
          className="shrink-0 h-5 w-5 rounded text-[#a3e635] hover:text-[#bef264] bg-[#a3e635]/10 hover:bg-[#a3e635]/20 border border-[#a3e635]/30 flex items-center justify-center transition-colors"
          title="New terminal tab"
          aria-label="New terminal tab"
        >
          <Plus className="w-2.5 h-2.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className="absolute inset-0"
            style={{ visibility: tab.id === activeId ? 'visible' : 'hidden' }}
          >
            <PtyPane
              active={tab.id === activeId}
              tabId={tab.id}
              onSession={onSession}
              registerInsert={registerInsert}
            />
          </div>
        ))}
      </div>

      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#a3e635]/10 border border-[#a3e635]/40 m-1 rounded-lg">
          <span className="text-xs font-medium text-[#a3e635] bg-black/70 px-3 py-1.5 rounded-lg border border-[#a3e635]/35">
            Drop files to insert paths
          </span>
        </div>
      )}

      {/* Keep context typed for App; unused in PTY mode beyond cwd hint */}
      <span className="sr-only">{context.cwdLabel}</span>
    </aside>
  );
};
