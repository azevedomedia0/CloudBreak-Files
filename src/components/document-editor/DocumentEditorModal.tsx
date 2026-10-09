import React, { useEffect, useRef, useState } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, AlignVerticalSpaceAround, Bold, ChevronDown, ChevronUp,
  Download, FileText, Highlighter, ImagePlus, Italic, Link, List, ListOrdered, Minus,
  PanelLeft, Plus, Printer, Redo2, Save, Search, ShieldAlert, Table2,
  Underline, Undo2, X, ZoomIn, ZoomOut,
} from '@/src/icons';
import { FileItem } from '../../types';
import {
  countWords, editorHtmlFromFile, fileExtension, formatBadgeClasses, htmlWithoutFindMarks, isPlainTextDocument,
} from '../../utils/documentKind';
import {
  DEFAULT_DOC_FONT, ensureGoogleFontLoaded, fontStackFor, normalizeFontFamily,
} from '../../utils/googleFonts';
import { FontPicker } from './FontPicker';

interface DocumentEditorModalProps {
  file: FileItem;
  isOpen: boolean;
  onClose: () => void;
  onSave: (file: FileItem) => void;
  /** Fill the main browser pane instead of covering the whole window. */
  embedded?: boolean;
}

const ZOOMS = [50, 75, 100, 125, 150, 200];
/** US Letter height at 96dpi — matches `.doc-page` min-height. */
const PAGE_HEIGHT_PX = 1056;
const LINE_SPACINGS = [
  { id: '1', label: 'Single', value: '1.25' },
  { id: '1.15', label: '1.15', value: '1.45' },
  { id: '1.5', label: '1.5', value: '1.75' },
  { id: '2', label: 'Double', value: '2.2' },
] as const;
const FONT_SIZES = ['12', '14', '16', '18', '20', '24', '28', '32', '40'] as const;
const DEFAULT_SIZE = '16';
const DEFAULT_COLOR = '#e5e5e5';
const DEFAULT_HIGHLIGHT = '#facc15';

const toolButton =
  'w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-neutral-300 hover:text-neutral-100 hover:bg-white/8 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-neutral-300 transition-colors';
const toolOn = 'bg-orange-500/20 text-orange-200 hover:bg-orange-500/25 hover:text-orange-100';
const fieldClass =
  'h-8 px-2 rounded-lg bg-neutral-950/80 border border-white/10 text-xs text-neutral-100 focus:outline-none focus:border-orange-400/50';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char
  ));
}

function rgbToHex(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('#') && (trimmed.length === 4 || trimmed.length === 7)) {
    if (trimmed.length === 4) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }
    return trimmed;
  }
  const match = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return DEFAULT_COLOR;
  const hex = [match[1], match[2], match[3]]
    .map(part => Number(part).toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

function selectionFontSizePx(): string {
  const selection = document.getSelection();
  const node = selection?.anchorNode;
  const el = node instanceof HTMLElement ? node : node?.parentElement;
  if (!el) return DEFAULT_SIZE;
  const px = Number.parseFloat(window.getComputedStyle(el).fontSize);
  if (!Number.isFinite(px)) return DEFAULT_SIZE;
  const nearest = FONT_SIZES.reduce((best, size) => (
    Math.abs(Number(size) - px) < Math.abs(Number(best) - px) ? size : best
  ), FONT_SIZES[2]);
  return nearest;
}

function highlightMatches(root: HTMLElement, query: string, matchCase: boolean): HTMLElement[] {
  const marks: HTMLElement[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const needle = matchCase ? query : query.toLowerCase();
  if (!needle) return marks;

  nodes.forEach(node => {
    const raw = node.nodeValue ?? '';
    const hay = matchCase ? raw : raw.toLowerCase();
    const hits: Array<{ start: number; end: number }> = [];
    let from = 0;
    while (from <= hay.length) {
      const at = hay.indexOf(needle, from);
      if (at < 0) break;
      hits.push({ start: at, end: at + needle.length });
      from = at + needle.length;
    }
    if (!hits.length || !node.parentNode) return;
    const frag = document.createDocumentFragment();
    let cursor = 0;
    hits.forEach(hit => {
      if (hit.start > cursor) frag.append(raw.slice(cursor, hit.start));
      const mark = document.createElement('mark');
      mark.className = 'doc-find';
      mark.textContent = raw.slice(hit.start, hit.end);
      frag.append(mark);
      marks.push(mark);
      cursor = hit.end;
    });
    if (cursor < raw.length) frag.append(raw.slice(cursor));
    node.parentNode.replaceChild(frag, node);
  });
  return marks;
}

export const DocumentEditorModal: React.FC<DocumentEditorModalProps> = ({
  file, isOpen, onClose, onSave, embedded = false,
}) => {
  /** File still downloads as text when the extension is a plain-text type. */
  const plainFormat = isPlainTextDocument(file);
  // Denied / pending gate: never mount extracted body into the editable surface.
  const contentBlocked =
    file.contentSafety?.userVerdict === 'denied'
    || file.contentSafety?.userVerdict === 'pending';
  const starting = contentBlocked ? '<p><br></p>' : editorHtmlFromFile(file);
  const baselineRef = useRef(starting);
  const versionRef = useRef(file.version);
  const initialHtmlRef = useRef(starting);
  const richRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const insertMenuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const marksRef = useRef<HTMLElement[]>([]);

  const [dirty, setDirty] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [pageCurrent, setPageCurrent] = useState(1);
  const [pageTotal, setPageTotal] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [outline, setOutline] = useState<Array<{ index: number; level: number; text: string }>>([]);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [findMiss, setFindMiss] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [block, setBlock] = useState('p');
  const [lineSpacing, setLineSpacing] = useState<string>('1.15');
  const [fontFamily, setFontFamily] = useState<string>(DEFAULT_DOC_FONT);
  const [fontSize, setFontSize] = useState<string>(DEFAULT_SIZE);
  const [fontColor, setFontColor] = useState<string>(DEFAULT_COLOR);
  const [highlightColor, setHighlightColor] = useState<string>(DEFAULT_HIGHLIGHT);
  const [active, setActive] = useState({ bold: false, italic: false, underline: false });

  const updatePageInfo = () => {
    const pageEl = richRef.current;
    const scrollEl = scrollRef.current;
    if (!pageEl || !scrollEl) return;

    const total = Math.max(1, Math.ceil(pageEl.scrollHeight / PAGE_HEIGHT_PX));
    const pageRect = pageEl.getBoundingClientRect();
    const scale = pageRect.height > 0 ? pageEl.scrollHeight / pageRect.height : 1;

    let offsetY: number | null = null;
    const selection = document.getSelection();
    if (selection && selection.rangeCount > 0 && pageEl.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0).cloneRange();
      range.collapse(true);
      const rect = range.getBoundingClientRect();
      if (rect.height || rect.width || rect.top) {
        offsetY = (rect.top - pageRect.top) * scale;
      }
    }

    if (offsetY == null) {
      const viewRect = scrollEl.getBoundingClientRect();
      const mid = viewRect.top + viewRect.height / 2;
      offsetY = (mid - pageRect.top) * scale;
    }

    const current = Math.min(total, Math.max(1, Math.floor(offsetY / PAGE_HEIGHT_PX) + 1));
    setPageCurrent(current);
    setPageTotal(total);
  };

  useEffect(() => {
    if (!richRef.current) return;
    setOutline(readOutline(richRef.current));
    richRef.current.focus();
  }, [file.id]);

  useEffect(() => {
    if (!isOpen) return;
    updatePageInfo();
    const onScrollOrSelect = () => updatePageInfo();
    const scrollEl = scrollRef.current;
    scrollEl?.addEventListener('scroll', onScrollOrSelect, { passive: true });
    document.addEventListener('selectionchange', onScrollOrSelect);
    window.addEventListener('resize', onScrollOrSelect);
    return () => {
      scrollEl?.removeEventListener('scroll', onScrollOrSelect);
      document.removeEventListener('selectionchange', onScrollOrSelect);
      window.removeEventListener('resize', onScrollOrSelect);
    };
  }, [isOpen, zoom, file.id]);

  useEffect(() => {
    if (!findOpen) return;
    findRef.current?.focus();
    findRef.current?.select();
  }, [findOpen]);

  useEffect(() => {
    if (!insertOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!insertMenuRef.current?.contains(event.target as Node)) setInsertOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInsertOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [insertOpen]);

  useEffect(() => {
    const sync = () => {
      try {
        setActive({
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
        });
        const value = String(document.queryCommandValue('formatBlock') || 'p').replace(/[<>]/g, '').toLowerCase();
        if (value === 'h1' || value === 'h2' || value === 'p') setBlock(value);
        const name = String(document.queryCommandValue('fontName') || '');
        if (name) setFontFamily(normalizeFontFamily(name));
        setFontSize(selectionFontSizePx());
        const color = String(document.queryCommandValue('foreColor') || '');
        if (color) setFontColor(rgbToHex(color));
      } catch {
        // queryCommand throws when the selection is outside the page.
      }
    };
    document.addEventListener('selectionchange', sync);
    return () => document.removeEventListener('selectionchange', sync);
  }, []);

  if (!isOpen) return null;

  const clearRichMarks = () => {
    const root = richRef.current;
    if (!root) return;
    root.querySelectorAll('mark.doc-find').forEach(mark => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
    });
    root.normalize();
    marksRef.current = [];
  };

  const showRichMatch = (marks: HTMLElement[], index: number) => {
    marks.forEach(mark => mark.classList.remove('doc-find-current'));
    const current = marks[index];
    if (!current) return;
    current.classList.add('doc-find-current');
    current.scrollIntoView({ block: 'center' });
  };

  const runFind = (nextQuery: string, nextIndex = 0, caseSensitive = matchCase) => {
    const needle = nextQuery.trim();
    if (!needle) {
      clearRichMarks();
      setMatchCount(0);
      setMatchIndex(0);
      setFindMiss(false);
      return;
    }
    const root = richRef.current;
    if (!root) return;
    clearRichMarks();
    const marks = highlightMatches(root, needle, caseSensitive);
    marksRef.current = marks;
    setMatchCount(marks.length);
    setFindMiss(marks.length === 0);
    if (!marks.length) return;
    const index = (nextIndex + marks.length) % marks.length;
    setMatchIndex(index);
    showRichMatch(marks, index);
  };

  const stepFind = (direction: 1 | -1) => {
    if (!query.trim()) return;
    runFind(query, matchCount === 0 ? 0 : matchIndex + direction);
  };

  const clearFind = () => {
    setQuery('');
    setFindOpen(false);
    setMatchCount(0);
    setMatchIndex(0);
    setFindMiss(false);
    clearRichMarks();
  };

  const findField = (
    <form
      className="flex items-center gap-1 shrink-0"
      onSubmit={event => {
        event.preventDefault();
        stepFind(1);
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (findOpen) {
            clearFind();
            richRef.current?.focus();
            return;
          }
          setFindOpen(true);
        }}
        className={`${toolButton} ${findOpen ? toolOn : ''}`}
        title="Find in document (Ctrl+F)"
        aria-pressed={findOpen}
      >
        <Search className="w-4 h-4" />
      </button>
      {findOpen && (
        <>
          <input
            ref={findRef}
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              runFind(event.target.value, 0);
            }}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                clearFind();
                richRef.current?.focus();
              }
            }}
            placeholder="Find…"
            className={`${fieldClass} w-40 ${findMiss ? '!border-rose-400/60' : ''}`}
            aria-label="Find in document"
          />
          <button type="button" onClick={() => stepFind(-1)} className={toolButton} title="Previous match" disabled={!matchCount}>
            <ChevronUp className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => stepFind(1)} className={toolButton} title="Next match" disabled={!matchCount}>
            <ChevronDown className="w-4 h-4" />
          </button>
          <span className="text-[10px] text-neutral-500 min-w-14 font-mono tabular-nums">
            {query.trim() ? (matchCount ? `${matchIndex + 1}/${matchCount}` : '0') : ''}
          </span>
          {!!query && (
            <button type="button" onClick={clearFind} className={toolButton} title="Clear find">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </>
      )}
    </form>
  );

  const currentBody = () => (
    richRef.current ? htmlWithoutFindMarks(richRef.current) : starting
  );

  const refreshRichState = () => {
    const root = richRef.current;
    if (!root) return;
    setDirty(htmlWithoutFindMarks(root) !== baselineRef.current);
    setOutline(readOutline(root));
    updatePageInfo();
  };

  const editHistory = (command: 'undo' | 'redo') => {
    richRef.current?.focus();
    document.execCommand(command);
    refreshRichState();
  };

  const format = (command: string, value?: string) => {
    richRef.current?.focus();
    document.execCommand(command, false, value);
    refreshRichState();
  };

  const restoreSelection = () => {
    richRef.current?.focus();
    const selection = document.getSelection();
    if (savedRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
  };

  const applyFontFamily = (family: string) => {
    ensureGoogleFontLoaded(family);
    setFontFamily(family);
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('fontName', false, fontStackFor(family));
    refreshRichState();
  };

  const applyFontSize = (sizePx: string) => {
    setFontSize(sizePx);
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('fontSize', false, '7');
    const root = richRef.current;
    if (!root) return;
    root.querySelectorAll('font[size="7"]').forEach(font => {
      const span = document.createElement('span');
      span.style.fontSize = `${sizePx}px`;
      while (font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    });
    root.querySelectorAll('span').forEach(node => {
      const span = node as HTMLElement;
      const current = span.style.fontSize;
      if (
        current === 'xxx-large'
        || current === '-webkit-xxx-large'
        || current === 'xx-large'
        || current === '-webkit-xx-large'
      ) {
        span.style.fontSize = `${sizePx}px`;
      }
    });
    refreshRichState();
  };

  const applyFontColor = (color: string) => {
    setFontColor(color);
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('foreColor', false, color);
    refreshRichState();
  };

  const applyHighlight = (color: string) => {
    setHighlightColor(color);
    restoreSelection();
    document.execCommand('styleWithCSS', false, 'true');
    const applied = document.execCommand('hiliteColor', false, color);
    if (!applied) document.execCommand('backColor', false, color);
    refreshRichState();
  };

  const insertHtml = (html: string) => {
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    setInsertOpen(false);
    refreshRichState();
  };

  const insertImageFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      if (!src) return;
      insertHtml(
        `<img src="${src}" alt="${escapeHtml(file.name)}" style="max-width:100%;height:auto;border-radius:4px;" />`,
      );
    };
    reader.readAsDataURL(file);
  };

  const applyLineSpacing = (spacingId: string) => {
    const preset = LINE_SPACINGS.find(item => item.id === spacingId) ?? LINE_SPACINGS[1];
    setLineSpacing(preset.id);
    richRef.current?.focus();
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0 || !richRef.current) return;
    let node: Node | null = selection.anchorNode;
    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    let blockEl = node instanceof HTMLElement ? node : null;
    while (blockEl && blockEl !== richRef.current && !/^(P|H1|H2|H3|LI|DIV)$/i.test(blockEl.tagName)) {
      blockEl = blockEl.parentElement;
    }
    if (!blockEl || blockEl === richRef.current) {
      document.execCommand('formatBlock', false, '<p>');
      const again = document.getSelection()?.anchorNode;
      blockEl = again instanceof HTMLElement ? again : again?.parentElement ?? null;
      while (blockEl && blockEl !== richRef.current && !/^(P|H1|H2|H3|LI|DIV)$/i.test(blockEl.tagName)) {
        blockEl = blockEl.parentElement;
      }
    }
    if (blockEl && blockEl !== richRef.current) {
      blockEl.style.lineHeight = preset.value;
      refreshRichState();
    }
  };

  const save = () => {
    const body = currentBody();
    baselineRef.current = body;
    versionRef.current += 1;
    setDirty(false);
    setConfirmClose(false);
    onSave({
      ...file,
      documentBody: body,
      sizeBytes: new TextEncoder().encode(body).length,
      updatedAt: new Date().toISOString(),
      version: versionRef.current,
    });
  };

  const printDocument = () => {
    const body = currentBody();
    const frame = document.createElement('iframe');
    frame.setAttribute('title', 'Print document');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      return;
    }
    doc.open();
    doc.write(`<!doctype html><html><head><title>${escapeHtml(file.name)}</title><style>
      body{margin:0.75in;color:#15141a;font:16px Georgia,"Iowan Old Style",Palatino,serif}
      h1{font-size:28px}h2{font-size:20px}a{color:#c45c26};body{font-family:Newsreader,Georgia,serif}
    </style></head><body>${body}</body></html>`);
    doc.close();
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  };

  const download = () => {
    const html = currentBody();
    const extension = plainFormat ? (fileExtension(file.name) || 'txt') : (fileExtension(file.name) || 'html');
    const base = file.name.replace(/\.[^.]+$/, '');
    const plainText = richRef.current?.innerText.replace(/\u00a0/g, ' ') ?? '';
    const payload = plainFormat
      ? plainText
      : `<!doctype html><meta charset="utf-8"><title>${escapeHtml(base)}</title><body>${html}</body>`;
    const blob = new Blob([payload], {
      type: plainFormat ? 'text/plain;charset=utf-8' : 'text/html;charset=utf-8',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${base}.${extension}`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const requestClose = () => {
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  const onEditorKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      setFindOpen(true);
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      printDocument();
    } else if (event.key === 'Escape' && (findOpen || query)) {
      event.preventDefault();
      event.stopPropagation();
      clearFind();
    }
  };

  const applyLink = () => {
    const href = linkDraft?.trim() ?? '';
    richRef.current?.focus();
    const selection = document.getSelection();
    if (savedRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
    if (href) document.execCommand('createLink', false, href);
    else document.execCommand('unlink');
    setLinkDraft(null);
    refreshRichState();
  };

  const words = countWords(richRef.current?.textContent ?? '');
  const characters = (richRef.current?.textContent ?? '').length;
  const zoomIndex = ZOOMS.indexOf(zoom);
  const formatExt = fileExtension(file.name) || (plainFormat ? 'txt' : 'doc');
  const formatBadgeTone = formatBadgeClasses(formatExt);
  const codeLike = ['json', 'csv', 'log', 'xml', 'yaml', 'yml', 'js', 'ts', 'tsx', 'css', 'py', 'rs', 'go', 'sql', 'svg'].includes(formatExt);

  return (
    <div
      data-document-editor
      onKeyDown={onEditorKeyDown}
      className={
        embedded
          ? 'doc-editor-shell relative flex-1 h-full w-full min-h-0 min-w-0 flex flex-col text-neutral-100 select-text overflow-hidden'
          : 'doc-editor-shell fixed inset-0 z-50 flex flex-col text-neutral-100 select-text'
      }
    >
      <div className="h-12 shrink-0 flex items-center gap-1.5 px-3 border-b border-white/8 bg-neutral-950/80 backdrop-blur-md">
        <div className="flex items-center gap-2.5 min-w-0 px-2">
          <div
            className={`h-7 shrink-0 pl-1.5 pr-2 rounded-lg border flex items-center gap-1.5 ${formatBadgeTone}`}
            title={formatExt}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wide">
              {formatExt}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-neutral-100 truncate max-w-[240px]">{file.name}</div>
            <div className="text-[10px] text-neutral-500 font-mono truncate">
              Rich text · Rust editor
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center gap-1">
          <button type="button" onClick={() => setZoom(ZOOMS[Math.max(0, zoomIndex - 1)] ?? 50)} className={toolButton} title="Zoom out" disabled={zoomIndex <= 0}>
            <ZoomOut className="w-4 h-4" />
          </button>
          <select value={zoom} onChange={event => setZoom(Number(event.target.value))} className={fieldClass} aria-label="Zoom">
            {ZOOMS.map(value => <option key={value} value={value}>{value}%</option>)}
          </select>
          <button type="button" onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zoomIndex + 1)] ?? 200)} className={toolButton} title="Zoom in" disabled={zoomIndex >= ZOOMS.length - 1}>
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <button type="button" onClick={() => editHistory('undo')} className={toolButton} title="Undo" aria-label="Undo">
          <Undo2 className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => editHistory('redo')} className={toolButton} title="Redo" aria-label="Redo">
          <Redo2 className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <button
          type="button"
          onClick={save}
          disabled={!dirty}
          className="h-8 px-3 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-orange-500/15"
          title={dirty ? 'Save (Ctrl+S)' : 'Saved'}
        >
          <Save className="w-3.5 h-3.5" />
          <span>{dirty ? 'Save' : 'Saved'}</span>
        </button>
        <button type="button" onClick={download} className={toolButton} title="Download">
          <Download className="w-4 h-4" />
        </button>
        <button type="button" onClick={printDocument} className={toolButton} title="Print (Ctrl+P)">
          <Printer className="w-4 h-4" />
        </button>
        <button type="button" onClick={requestClose} className={toolButton} title="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      {file.contentSafety?.untrustedExternal && (
        <div
          className={`px-4 py-2 border-b flex items-start gap-2.5 text-xs shrink-0 ${
            file.contentSafety.risk === 'high' || file.contentSafety.risk === 'medium'
              ? 'bg-amber-950/50 border-amber-500/35 text-amber-100'
              : 'bg-sky-950/40 border-sky-500/25 text-sky-100'
          }`}
          role="status"
        >
          <ShieldAlert className={`w-4 h-4 shrink-0 mt-0.5 ${
            file.contentSafety.risk === 'high' || file.contentSafety.risk === 'medium'
              ? 'text-amber-400'
              : 'text-sky-400'
          }`} />
          <div className="min-w-0">
            <p className="font-semibold tracking-tight">
              Untrusted external content
              {file.contentSafety.userVerdict === 'confirmed' ? ' · confirmed as data only' : ''}
              {file.contentSafety.htmlHardened ? ' · active HTML removed' : ''}
            </p>
            <p className="text-[11px] opacity-80 mt-0.5 leading-relaxed">
              {(file.contentSafety.reasons[0]
                || 'Data extracted from this file cannot rewrite Cloudbreak execution logic or system prompts.')}
              {' '}Instructions inside the document are treated as data, never as commands.
            </p>
          </div>
        </div>
      )}

      <div className="h-10 shrink-0 flex items-center gap-0.5 px-3 border-b border-white/8 bg-neutral-900/70 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSidebarOpen(open => !open)}
            className={`${toolButton} ${sidebarOpen ? toolOn : ''}`}
            title="Document outline"
            aria-pressed={sidebarOpen}
          >
            <PanelLeft className="w-4 h-4" />
          </button>
          {findField}
          <div className="w-px h-4 bg-white/10 mx-1.5" />
          <select
            value={block}
            onMouseDown={() => {
              const selection = document.getSelection();
              savedRangeRef.current = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
            }}
            onChange={event => {
              setBlock(event.target.value);
              richRef.current?.focus();
              const selection = document.getSelection();
              if (savedRangeRef.current && selection) {
                selection.removeAllRanges();
                selection.addRange(savedRangeRef.current);
              }
              format('formatBlock', `<${event.target.value}>`);
            }}
            className={fieldClass}
            aria-label="Paragraph style"
          >
            <option value="p">Paragraph</option>
            <option value="h1">Heading</option>
            <option value="h2">Subheading</option>
          </select>
          <FontPicker
            value={fontFamily}
            onCaptureSelection={() => {
              const selection = document.getSelection();
              savedRangeRef.current = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
            }}
            onChange={applyFontFamily}
          />
          <select
            value={fontSize}
            onMouseDown={() => {
              const selection = document.getSelection();
              savedRangeRef.current = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
            }}
            onChange={event => applyFontSize(event.target.value)}
            className={`${fieldClass} w-[3.75rem]`}
            title="Font size"
            aria-label="Font size"
          >
            {FONT_SIZES.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <label
            className={`${toolButton} relative cursor-pointer`}
            title="Font color"
            onMouseDown={() => {
              const selection = document.getSelection();
              savedRangeRef.current = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
            }}
          >
            <span
              className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
              style={{ backgroundColor: fontColor }}
              aria-hidden
            />
            <input
              type="color"
              value={fontColor}
              onChange={event => applyFontColor(event.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Font color"
            />
          </label>
          <div className="w-px h-4 bg-white/10 mx-1.5" />
          <FormatButton title="Bold (Ctrl+B)" onClick={() => format('bold')} pressed={active.bold}><Bold className="w-4 h-4" /></FormatButton>
          <FormatButton title="Italic (Ctrl+I)" onClick={() => format('italic')} pressed={active.italic}><Italic className="w-4 h-4" /></FormatButton>
          <FormatButton title="Underline (Ctrl+U)" onClick={() => format('underline')} pressed={active.underline}><Underline className="w-4 h-4" /></FormatButton>
          <label
            className={`${toolButton} relative cursor-pointer`}
            title="Highlight"
            onMouseDown={() => {
              const selection = document.getSelection();
              savedRangeRef.current = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
            }}
          >
            <Highlighter className="w-4 h-4" />
            <span
              className="absolute bottom-1.5 left-1.5 right-1.5 h-0.5 rounded-full"
              style={{ backgroundColor: highlightColor }}
            />
            <input
              type="color"
              value={highlightColor}
              onChange={event => applyHighlight(event.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Highlight color"
            />
          </label>
          <div ref={insertMenuRef} className="relative shrink-0">
            <FormatButton
              title="Insert"
              pressed={insertOpen}
              onClick={() => {
                const selection = document.getSelection();
                savedRangeRef.current = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
                setInsertOpen(open => !open);
              }}
            >
              <Plus className="w-4 h-4" />
            </FormatButton>
            {insertOpen && (
              <div
                role="menu"
                className="absolute left-0 top-[calc(100%+4px)] z-50 w-44 rounded-xl border border-white/10 bg-neutral-950 shadow-2xl shadow-black/50 py-1 overflow-hidden"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-200 hover:bg-white/6"
                  onClick={() => {
                    const selection = document.getSelection();
                    savedRangeRef.current = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
                    imageInputRef.current?.click();
                    setInsertOpen(false);
                  }}
                >
                  <ImagePlus className="w-3.5 h-3.5 text-neutral-400" />
                  Image
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-200 hover:bg-white/6"
                  onClick={() => insertHtml(
                    '<table style="width:100%;border-collapse:collapse;margin:0.75em 0"><tbody>'
                    + '<tr><td style="border:1px solid #a3a3a3;padding:6px 8px">&nbsp;</td><td style="border:1px solid #a3a3a3;padding:6px 8px">&nbsp;</td></tr>'
                    + '<tr><td style="border:1px solid #a3a3a3;padding:6px 8px">&nbsp;</td><td style="border:1px solid #a3a3a3;padding:6px 8px">&nbsp;</td></tr>'
                    + '</tbody></table><p><br></p>',
                  )}
                >
                  <Table2 className="w-3.5 h-3.5 text-neutral-400" />
                  Table
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-200 hover:bg-white/6"
                  onClick={() => {
                    restoreSelection();
                    document.execCommand('insertHorizontalRule');
                    setInsertOpen(false);
                    refreshRichState();
                  }}
                >
                  <Minus className="w-3.5 h-3.5 text-neutral-400" />
                  Horizontal line
                </button>
              </div>
            )}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) insertImageFromFile(file);
              }}
            />
          </div>
          <FormatButton
            title="Link"
            onClick={() => {
              const selection = document.getSelection();
              savedRangeRef.current = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
              setLinkDraft('https://');
            }}
          >
            <Link className="w-4 h-4" />
          </FormatButton>
          {linkDraft !== null && (
            <form
              className="flex items-center gap-1.5 ml-1"
              onSubmit={event => {
                event.preventDefault();
                applyLink();
              }}
            >
              <input
                autoFocus
                value={linkDraft}
                onChange={event => setLinkDraft(event.target.value)}
                className={`${fieldClass} w-48`}
                aria-label="Link address"
              />
              <button type="submit" className="h-8 px-2.5 rounded-lg bg-orange-500 text-neutral-950 text-xs font-semibold">Apply</button>
              <button type="button" onClick={() => setLinkDraft(null)} className="h-8 px-2.5 rounded-lg hover:bg-white/8 text-xs text-neutral-300">Cancel</button>
            </form>
          )}
          <div className="w-px h-4 bg-white/10 mx-1.5" />
          <FormatButton title="Bulleted list" onClick={() => format('insertUnorderedList')}><List className="w-4 h-4" /></FormatButton>
          <FormatButton title="Numbered list" onClick={() => format('insertOrderedList')}><ListOrdered className="w-4 h-4" /></FormatButton>
          <div className="w-px h-4 bg-white/10 mx-1.5" />
          <FormatButton title="Align left" onClick={() => format('justifyLeft')}><AlignLeft className="w-4 h-4" /></FormatButton>
          <FormatButton title="Align center" onClick={() => format('justifyCenter')}><AlignCenter className="w-4 h-4" /></FormatButton>
          <FormatButton title="Align right" onClick={() => format('justifyRight')}><AlignRight className="w-4 h-4" /></FormatButton>
          <div className="relative flex items-center">
            <AlignVerticalSpaceAround className="w-3.5 h-3.5 text-neutral-400 absolute left-2 pointer-events-none" />
            <select
              value={lineSpacing}
              onChange={event => applyLineSpacing(event.target.value)}
              className={`${fieldClass} pl-7 w-[5.5rem]`}
              title="Line spacing"
              aria-label="Line spacing"
            >
              {LINE_SPACINGS.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {sidebarOpen && (
          <aside className="w-56 shrink-0 overflow-y-auto border-r border-white/8 bg-neutral-950/60 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-300/70 mb-2">Outline</div>
            {outline.length === 0 && (
              <p className="text-xs text-neutral-500 leading-relaxed">Headings you add appear here for quick jumps.</p>
            )}
            <div className="space-y-0.5">
              {outline.map(item => (
                <button
                  key={item.index}
                  type="button"
                  onClick={() => {
                    const heading = richRef.current?.querySelectorAll('h1, h2, h3')[item.index];
                    heading?.scrollIntoView({ block: 'center' });
                  }}
                  className="w-full text-left text-xs text-neutral-300 hover:text-neutral-100 hover:bg-white/6 rounded-lg px-2 py-1.5 truncate transition-colors"
                  style={{ paddingLeft: `${8 + (item.level - 1) * 12}px` }}
                >
                  {item.text}
                </button>
              ))}
            </div>
          </aside>
        )}

        <div ref={scrollRef} className="flex-1 overflow-auto py-8 px-6">
          <div className="mx-auto" style={{ zoom: zoom / 100 }}>
            <div
              ref={richRef}
              contentEditable
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: initialHtmlRef.current }}
              role="textbox"
              aria-multiline="true"
              aria-label={file.name}
              spellCheck={!codeLike}
              onInput={refreshRichState}
              className={`doc-page w-[816px] min-h-[1056px] bg-[var(--doc-paper)] text-[var(--doc-ink)] rounded-sm shadow-[0_24px_80px_-24px_rgba(0,0,0,0.75),0_0_0_1px_rgba(255,255,255,0.06)] px-[72px] py-16 outline-none ${codeLike ? 'font-mono text-[14.5px]' : ''}`}
            />
          </div>
        </div>
      </div>

      <div className="h-8 shrink-0 px-4 flex items-center justify-between border-t border-white/8 bg-neutral-950/90 text-[11px] text-neutral-500">
        <span className="font-mono">{file.mimeType}</span>
        <span className="font-mono tabular-nums">{words} words · {characters} chars</span>
        <span className="font-mono tabular-nums" title="Page">
          Page {pageCurrent} of {pageTotal}
        </span>
      </div>

      {confirmClose && (
        <div className="absolute top-14 right-3 w-72 rounded-xl bg-neutral-900 border border-white/10 shadow-2xl p-3.5 text-sm">
          <p className="text-neutral-200">This document has unsaved changes.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmClose(false)} className="h-8 px-2.5 rounded-lg hover:bg-white/8 text-xs text-neutral-300">
              Keep editing
            </button>
            <button type="button" onClick={onClose} className="h-8 px-2.5 rounded-lg bg-orange-500 text-neutral-950 text-xs font-semibold">
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function readOutline(root: HTMLElement) {
  return Array.from(root.querySelectorAll('h1, h2, h3')).map((element, index) => ({
    index,
    level: element.tagName === 'H1' ? 1 : element.tagName === 'H2' ? 2 : 3,
    text: element.textContent?.trim() || 'Untitled',
  }));
}

function FormatButton({
  title, onClick, pressed, children,
}: {
  title: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={pressed}
      onMouseDown={event => {
        event.preventDefault();
        onClick();
      }}
      className={`${toolButton} ${pressed ? toolOn : ''}`}
    >
      {children}
    </button>
  );
}
