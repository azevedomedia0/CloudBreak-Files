import React, { useEffect, useRef, useState } from 'react';
import { Plus, Terminal as TerminalIcon, X } from '@/src/icons';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { quoteShellPath, readDroppedPaths } from '../utils/fileDrag';
import { TERMINAL_MENU_ACTION_EVENT, type FileMenuActionDetail } from '../utils/fileMenuBus';
import {
  clampFontSize, FONT_DEFAULT, translateKey, type KeyResult,
} from '../utils/terminalKeys';
import {
  decodeTerminalData,
  onTerminalData,
  onTerminalExit,
  terminalAvailable,
  terminalCreate,
  terminalCwd,
  terminalKill,
  terminalOpenUrl,
  terminalResize,
  terminalWrite,
  terminalWriteBinary,
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
  /** Fallback label until the shell reports a title or a folder. */
  title: string;
  sessionId: string | null;
  /** Title the shell set itself (OSC 0/2). */
  oscTitle?: string;
  /** Name of the shell's current folder, refreshed while the panel is open. */
  folderTitle?: string;
  /** Where the shell starts and restarts: the folder the previous tab was in. */
  cwd?: string;
  /** Bumped to start a fresh shell in the same tab. */
  generation: number;
};

interface SystemTerminalProps {
  width?: number;
  context: TerminalContext;
  /** The panel stays mounted while hidden so shells keep running; false hides it. */
  visible?: boolean;
}

let tabSeq = 1;

function createTab(opts?: { cwd?: string }): TerminalTab {
  const n = tabSeq++;
  return {
    id: `term-tab-${n}-${Math.random().toString(36).slice(2, 7)}`,
    title: 'zsh',
    sessionId: null,
    cwd: opts?.cwd,
    generation: 0,
  };
}

const FONT_KEY = 'cloudbreak.terminal.fontSize';
const FONT_FAMILY = "'SF Mono', SFMono-Regular, Menlo, Monaco, 'JetBrains Mono', Consolas, monospace";

function loadFontSize(): number {
  try {
    const raw = Number(localStorage.getItem(FONT_KEY));
    return Number.isFinite(raw) && raw > 0 ? clampFontSize(raw) : FONT_DEFAULT;
  } catch {
    return FONT_DEFAULT;
  }
}

function folderName(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed ? trimmed.slice(trimmed.lastIndexOf('/') + 1) || '/' : '/';
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

const XTERM_THEME_GLACIAL = {
  ...XTERM_THEME_DARK,
  background: '#2b4c59',
  foreground: '#beceda',
  cursor: '#beceda',
  cursorAccent: '#2b4c59',
  selectionBackground: '#95bccc66',
  black: '#2b4c59',
};

const XTERM_THEME_LIGHT = {
  ...XTERM_THEME_DARK,
  background: '#001d3d',
  foreground: '#c8d4e0',
  cursorAccent: '#001d3d',
  black: '#001d3d',
};

function currentXtermTheme() {
  const theme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
  if (theme === 'light') return XTERM_THEME_LIGHT;
  if (theme === 'glacial') return XTERM_THEME_GLACIAL;
  return XTERM_THEME_DARK;
}

/** What a tab's panel can ask the whole terminal to do. */
interface PaneActions {
  newTab: () => void;
  closeTab: (tabId: string) => void;
  nextTab: () => void;
  previousTab: () => void;
  selectTab: (index: number) => void;
  zoom: (delta: number | 'reset') => void;
  restart: (tabId: string) => void;
}

const SEARCH_DECORATIONS = {
  matchBackground: '#a3e63540',
  matchBorder: '#a3e63566',
  matchOverviewRuler: '#a3e635',
  activeMatchBackground: '#a3e63590',
  activeMatchBorder: '#bef264',
  activeMatchColorOverviewRuler: '#bef264',
};

/** One xterm + PTY session bound to a tab. Hidden when inactive. */
const PtyPane: React.FC<{
  active: boolean;
  tab: TerminalTab;
  fontSize: number;
  actions: PaneActions;
  onSession: (tabId: string, sessionId: string | null) => void;
  onTitle: (tabId: string, title: string) => void;
  onExit: (tabId: string, code: number | null) => void;
  registerInsert: (tabId: string, fn: ((paths: string[]) => void) | null) => void;
}> = ({ active, tab, fontSize, actions, onSession, onTitle, onExit, registerInsert }) => {
  const tabId = tab.id;
  const hostRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const exitedRef = useRef(false);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const real = terminalAvailable();

  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [noMatch, setNoMatch] = useState(false);
  const [bell, setBell] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [hasSelection, setHasSelection] = useState(false);

  const sendInput = (data: string) => {
    const sid = sessionRef.current;
    if (sid) void terminalWrite(sid, data);
    else if (!real) termRef.current?.write(data);
  };

  const find = (direction: 'next' | 'previous', incremental = false) => {
    const search = searchRef.current;
    if (!search || !query) {
      setNoMatch(false);
      return;
    }
    const opts = { incremental, decorations: SEARCH_DECORATIONS };
    const found = direction === 'next' ? search.findNext(query, opts) : search.findPrevious(query, opts);
    setNoMatch(!found);
  };

  const openFind = () => {
    const term = termRef.current;
    const selected = term?.getSelection().trim();
    if (selected && !selected.includes('\n')) setQuery(selected);
    setFindOpen(true);
    window.setTimeout(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    }, 0);
  };

  const closeFind = () => {
    setFindOpen(false);
    setNoMatch(false);
    searchRef.current?.clearDecorations();
    termRef.current?.focus();
  };

  const copySelection = () => {
    const text = termRef.current?.getSelection();
    if (text) void navigator.clipboard.writeText(text).catch(() => { /* clipboard unavailable */ });
  };

  const pasteClipboard = () => {
    void navigator.clipboard.readText().then(text => {
      if (text) termRef.current?.paste(text);
    }).catch(() => { /* clipboard unavailable */ });
  };

  const clearScreen = () => {
    termRef.current?.clear();
    sendInput('\x0c'); // Ctrl-L: the shell redraws its prompt at the top
  };

  const runKey = (result: KeyResult) => {
    if (result.type === 'send') {
      sendInput(result.data);
      return;
    }
    switch (result.action) {
      case 'copy': copySelection(); break;
      case 'paste': pasteClipboard(); break;
      case 'selectAll': termRef.current?.selectAll(); break;
      case 'clear': clearScreen(); break;
      case 'find': openFind(); break;
      case 'findNext': if (findOpen) find('next'); else openFind(); break;
      case 'findPrevious': if (findOpen) find('previous'); else openFind(); break;
      case 'newTab': actionsRef.current.newTab(); break;
      case 'closeTab': actionsRef.current.closeTab(tabId); break;
      case 'nextTab': actionsRef.current.nextTab(); break;
      case 'previousTab': actionsRef.current.previousTab(); break;
      case 'selectTab': actionsRef.current.selectTab(result.index ?? 0); break;
      case 'zoomIn': actionsRef.current.zoom(1); break;
      case 'zoomOut': actionsRef.current.zoom(-1); break;
      case 'zoomReset': actionsRef.current.zoom('reset'); break;
    }
  };
  const runKeyRef = useRef(runKey);
  runKeyRef.current = runKey;

  useEffect(() => {
    if (!hostRef.current) return;

    const open = (url: string, event?: MouseEvent) => {
      // Like Terminal.app, a link opens with Command-click so a plain click can still select text.
      if (event && !(event.metaKey || event.ctrlKey)) return;
      void terminalOpenUrl(url).catch(() => { /* not an openable link */ });
    };

    const term = new Terminal({
      cursorBlink: false,
      cursorStyle: 'block',
      fontFamily: FONT_FAMILY,
      fontSize,
      lineHeight: 1.2,
      theme: currentXtermTheme(),
      allowProposedApi: true,
      scrollback: 10000,
      macOptionClickForcesSelection: true,
      altClickMovesCursor: true,
      linkHandler: { activate: (event, text) => open(text, event), allowNonHttpProtocols: false },
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = '11';
    term.loadAddon(new WebLinksAddon((event, url) => open(url, event)));
    term.open(hostRef.current);
    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;
    exitedRef.current = false;

    term.attachCustomKeyEventHandler(event => {
      if (event.type !== 'keydown') return true;
      if (exitedRef.current && event.key === 'Enter') {
        event.preventDefault();
        actionsRef.current.restart(tabId);
        return false;
      }
      const result = translateKey(event);
      if (!result) return true;
      event.preventDefault();
      event.stopPropagation();
      runKeyRef.current(result);
      return false;
    });
    term.onSelectionChange(() => setHasSelection(term.hasSelection()));
    term.onTitleChange(title => onTitle(tabId, title));
    term.onBell(() => {
      setBell(true);
      window.setTimeout(() => setBell(false), 140);
    });

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
        const id = await terminalCreate(cols, rows, tab.cwd);
        if (disposed) {
          await terminalKill(id);
          return;
        }
        sessionRef.current = id;
        onSession(tabId, id);

        unlistenData = await onTerminalData(ev => {
          if (ev.id === id) term.write(decodeTerminalData(ev.data));
        });
        unlistenExit = await onTerminalExit(ev => {
          if (ev.id !== id) return;
          sessionRef.current = null;
          onSession(tabId, null);
          if (ev.code === 0) {
            onExit(tabId, 0);
            return;
          }
          exitedRef.current = true;
          term.writeln(
            `\r\n\x1b[90m[Process exited${ev.code != null ? ` with status ${ev.code}` : ''}. Press Enter to start a new shell.]\x1b[0m`,
          );
          onExit(tabId, ev.code);
        });

        term.onData(data => {
          const sid = sessionRef.current;
          if (sid) void terminalWrite(sid, data);
        });
        // Mouse reports for some programs arrive as raw bytes that text would alter.
        term.onBinary(data => {
          const sid = sessionRef.current;
          if (sid) void terminalWriteBinary(sid, data);
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
      searchRef.current = null;
    };
    // One PTY per tab (and per restart) mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, tab.generation, real]);

  // Font size changes (Command + / -) re-fit the grid.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    try {
      fitRef.current?.fit();
    } catch { /* host hidden */ }
  }, [fontSize]);

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

  // The File menu owns a few Command shortcuts. When one arrives with this terminal focused, do the terminal
  // version of it: copy the selection, delete the line, select all. Everything else is ignored.
  useEffect(() => {
    if (!active) return;
    const onMenu = (event: Event) => {
      const action = (event as CustomEvent<FileMenuActionDetail>).detail?.action;
      if (action === 'copy') copySelection();
      else if (action === 'select-all') termRef.current?.selectAll();
      else if (action === 'trash') sendInput('\x15');
    };
    window.addEventListener(TERMINAL_MENU_ACTION_EVENT, onMenu);
    return () => window.removeEventListener(TERMINAL_MENU_ACTION_EVENT, onMenu);
  });

  // Close the right-click menu on any click elsewhere or Escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const menuItems: { label: string; hint?: string; disabled?: boolean; run: () => void }[] = [
    { label: 'Copy', hint: '⌘C', disabled: !hasSelection, run: copySelection },
    { label: 'Paste', hint: '⌘V', run: pasteClipboard },
    { label: 'Select All', hint: '⌘A', run: () => termRef.current?.selectAll() },
    { label: 'Find…', hint: '⌘F', run: openFind },
    { label: 'Clear Screen', hint: '⌘K', run: clearScreen },
    { label: 'New Tab', hint: '⌘T', run: () => actionsRef.current.newTab() },
    { label: 'Close Tab', hint: '⌘W', run: () => actionsRef.current.closeTab(tabId) },
  ];

  return (
    <div
      className={`relative h-full w-full min-h-0 ${bell ? 'ring-2 ring-inset ring-white/30' : ''}`}
      style={{ display: active ? 'block' : 'none' }}
      aria-hidden={!active}
      onContextMenu={e => {
        e.preventDefault();
        const box = e.currentTarget.getBoundingClientRect();
        setMenu({ x: e.clientX - box.left, y: e.clientY - box.top });
      }}
    >
      <div ref={hostRef} className="h-full w-full min-h-0 px-1 py-1" />

      {findOpen && (
        <div
          className="absolute top-1.5 right-2 z-20 flex items-center gap-1 rounded-lg border border-white/15 bg-neutral-900/95 px-1.5 py-1 shadow-xl backdrop-blur"
          onMouseDown={e => e.stopPropagation()}
        >
          <input
            ref={findInputRef}
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              searchRef.current?.findNext(e.target.value, { incremental: true, decorations: SEARCH_DECORATIONS });
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                find(e.shiftKey ? 'previous' : 'next');
              } else if (e.key === 'Escape') {
                e.preventDefault();
                closeFind();
              } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
                e.preventDefault();
                find(e.shiftKey ? 'previous' : 'next');
              }
            }}
            placeholder="Find"
            aria-label="Find in terminal"
            className={`w-32 bg-transparent px-1 text-[11px] text-neutral-100 placeholder-neutral-500 focus:outline-none ${noMatch ? 'text-rose-300' : ''}`}
          />
          <button type="button" onClick={() => find('previous')} className="px-1 text-[11px] text-neutral-300 hover:text-white" title="Previous match (⇧⌘G)" aria-label="Previous match">↑</button>
          <button type="button" onClick={() => find('next')} className="px-1 text-[11px] text-neutral-300 hover:text-white" title="Next match (⌘G)" aria-label="Next match">↓</button>
          <button type="button" onClick={closeFind} className="p-0.5 text-neutral-400 hover:text-white" title="Close find" aria-label="Close find">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {menu && (
        <div
          role="menu"
          className="absolute z-30 min-w-[170px] rounded-lg border border-white/15 bg-neutral-800/95 py-1 text-[11px] text-neutral-100 shadow-2xl backdrop-blur-xl"
          style={{ left: Math.min(menu.x, 140), top: menu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          {menuItems.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setMenu(null);
                item.run();
              }}
              className="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <span>{item.label}</span>
              {item.hint && <span className="font-mono text-[10px] text-neutral-400">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const SystemTerminal: React.FC<SystemTerminalProps> = ({ width = 320, context, visible = true }) => {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => {
    tabSeq = 1;
    return [createTab()];
  });
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [fontSize, setFontSize] = useState(loadFontSize);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const insertFns = useRef(new Map<string, (paths: string[]) => void>());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  const active = tabs.find(t => t.id === activeId) ?? tabs[0];

  useEffect(() => {
    try {
      localStorage.setItem(FONT_KEY, String(fontSize));
    } catch { /* storage unavailable */ }
  }, [fontSize]);

  // Keep each tab's folder name (and the folder a new tab inherits) current while the panel is showing.
  useEffect(() => {
    if (!visible || !terminalAvailable()) return;
    let cancelled = false;
    const refresh = async () => {
      const tab = tabsRef.current.find(t => t.id === activeRef.current);
      if (!tab?.sessionId) return;
      try {
        const cwd = await terminalCwd(tab.sessionId);
        if (cancelled || !cwd) return;
        setTabs(prev => prev.map(t => (
          t.id === tab.id && (t.cwd !== cwd) ? { ...t, cwd, folderTitle: folderName(cwd) } : t
        )));
      } catch { /* the shell may have just exited */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [visible, activeId]);

  const registerInsert = (tabId: string, fn: ((paths: string[]) => void) | null) => {
    if (!fn) insertFns.current.delete(tabId);
    else insertFns.current.set(tabId, fn);
  };

  const onSession = (tabId: string, sessionId: string | null) => {
    setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, sessionId } : t)));
  };

  const onTitle = (tabId: string, title: string) => {
    setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, oscTitle: title.trim() || undefined } : t)));
  };

  const addTab = async () => {
    // A new tab opens in the folder the current one is in, as in Terminal.app.
    const current = tabsRef.current.find(t => t.id === activeRef.current);
    let cwd = current?.cwd;
    if (current?.sessionId) {
      try {
        cwd = (await terminalCwd(current.sessionId)) ?? cwd;
      } catch { /* keep the last known folder */ }
    }
    const tab = createTab({ cwd });
    setTabs(prev => [...prev, tab]);
    setActiveId(tab.id);
  };

  const closeTab = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTabs(prev => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex(t => t.id === id);
      const next = prev.filter(t => t.id !== id);
      if (activeRef.current === id) {
        const fallback = next[Math.max(0, idx - 1)] ?? next[0];
        setActiveId(fallback.id);
      }
      return next;
    });
  };

  const restartTab = (id: string) => {
    setTabs(prev => prev.map(t => (t.id === id ? { ...t, generation: t.generation + 1, oscTitle: undefined } : t)));
  };

  const switchTab = (delta: number) => {
    const list = tabsRef.current;
    const at = list.findIndex(t => t.id === activeRef.current);
    const next = list[(at + delta + list.length) % list.length];
    if (next) setActiveId(next.id);
  };

  const actions: PaneActions = {
    newTab: () => void addTab(),
    closeTab: id => closeTab(id),
    nextTab: () => switchTab(1),
    previousTab: () => switchTab(-1),
    selectTab: index => {
      const tab = tabsRef.current[index];
      if (tab) setActiveId(tab.id);
    },
    zoom: delta => setFontSize(size => (delta === 'reset' ? FONT_DEFAULT : clampFontSize(size + delta))),
    restart: restartTab,
  };

  // A shell that ends cleanly closes its tab; the last tab gets a fresh shell instead.
  const onExit = (tabId: string, code: number | null) => {
    if (code !== 0) return;
    if (tabsRef.current.length > 1) closeTab(tabId);
    else restartTab(tabId);
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

  const label = (tab: TerminalTab) => tab.oscTitle || tab.folderTitle || tab.title;

  return (
    <aside
      style={{ width, display: visible ? undefined : 'none' }}
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
                className={`group flex items-center gap-0.5 max-w-[6.5rem] h-5 px-1.5 rounded text-[9px] font-mono leading-none transition-colors shrink-0 ${
                  selected
                    ? 'bg-[#a3e635]/15 text-[#a3e635] border border-[#a3e635]/35'
                    : 'text-[#a1a1aa] hover:text-[#ececef] hover:bg-white/5 border border-transparent'
                }`}
                title={label(tab)}
              >
                <span className="truncate">{label(tab)}</span>
                {tabs.length > 1 && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => closeTab(tab.id, e)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') closeTab(tab.id);
                    }}
                    className="p-px rounded opacity-50 hover:opacity-100 hover:bg-white/10"
                    aria-label={`Close ${label(tab)}`}
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
            void addTab();
          }}
          className="shrink-0 h-5 w-5 rounded text-[#a3e635] hover:text-[#bef264] bg-[#a3e635]/10 hover:bg-[#a3e635]/20 border border-[#a3e635]/30 flex items-center justify-center transition-colors"
          title="New terminal tab (⌘T)"
          aria-label="New terminal tab"
        >
          <Plus className="w-2.5 h-2.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden">
        {tabs.map(tab => (
          <div
            key={`${tab.id}-${tab.generation}`}
            className="absolute inset-0"
            style={{ visibility: tab.id === activeId ? 'visible' : 'hidden' }}
          >
            <PtyPane
              active={tab.id === activeId && visible}
              tab={tab}
              fontSize={fontSize}
              actions={actions}
              onSession={onSession}
              onTitle={onTitle}
              onExit={onExit}
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
