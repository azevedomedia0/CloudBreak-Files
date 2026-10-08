import React, { useEffect, useRef, useState } from 'react';
import { Plus, Terminal as TerminalIcon, X } from 'lucide-react';
import { quoteShellPath, readDroppedPaths } from '../utils/fileDrag';

export type TerminalContext = {
  cwdLabel: string;
  userName: string;
  isVaultUnlocked: boolean;
  peerId: string | null;
  fileNames: string[];
  libraryNames: string[];
};

type Line =
  | { kind: 'in'; text: string }
  | { kind: 'out'; text: string }
  | { kind: 'err'; text: string };

type TerminalTab = {
  id: string;
  title: string;
  lines: Line[];
  input: string;
  history: string[];
  histIndex: number;
};

interface SystemTerminalProps {
  width?: number;
  context: TerminalContext;
}

const HELP = [
  'Cloudbreak system terminal',
  '',
  '  help       Show this help',
  '  clear      Clear the screen',
  '  pwd        Print working path label',
  '  whoami     Current profile name',
  '  date       Local date/time',
  '  ls         List files in the current view',
  '  libs       List shared libraries',
  '  vault      Vault lock status',
  '  peer       P2P peer id (if known)',
  '  echo …     Print arguments',
  '  cat PATH   Show info for a dropped / listed path',
  '',
  'Drag files from the browser (or Finder) into this panel to insert paths.',
  'Tip: This panel replaces the File Inspector. Use the inspector icon to switch back.',
].join('\n');

const WELCOME: Line[] = [
  { kind: 'out', text: 'Cloudbreak Files — system terminal' },
  { kind: 'out', text: 'Type `help` for commands. Drag files here to insert paths.' },
];

let tabSeq = 1;

function createTab(title?: string): TerminalTab {
  const n = tabSeq++;
  return {
    id: `term-tab-${n}-${Math.random().toString(36).slice(2, 7)}`,
    title: title ?? `Tab ${n}`,
    lines: [...WELCOME],
    input: '',
    history: [],
    histIndex: -1,
  };
}

export const SystemTerminal: React.FC<SystemTerminalProps> = ({ width = 320, context }) => {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => {
    tabSeq = 1;
    return [createTab('Tab 1')];
  });
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [dragOver, setDragOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const active = tabs.find(t => t.id === activeId) ?? tabs[0];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [active?.lines, activeId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeId]);

  const prompt = `${context.userName.split(' ')[0] || 'user'}@cloudbreak:${context.cwdLabel}$`;

  const patchActive = (patch: Partial<TerminalTab> | ((tab: TerminalTab) => Partial<TerminalTab>)) => {
    setTabs(prev =>
      prev.map(tab => {
        if (tab.id !== activeId) return tab;
        const next = typeof patch === 'function' ? patch(tab) : patch;
        return { ...tab, ...next };
      }),
    );
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
    const quoted = paths.map(quoteShellPath).join(' ');
    patchActive(tab => {
      const input = !tab.input
        ? quoted
        : tab.input.endsWith(' ') || tab.input.endsWith('\t')
          ? `${tab.input}${quoted}`
          : `${tab.input} ${quoted}`;
      return {
        input,
        lines: [
          ...tab.lines,
          {
            kind: 'out',
            text: paths.length === 1
              ? `dropped → ${paths[0]}`
              : `dropped ${paths.length} paths`,
          },
        ],
      };
    });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const run = (raw: string) => {
    if (!active) return;
    const text = raw.trim();
    if (!text) return;

    const [cmd, ...args] = text.split(/\s+/);
    const out: Line[] = [{ kind: 'in', text: `${prompt} ${text}` }];

    switch (cmd.toLowerCase()) {
      case 'help':
      case '?':
        out.push({ kind: 'out', text: HELP });
        break;
      case 'clear':
        patchActive({ lines: [], input: '', histIndex: -1 });
        return;
      case 'pwd':
        out.push({ kind: 'out', text: context.cwdLabel });
        break;
      case 'whoami':
        out.push({ kind: 'out', text: context.userName });
        break;
      case 'date':
        out.push({ kind: 'out', text: new Date().toString() });
        break;
      case 'ls':
        out.push({
          kind: 'out',
          text: context.fileNames.length
            ? context.fileNames.join('\n')
            : '(no files in current view)',
        });
        break;
      case 'libs':
        out.push({
          kind: 'out',
          text: context.libraryNames.length
            ? context.libraryNames.join('\n')
            : '(no libraries)',
        });
        break;
      case 'vault':
        out.push({
          kind: 'out',
          text: context.isVaultUnlocked ? 'vault: unlocked' : 'vault: locked',
        });
        break;
      case 'peer':
        out.push({
          kind: 'out',
          text: context.peerId ? `peer ${context.peerId}` : 'peer: (not available)',
        });
        break;
      case 'echo':
        out.push({ kind: 'out', text: args.join(' ') });
        break;
      case 'cat': {
        const path = args.join(' ').replace(/^['"]|['"]$/g, '');
        if (!path) {
          out.push({ kind: 'err', text: 'usage: cat PATH' });
        } else {
          const base = path.split('/').pop() || path;
          const known = context.fileNames.includes(base);
          out.push({
            kind: 'out',
            text: known
              ? `${path}\n  name: ${base}\n  in current view: yes`
              : `${path}\n  (path accepted — open in browser for full metadata)`,
          });
        }
        break;
      }
      default:
        out.push({ kind: 'err', text: `command not found: ${cmd}` });
        break;
    }

    patchActive(tab => ({
      history: tab.history[tab.history.length - 1] === text
        ? tab.history
        : [...tab.history, text],
      histIndex: -1,
      lines: [...tab.lines, ...out],
      input: '',
    }));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!active) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      run(active.input);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!active.history.length) return;
      const next = active.histIndex < 0
        ? active.history.length - 1
        : Math.max(0, active.histIndex - 1);
      patchActive({ histIndex: next, input: active.history[next] ?? '' });
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (active.histIndex < 0) return;
      const next = active.histIndex + 1;
      if (next >= active.history.length) {
        patchActive({ histIndex: -1, input: '' });
      } else {
        patchActive({ histIndex: next, input: active.history[next] ?? '' });
      }
    }
    if (e.key === 'l' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      patchActive({ lines: [] });
    }
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
      className={`relative h-full shrink-0 flex flex-col border-l border-white/10 bg-[#0c0c0e] select-text ${
        dragOver ? 'ring-1 ring-inset ring-lime-400/50' : ''
      }`}
      onClick={() => inputRef.current?.focus()}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="terminal-panel-header h-10 px-2 flex items-center gap-1.5 border-b border-white/10 bg-neutral-950/80 shrink-0 select-none">
        <TerminalIcon className="w-3.5 h-3.5 text-lime-400 shrink-0 ml-1" />
        <span className="text-[11px] font-semibold text-neutral-200 tracking-tight shrink-0">Terminal</span>

        <div className="flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto mx-1">
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
                className={`group flex items-center gap-1 max-w-[7.5rem] h-7 px-2 rounded-md text-[10px] font-mono transition-colors shrink-0 ${
                  selected
                    ? 'bg-lime-500/15 text-lime-200 border border-lime-400/30'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5 border border-transparent'
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
                    className="p-0.5 rounded opacity-60 hover:opacity-100 hover:bg-white/10"
                    aria-label={`Close ${tab.title}`}
                  >
                    <X className="w-2.5 h-2.5" />
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
          className="shrink-0 h-7 px-2 rounded-md text-[10px] font-medium text-lime-300/90 hover:text-lime-200 bg-lime-500/10 hover:bg-lime-500/20 border border-lime-400/25 flex items-center gap-1 transition-colors"
          title="New terminal tab"
          aria-label="New terminal tab"
        >
          <Plus className="w-3 h-3" />
          New Tab
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
        {active.lines.map((line, i) => (
          <pre
            key={`${active.id}-${i}`}
            className={`whitespace-pre-wrap break-words mb-0.5 ${
              line.kind === 'in'
                ? 'text-lime-300/90'
                : line.kind === 'err'
                  ? 'text-red-400'
                  : 'text-neutral-300'
            }`}
          >
            {line.text}
          </pre>
        ))}
        <div className="flex items-start gap-1.5 text-neutral-200">
          <span className="text-lime-400 shrink-0 select-none">{prompt}</span>
          <input
            ref={inputRef}
            value={active.input}
            onChange={e => patchActive({ input: e.target.value })}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-neutral-100 caret-lime-400"
            aria-label="Terminal input"
          />
        </div>
        <div ref={bottomRef} />
      </div>

      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-lime-500/10 border border-lime-400/40 m-1 rounded-lg">
          <span className="text-xs font-medium text-lime-200 bg-black/70 px-3 py-1.5 rounded-lg border border-lime-400/30">
            Drop files to insert paths
          </span>
        </div>
      )}
    </aside>
  );
};
