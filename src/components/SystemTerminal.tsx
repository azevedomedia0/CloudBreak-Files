import React, { useEffect, useRef, useState } from 'react';
import { Check, Palette, Plus, Rows2, Terminal as TerminalIcon, X } from '@/src/icons';
import { Terminal, type IMarker } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { quoteShellPath, readDroppedPaths } from '../utils/fileDrag';
import { TERMINAL_MENU_ACTION_EVENT, type FileMenuActionDetail } from '../utils/fileMenuBus';
import {
  clampFontSize, FONT_DEFAULT, translateKey, type KeyResult, type PaneDirection,
} from '../utils/terminalKeys';
import {
  MAX_PANES_PER_TAB, neighbourPane, paneIds, paneRects, removePane, splitPane,
  type PaneLayout, type SplitDirection,
} from '../utils/terminalLayout';
import {
  loadDefaultProfileId, profileById, profileTheme, saveDefaultProfileId, TERMINAL_PROFILES,
  type TerminalProfile,
} from '../utils/terminalProfiles';
import {
  joinBufferRows, parseSavedSession, RESTORE_LINES, sanitizeRestoredText, SESSION_VERSION,
  type SavedSession,
} from '../utils/terminalSession';
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
  terminalSessionClear,
  terminalSessionLoad,
  terminalSessionSave,
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

/** One shell. A tab holds one or more, split into rows and columns. */
type PaneState = {
  id: string;
  sessionId: string | null;
  /** Title the shell set itself (OSC 0/2). */
  oscTitle?: string;
  /** Name of the shell's current folder, refreshed while the panel is open. */
  folderTitle?: string;
  /** Where the shell starts and restarts. */
  cwd?: string;
  /** Bumped to start a fresh shell in the same pane. */
  generation: number;
  /** Output from the last session, shown above the new shell. */
  restoredText?: string;
  restoredAt?: string;
};

type TerminalTab = {
  id: string;
  layout: PaneLayout;
  panes: PaneState[];
  focusedPane: string;
  profileId: string;
};

interface SystemTerminalProps {
  width?: number;
  context: TerminalContext;
  /** The panel stays mounted while hidden so shells keep running; false hides it. */
  visible?: boolean;
  /** Reopen tabs, splits, folders and recent output from the last time (Preferences). */
  restoreSessions?: boolean;
  /** Hide the panel (the close button at the header's left edge). */
  onClose?: () => void;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createPane(opts?: { cwd?: string }): PaneState {
  return { id: uid('pane'), sessionId: null, cwd: opts?.cwd, generation: 0 };
}

function createTab(opts: { cwd?: string; profileId: string }): TerminalTab {
  const pane = createPane({ cwd: opts.cwd });
  return { id: uid('tab'), layout: { pane: pane.id }, panes: [pane], focusedPane: pane.id, profileId: opts.profileId };
}

function tabsFromSession(session: SavedSession): TerminalTab[] {
  return session.tabs.map(t => ({
    id: t.id,
    layout: t.layout,
    focusedPane: t.focusedPane,
    profileId: t.profileId,
    panes: t.panes.map(p => ({
      id: p.id,
      sessionId: null,
      cwd: p.cwd,
      oscTitle: p.title,
      folderTitle: p.cwd ? folderName(p.cwd) : undefined,
      generation: 0,
      restoredText: p.text,
      restoredAt: session.savedAt,
    })),
  }));
}

const FONT_KEY = 'cloudbreak.terminal.fontSize';
const FONT_FAMILY = "'SF Mono', SFMono-Regular, Menlo, Monaco, 'JetBrains Mono', Consolas, monospace";
const SAVE_EVERY_MS = 10_000;
const MARK_COLOR = '#a3e635';
const FAILED_MARK_COLOR = '#f87171';

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

function paneLabel(pane: PaneState | undefined): string {
  return pane?.oscTitle || pane?.folderTitle || 'zsh';
}

/** What a pane can ask the whole terminal to do. */
interface PaneActions {
  newTab: () => void;
  close: (paneId: string) => void;
  nextTab: () => void;
  previousTab: () => void;
  selectTab: (index: number) => void;
  split: (paneId: string, dir: SplitDirection) => void;
  cyclePane: (delta: number) => void;
  focusDirection: (paneId: string, dir: PaneDirection) => void;
  focusPane: (paneId: string) => void;
  zoom: (delta: number | 'reset') => void;
  restart: (paneId: string) => void;
}

/** What the terminal can ask of a pane. */
interface PaneHandle {
  insert: (paths: string[]) => void;
  /** Recent output as plain text, for session restore. */
  snapshot: () => string;
}

const SEARCH_DECORATIONS = {
  matchBackground: '#a3e63540',
  matchBorder: '#a3e63566',
  matchOverviewRuler: '#a3e635',
  activeMatchBackground: '#a3e63590',
  activeMatchBorder: '#bef264',
  activeMatchColorOverviewRuler: '#bef264',
};

/** One xterm + PTY session bound to a pane. */
const PtyPane: React.FC<{
  pane: PaneState;
  profile: TerminalProfile;
  /** Its tab is the one showing, in a visible panel. */
  shown: boolean;
  /** It is the pane typing goes to. */
  focused: boolean;
  /** Its tab has more than one pane (dim the others). */
  split: boolean;
  fontSize: number;
  actions: PaneActions;
  onSession: (paneId: string, sessionId: string | null) => void;
  onTitle: (paneId: string, title: string) => void;
  onExit: (paneId: string, code: number | null) => void;
  onOutput: () => void;
  registerPane: (paneId: string, handle: PaneHandle | null) => void;
}> = ({ pane, profile, shown, focused, split, fontSize, actions, onSession, onTitle, onExit, onOutput, registerPane }) => {
  const paneId = pane.id;
  const hostRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const exitedRef = useRef(false);
  const marksRef = useRef<IMarker[]>([]);
  /** The shell reports its own prompts (OSC 133), so Return no longer marks lines. */
  const shellMarksRef = useRef(false);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const onOutputRef = useRef(onOutput);
  onOutputRef.current = onOutput;
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

  /** Mark the cursor's line as a prompt: a tick in the scrollbar, and a stop for ⌘↑ / ⌘↓. */
  const addMark = () => {
    const term = termRef.current;
    if (!term || term.buffer.active.type !== 'normal') return;
    const marker = term.registerMarker(0);
    if (!marker) return;
    const last = marksRef.current[marksRef.current.length - 1];
    if (last && !last.isDisposed && last.line === marker.line) {
      marker.dispose();
      return;
    }
    marksRef.current.push(marker);
    marker.onDispose(() => {
      marksRef.current = marksRef.current.filter(m => m !== marker);
    });
    term.registerDecoration({ marker, overviewRulerOptions: { color: MARK_COLOR, position: 'left' } });
  };

  /** ⌘↑ / ⌘↓: scroll to the previous or next prompt, and flash its line. */
  const jumpToMark = (direction: 'previous' | 'next') => {
    const term = termRef.current;
    if (!term) return;
    const top = term.buffer.active.viewportY;
    const lines = marksRef.current.filter(m => !m.isDisposed).map(m => m.line);
    const target = direction === 'previous'
      ? Math.max(-1, ...lines.filter(l => l < top))
      : Math.min(Infinity, ...lines.filter(l => l > top));
    if (target < 0) {
      term.scrollToTop();
      return;
    }
    if (!Number.isFinite(target)) {
      term.scrollToBottom();
      return;
    }
    term.scrollToLine(target);
    const marker = marksRef.current.find(m => m.line === target);
    if (!marker) return;
    const flash = term.registerDecoration({ marker, width: term.cols, backgroundColor: '#a3e635', layer: 'bottom' });
    flash?.onRender(el => { el.style.opacity = '0.18'; });
    window.setTimeout(() => flash?.dispose(), 500);
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
      case 'close': actionsRef.current.close(paneId); break;
      case 'nextTab': actionsRef.current.nextTab(); break;
      case 'previousTab': actionsRef.current.previousTab(); break;
      case 'selectTab': actionsRef.current.selectTab(result.index ?? 0); break;
      case 'splitDown': actionsRef.current.split(paneId, 'column'); break;
      case 'splitRight': actionsRef.current.split(paneId, 'row'); break;
      case 'nextPane': actionsRef.current.cyclePane(1); break;
      case 'previousPane': actionsRef.current.cyclePane(-1); break;
      case 'focusPane': if (result.direction) actionsRef.current.focusDirection(paneId, result.direction); break;
      case 'previousMark': jumpToMark('previous'); break;
      case 'nextMark': jumpToMark('next'); break;
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

    const startProfile = profileRef.current;
    const term = new Terminal({
      cursorBlink: startProfile.cursorBlink,
      cursorStyle: startProfile.cursorStyle,
      fontFamily: FONT_FAMILY,
      fontSize,
      lineHeight: 1.2,
      theme: profileTheme(startProfile),
      allowProposedApi: true,
      scrollback: 10000,
      macOptionClickForcesSelection: true,
      altClickMovesCursor: true,
      // A narrow strip beside the scrollbar shows prompt marks and search matches.
      overviewRuler: { width: 6 },
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
    marksRef.current = [];
    shellMarksRef.current = false;

    term.attachCustomKeyEventHandler(event => {
      if (event.type !== 'keydown') return true;
      if (exitedRef.current && event.key === 'Enter') {
        event.preventDefault();
        actionsRef.current.restart(paneId);
        return false;
      }
      // Without shell integration, Return marks the line it was pressed on (Terminal.app does the same).
      if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey && !shellMarksRef.current) {
        addMark();
      }
      const result = translateKey(event);
      if (!result) return true;
      event.preventDefault();
      event.stopPropagation();
      runKeyRef.current(result);
      return false;
    });
    // Shell integration (OSC 133, as iTerm2 and VS Code emit it): A starts a prompt, D;<status> ends a command.
    term.parser.registerOscHandler(133, data => {
      const [kind, status] = data.split(';');
      if (kind === 'A') {
        shellMarksRef.current = true;
        addMark();
      } else if (kind === 'D' && status && status !== '0') {
        const last = marksRef.current[marksRef.current.length - 1];
        if (last && !last.isDisposed) {
          term.registerDecoration({ marker: last, overviewRulerOptions: { color: FAILED_MARK_COLOR, position: 'left' } });
        }
      }
      return true;
    });
    term.onSelectionChange(() => setHasSelection(term.hasSelection()));
    term.onTitleChange(title => onTitle(paneId, title));
    term.onBell(() => {
      setBell(true);
      window.setTimeout(() => setBell(false), 140);
    });
    term.textarea?.addEventListener('focus', () => actionsRef.current.focusPane(paneId));

    // The Cloudbreak profile follows the app's appearance.
    const themeObserver = new MutationObserver(() => {
      term.options.theme = profileTheme(profileRef.current);
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

      if (pane.generation === 0 && pane.restoredText) {
        term.write(pane.restoredText.replace(/\n/g, '\r\n'));
        const when = pane.restoredAt ? new Date(pane.restoredAt) : null;
        const stamp = when && !Number.isNaN(when.getTime()) ? ` ${when.toLocaleString()}` : '';
        term.write(`\r\n\x1b[90m── Restored${stamp} ──\x1b[0m\r\n`);
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
        const id = await terminalCreate(cols, rows, pane.cwd);
        if (disposed) {
          await terminalKill(id);
          return;
        }
        sessionRef.current = id;
        onSession(paneId, id);

        unlistenData = await onTerminalData(ev => {
          if (ev.id !== id) return;
          term.write(decodeTerminalData(ev.data));
          onOutputRef.current();
        });
        unlistenExit = await onTerminalExit(ev => {
          if (ev.id !== id) return;
          sessionRef.current = null;
          onSession(paneId, null);
          if (ev.code === 0) {
            onExit(paneId, 0);
            return;
          }
          exitedRef.current = true;
          term.writeln(
            `\r\n\x1b[90m[Process exited${ev.code != null ? ` with status ${ev.code}` : ''}. Press Enter to start a new shell.]\x1b[0m`,
          );
          onExit(paneId, ev.code);
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

    registerPane(paneId, {
      insert: (paths: string[]) => {
        if (!paths.length) return;
        const quoted = paths.map(quoteShellPath).join(' ');
        const sid = sessionRef.current;
        if (sid) {
          void terminalWrite(sid, quoted);
          return;
        }
        term.write(quoted);
      },
      snapshot: () => {
        const buffer = term.buffer.normal;
        const rows: { text: string; isWrapped: boolean }[] = [];
        // Twice the kept lines, so soft-wrapped rows still add up to enough whole lines.
        for (let i = Math.max(0, buffer.length - RESTORE_LINES * 2); i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) rows.push({ text: line.translateToString(true), isWrapped: line.isWrapped });
        }
        return sanitizeRestoredText(joinBufferRows(rows));
      },
    });

    return () => {
      disposed = true;
      themeObserver.disconnect();
      registerPane(paneId, null);
      unlistenData?.();
      unlistenExit?.();
      const sid = sessionRef.current;
      sessionRef.current = null;
      onSession(paneId, null);
      if (sid) void terminalKill(sid);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      marksRef.current = [];
    };
    // One PTY per pane (and per restart) mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId, pane.generation, real]);

  // Font size changes (Command + / -) re-fit the grid.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    try {
      fitRef.current?.fit();
    } catch { /* host hidden */ }
  }, [fontSize]);

  // A new profile for the tab: colours and cursor.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = profileTheme(profile);
    term.options.cursorStyle = profile.cursorStyle;
    term.options.cursorBlink = profile.cursorBlink;
  }, [profile]);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => {
      const term = termRef.current;
      try {
        fitRef.current?.fit();
      } catch {
        /* ignore */
      }
      const sid = sessionRef.current;
      if (sid && term) void terminalResize(sid, term.cols, term.rows);
    }, 30);
    return () => window.clearTimeout(timer);
  }, [shown]);

  useEffect(() => {
    if (!focused) return;
    const timer = window.setTimeout(() => termRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [focused]);

  // Panes resize when the panel does and when a neighbour is split or closed.
  useEffect(() => {
    if (!shown || !hostRef.current) return;
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
  }, [shown]);

  // The File menu owns a few Command shortcuts. When one arrives with this pane focused, do the terminal
  // version of it: copy the selection, delete the line, select all, and ⌘D splits.
  useEffect(() => {
    if (!focused) return;
    const onMenu = (event: Event) => {
      const action = (event as CustomEvent<FileMenuActionDetail>).detail?.action;
      if (action === 'copy') copySelection();
      else if (action === 'select-all') termRef.current?.selectAll();
      else if (action === 'trash') sendInput('\x15');
      else if (action === 'duplicate') actionsRef.current.split(paneId, 'column');
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

  const menuItems: ({ label: string; hint?: string; disabled?: boolean; run: () => void } | 'separator')[] = [
    { label: 'Copy', hint: '⌘C', disabled: !hasSelection, run: copySelection },
    { label: 'Paste', hint: '⌘V', run: pasteClipboard },
    { label: 'Select All', hint: '⌘A', run: () => termRef.current?.selectAll() },
    { label: 'Find…', hint: '⌘F', run: openFind },
    { label: 'Clear Screen', hint: '⌘K', run: clearScreen },
    'separator',
    { label: 'Previous Prompt', hint: '⌘↑', run: () => jumpToMark('previous') },
    { label: 'Next Prompt', hint: '⌘↓', run: () => jumpToMark('next') },
    'separator',
    { label: 'Split Pane Down', hint: '⌘D', run: () => actionsRef.current.split(paneId, 'column') },
    { label: 'Split Pane Right', hint: '⇧⌘D', run: () => actionsRef.current.split(paneId, 'row') },
    { label: 'New Tab', hint: '⌘T', run: () => actionsRef.current.newTab() },
    { label: split ? 'Close Pane' : 'Close Tab', hint: '⌘W', run: () => actionsRef.current.close(paneId) },
  ];

  const opaque = profile.theme?.background;

  return (
    <div
      className={`relative h-full w-full min-h-0 ${bell ? 'ring-2 ring-inset ring-white/30' : ''}`}
      style={{ display: shown ? 'block' : 'none', background: opaque }}
      aria-hidden={!shown}
      onMouseDown={() => actionsRef.current.focusPane(paneId)}
      onContextMenu={e => {
        e.preventDefault();
        const box = e.currentTarget.getBoundingClientRect();
        setMenu({ x: e.clientX - box.left, y: e.clientY - box.top });
      }}
    >
      <div
        ref={hostRef}
        className="h-full w-full min-h-0 px-1 py-1 transition-opacity"
        style={{ opacity: split && !focused ? 0.62 : 1 }}
      />

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
          className="absolute z-30 min-w-[180px] rounded-lg border border-white/15 bg-neutral-800/95 py-1 text-[11px] text-neutral-100 shadow-2xl backdrop-blur-xl"
          style={{ left: Math.min(menu.x, 130), top: Math.min(menu.y, Math.max(0, (hostRef.current?.clientHeight ?? 400) - 330)) }}
          onMouseDown={e => e.stopPropagation()}
        >
          {menuItems.map((item, i) => (item === 'separator' ? (
            <div key={`sep-${i}`} className="my-1 h-px bg-white/10" role="separator" />
          ) : (
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
          )))}
        </div>
      )}
    </div>
  );
};

export const SystemTerminal: React.FC<SystemTerminalProps> = ({
  width = 320, context, visible = true, restoreSessions = true, onClose,
}) => {
  const restoring = restoreSessions && terminalAvailable();
  const [defaultProfileId, setDefaultProfileId] = useState(loadDefaultProfileId);
  const [tabs, setTabs] = useState<TerminalTab[]>(() => (restoring ? [] : [createTab({ profileId: loadDefaultProfileId() })]));
  const [activeId, setActiveId] = useState(() => tabs[0]?.id ?? '');
  const [ready, setReady] = useState(!restoring);
  const [fontSize, setFontSize] = useState(loadFontSize);
  const [dragOver, setDragOver] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const dragDepth = useRef(0);
  const paneHandles = useRef(new Map<string, PaneHandle>());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const dirtyRef = useRef(false);

  const active = tabs.find(t => t.id === activeId) ?? tabs[0];

  // Reopen last time's tabs, splits and output before any shell starts.
  useEffect(() => {
    if (!restoring) return;
    let cancelled = false;
    void terminalSessionLoad()
      .catch(() => null)
      .then(json => {
        if (cancelled) return;
        const session = parseSavedSession(json);
        const restored = session ? tabsFromSession(session) : [createTab({ profileId: loadDefaultProfileId() })];
        setTabs(restored);
        setActiveId(session?.activeTab ?? restored[0].id);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
    // Only at mount: turning restore on later applies from the next launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FONT_KEY, String(fontSize));
    } catch { /* storage unavailable */ }
  }, [fontSize]);

  useEffect(() => {
    dirtyRef.current = true;
  }, [tabs, activeId]);

  // Save the session every few seconds while something changed, and when the page goes away.
  useEffect(() => {
    if (!terminalAvailable()) return;
    if (!restoreSessions) {
      void terminalSessionClear().catch(() => { /* nothing saved */ });
      return;
    }
    if (!ready) return;
    let saving = false;
    const save = async () => {
      if (saving || !dirtyRef.current) return;
      saving = true;
      dirtyRef.current = false;
      try {
        const now = tabsRef.current;
        const cwds = new Map<string, string>();
        await Promise.all(now.flatMap(t => t.panes).map(async p => {
          if (!p.sessionId) return;
          try {
            const cwd = await terminalCwd(p.sessionId);
            if (cwd) cwds.set(p.id, cwd);
          } catch { /* shell just exited */ }
        }));
        const session: SavedSession = {
          version: SESSION_VERSION,
          savedAt: new Date().toISOString(),
          activeTab: activeRef.current,
          tabs: now.map(t => ({
            id: t.id,
            profileId: t.profileId,
            focusedPane: t.focusedPane,
            layout: t.layout,
            panes: t.panes.map(p => ({
              id: p.id,
              cwd: cwds.get(p.id) ?? p.cwd,
              title: p.oscTitle,
              text: paneHandles.current.get(p.id)?.snapshot(),
            })),
          })),
        };
        await terminalSessionSave(JSON.stringify(session));
      } catch {
        dirtyRef.current = true;
      } finally {
        saving = false;
      }
    };
    const timer = window.setInterval(() => void save(), SAVE_EVERY_MS);
    const onHide = () => {
      dirtyRef.current = true;
      void save();
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  }, [restoreSessions, ready]);

  const updatePane = (paneId: string, patch: (p: PaneState) => PaneState) => {
    setTabs(prev => prev.map(t => (
      t.panes.some(p => p.id === paneId) ? { ...t, panes: t.panes.map(p => (p.id === paneId ? patch(p) : p)) } : t
    )));
  };

  const focusedPaneOf = (tab: TerminalTab | undefined) => tab?.panes.find(p => p.id === tab.focusedPane) ?? tab?.panes[0];

  // Keep the focused pane's folder name (and the folder a new tab or split inherits) current while showing.
  const activeFocusedPane = active?.focusedPane;
  useEffect(() => {
    if (!visible || !terminalAvailable()) return;
    let cancelled = false;
    const refresh = async () => {
      const pane = focusedPaneOf(tabsRef.current.find(t => t.id === activeRef.current));
      if (!pane?.sessionId) return;
      try {
        const cwd = await terminalCwd(pane.sessionId);
        if (cancelled || !cwd || cwd === pane.cwd) return;
        updatePane(pane.id, p => ({ ...p, cwd, folderTitle: folderName(cwd) }));
      } catch { /* the shell may have just exited */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [visible, activeId, activeFocusedPane]);

  const registerPane = (paneId: string, handle: PaneHandle | null) => {
    if (!handle) paneHandles.current.delete(paneId);
    else paneHandles.current.set(paneId, handle);
  };

  const onSession = (paneId: string, sessionId: string | null) => {
    updatePane(paneId, p => ({ ...p, sessionId }));
  };

  const onTitle = (paneId: string, title: string) => {
    updatePane(paneId, p => ({ ...p, oscTitle: title.trim() || undefined }));
  };

  /** The folder a pane's shell is in now, for a new tab or split to start in. */
  const currentCwd = async (pane: PaneState | undefined): Promise<string | undefined> => {
    let cwd = pane?.cwd;
    if (pane?.sessionId) {
      try {
        cwd = (await terminalCwd(pane.sessionId)) ?? cwd;
      } catch { /* keep the last known folder */ }
    }
    return cwd;
  };

  const addTab = async () => {
    // A new tab opens in the folder the current pane is in, as in Terminal.app.
    const cwd = await currentCwd(focusedPaneOf(tabsRef.current.find(t => t.id === activeRef.current)));
    const tab = createTab({ cwd, profileId: defaultProfileId });
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

  const splitFocused = async (paneId: string, dir: SplitDirection) => {
    const tab = tabsRef.current.find(t => t.panes.some(p => p.id === paneId));
    if (!tab || tab.panes.length >= MAX_PANES_PER_TAB) return;
    const cwd = await currentCwd(tab.panes.find(p => p.id === paneId));
    const added = createPane({ cwd });
    setTabs(prev => prev.map(t => (t.id === tab.id ? {
      ...t,
      layout: splitPane(t.layout, paneId, added.id, dir),
      panes: [...t.panes, added],
      focusedPane: added.id,
    } : t)));
  };

  /** Close a pane; its tab goes with its last pane (the last tab stays). */
  const closePane = (paneId: string) => {
    const tab = tabsRef.current.find(t => t.panes.some(p => p.id === paneId));
    if (!tab) return;
    if (tab.panes.length <= 1) {
      closeTab(tab.id);
      return;
    }
    setTabs(prev => prev.map(t => {
      if (t.id !== tab.id) return t;
      const order = paneIds(t.layout);
      const layout = removePane(t.layout, paneId) ?? t.layout;
      const remaining = paneIds(layout);
      const at = order.indexOf(paneId);
      const focusedPane = t.focusedPane === paneId ? remaining[Math.max(0, at - 1)] ?? remaining[0] : t.focusedPane;
      return { ...t, layout, panes: t.panes.filter(p => p.id !== paneId), focusedPane };
    }));
  };

  const focusPane = (paneId: string) => {
    setTabs(prev => {
      const tab = prev.find(t => t.panes.some(p => p.id === paneId));
      if (!tab || tab.focusedPane === paneId) return prev;
      return prev.map(t => (t.id === tab.id ? { ...t, focusedPane: paneId } : t));
    });
  };

  const cyclePane = (delta: number) => {
    const tab = tabsRef.current.find(t => t.id === activeRef.current);
    if (!tab) return;
    const order = paneIds(tab.layout);
    const at = order.indexOf(tab.focusedPane);
    focusPane(order[(at + delta + order.length) % order.length]);
  };

  const focusDirection = (paneId: string, dir: PaneDirection) => {
    const tab = tabsRef.current.find(t => t.panes.some(p => p.id === paneId));
    if (!tab) return;
    const next = neighbourPane(paneRects(tab.layout), paneId, dir);
    if (next) focusPane(next);
  };

  const restartPane = (paneId: string) => {
    updatePane(paneId, p => ({ ...p, generation: p.generation + 1, oscTitle: undefined }));
  };

  const switchTab = (delta: number) => {
    const list = tabsRef.current;
    const at = list.findIndex(t => t.id === activeRef.current);
    const next = list[(at + delta + list.length) % list.length];
    if (next) setActiveId(next.id);
  };

  const chooseProfile = (profileId: string) => {
    setTabs(prev => prev.map(t => (t.id === activeRef.current ? { ...t, profileId } : t)));
    // The last profile chosen is used for new tabs.
    setDefaultProfileId(profileId);
    saveDefaultProfileId(profileId);
    setProfileMenu(false);
  };

  const actions: PaneActions = {
    newTab: () => void addTab(),
    close: closePane,
    nextTab: () => switchTab(1),
    previousTab: () => switchTab(-1),
    selectTab: index => {
      const tab = tabsRef.current[index];
      if (tab) setActiveId(tab.id);
    },
    split: (paneId, dir) => void splitFocused(paneId, dir),
    cyclePane,
    focusDirection,
    focusPane,
    zoom: delta => setFontSize(size => (delta === 'reset' ? FONT_DEFAULT : clampFontSize(size + delta))),
    restart: restartPane,
  };

  // A shell that ends cleanly closes its pane; the very last one gets a fresh shell instead.
  const onExit = (paneId: string, code: number | null) => {
    if (code !== 0) return;
    const tabsNow = tabsRef.current;
    const tab = tabsNow.find(t => t.panes.some(p => p.id === paneId));
    if (tab && tab.panes.length === 1 && tabsNow.length === 1) restartPane(paneId);
    else closePane(paneId);
  };

  const onOutput = () => {
    dirtyRef.current = true;
  };

  const insertPaths = (paths: string[]) => {
    const pane = focusedPaneOf(active);
    if (!paths.length || !pane) return;
    paneHandles.current.get(pane.id)?.insert(paths);
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

  // Close the profile menu on any click elsewhere or Escape.
  useEffect(() => {
    if (!profileMenu) return;
    const close = () => setProfileMenu(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [profileMenu]);

  const label = (tab: TerminalTab) => paneLabel(focusedPaneOf(tab));
  const headerButton = 'shrink-0 h-5 w-5 rounded flex items-center justify-center transition-colors';

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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close terminal"
          title="Close terminal"
          className="shrink-0 p-1 rounded-md text-neutral-400 hover:text-neutral-100 hover:bg-white/10 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
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
                title={tab.panes.length > 1 ? `${label(tab)} (${tab.panes.length} panes)` : label(tab)}
              >
                <span className="truncate">{label(tab)}</span>
                {tab.panes.length > 1 && <span className="opacity-60">·{tab.panes.length}</span>}
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
          disabled={!active || active.panes.length >= MAX_PANES_PER_TAB}
          onClick={e => {
            e.stopPropagation();
            if (active) void splitFocused(active.focusedPane, 'column');
          }}
          className={`${headerButton} text-neutral-400 hover:text-neutral-100 hover:bg-white/10 disabled:opacity-30`}
          title="Split pane (⌘D; ⇧⌘D side by side)"
          aria-label="Split pane"
        >
          <Rows2 className="w-3 h-3" />
        </button>
        <div className="relative shrink-0">
          <button
            type="button"
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setProfileMenu(open => !open)}
            className={`${headerButton} ${profileMenu ? 'text-neutral-100 bg-white/10' : 'text-neutral-400 hover:text-neutral-100 hover:bg-white/10'}`}
            title="Profile"
            aria-label="Terminal profile"
            aria-expanded={profileMenu}
          >
            <Palette className="w-3 h-3" />
          </button>
          {profileMenu && active && (
            <div
              role="menu"
              className="absolute right-0 top-6 z-40 w-44 rounded-lg border border-white/15 bg-neutral-800/95 py-1 text-[11px] text-neutral-100 shadow-2xl backdrop-blur-xl"
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="px-3 pt-0.5 pb-1 text-[9px] uppercase tracking-wider text-neutral-500">Profile for this tab</div>
              {TERMINAL_PROFILES.map(p => (
                <button
                  key={p.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active.profileId === p.id}
                  onClick={() => chooseProfile(p.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/10"
                >
                  <span
                    className="w-4 h-3 rounded-sm border border-white/20 shrink-0 flex items-center justify-center text-[7px] font-mono font-bold"
                    style={{ background: p.swatch[0], color: p.swatch[1] }}
                    aria-hidden
                  >
                    a
                  </span>
                  <span className="flex-1">{p.name}</span>
                  {active.profileId === p.id && <Check className="w-3 h-3 text-[#a3e635]" />}
                </button>
              ))}
              <div className="px-3 pt-1 pb-0.5 text-[9px] text-neutral-500">New tabs use the last profile chosen.</div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            void addTab();
          }}
          className={`${headerButton} text-[#a3e635] hover:text-[#bef264] bg-[#a3e635]/10 hover:bg-[#a3e635]/20 border border-[#a3e635]/30`}
          title="New terminal tab (⌘T)"
          aria-label="New terminal tab"
        >
          <Plus className="w-2.5 h-2.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden">
        {ready && tabs.map(tab => {
          const tabShown = tab.id === activeId && visible;
          const rects = paneRects(tab.layout);
          const profile = profileById(tab.profileId);
          const split = tab.panes.length > 1;
          return (
            <div
              key={tab.id}
              className="absolute inset-0"
              style={{ visibility: tab.id === activeId ? 'visible' : 'hidden' }}
            >
              {/* Panes are rendered flat and placed by the layout, so a split or close never remounts a shell. */}
              {tab.panes.map(pane => {
                const r = rects.get(pane.id) ?? { left: 0, top: 0, width: 1, height: 1 };
                return (
                  <div
                    key={`${pane.id}-${pane.generation}`}
                    className="absolute"
                    style={{
                      left: `${r.left * 100}%`,
                      top: `${r.top * 100}%`,
                      width: `${r.width * 100}%`,
                      height: `${r.height * 100}%`,
                      borderLeft: r.left > 0 ? '1px solid rgba(255,255,255,0.12)' : undefined,
                      borderTop: r.top > 0 ? '1px solid rgba(255,255,255,0.12)' : undefined,
                    }}
                  >
                    <PtyPane
                      pane={pane}
                      profile={profile}
                      shown={tabShown}
                      focused={tabShown && tab.focusedPane === pane.id}
                      split={split}
                      fontSize={fontSize}
                      actions={actions}
                      onSession={onSession}
                      onTitle={onTitle}
                      onExit={onExit}
                      onOutput={onOutput}
                      registerPane={registerPane}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
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
