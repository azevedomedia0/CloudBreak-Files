import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import {
  ArrowDown, ArrowUp, Circle, ExternalLink, FilePlus2, FileText, Highlighter, ListChecks, Minus, MousePointer2,
  MoveUpRight, PanelLeft, PenLine, Pencil, Redo2, RotateCcw, RotateCw, Save, Square, Trash2, Type, Undo2, X,
  ZoomIn, ZoomOut,
} from '@/src/icons';
import type { FileItem } from '../../types';
import { formatBadgeClasses } from '../../utils/documentKind';
import { localFs } from '../../services/localFsBridge';
import { previewBridge } from '../../services/previewBridge';
import { contentSizeOf, openPdf } from '../../services/pdfEngine';
import {
  newHistory, normalizeRot, pushHistory, redoHistory, undoHistory, displaySize,
  type History, type PageEntry, type PdfAnnotation,
} from '../../utils/pdfGeometry';
import {
  buildEditedPdf, editedPdfName, readFormFields, type EditSource, type FormFieldInfo, type FormValue,
} from '../../utils/pdfEdit';
import { newAnnotationId, PdfPageView, type PdfPenStyle, type PdfTool } from './PdfPageView';
import { PdfThumb } from './PdfThumb';
import { PdfSignatureDialog } from './PdfSignatureDialog';
import { PdfFormPanel } from './PdfFormPanel';

interface DocState { pages: PageEntry[]; annotations: Record<string, PdfAnnotation[]> }

interface LoadedSource { id: string; bytes: Uint8Array; doc: PDFDocumentProxy; destroy: () => void }

export interface PdfEditorProps {
  file: FileItem;
  onClose: () => void;
  embedded?: boolean;
  /** Save the edited PDF as a new file (the original is never overwritten). Resolves to a short message. */
  onSaveCopy: (bytes: Uint8Array, name: string) => Promise<string | void>;
  onNotify?: (message: string) => void;
}

const toolButton =
  'w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-neutral-300 hover:text-neutral-100 hover:bg-white/8 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-neutral-300 transition-colors';
const toolOn = 'bg-orange-500/20 text-orange-200 hover:bg-orange-500/25 hover:text-orange-100';

const TOOLS: { id: PdfTool; label: string; icon: React.ElementType }[] = [
  { id: 'select', label: 'Select and move (V)', icon: MousePointer2 },
  { id: 'highlight', label: 'Highlight', icon: Highlighter },
  { id: 'draw', label: 'Draw', icon: Pencil },
  { id: 'text', label: 'Text box', icon: Type },
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'arrow', label: 'Arrow', icon: MoveUpRight },
];

const PEN_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#111827'];
const HIGHLIGHT_COLORS = ['#ffeb33', '#86efac', '#7dd3fc', '#f9a8d4', '#fdba74'];
const WIDTHS = [{ label: 'Thin', value: 1.5 }, { label: 'Medium', value: 3 }, { label: 'Thick', value: 6 }];
const TEXT_SIZES = [12, 16, 20, 28, 40];
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;

async function loadPdfBytes(file: FileItem): Promise<Uint8Array> {
  if (file.localPath && localFs.available()) return localFs.readBytes(file.localPath);
  if (!file.url || file.url === '#') throw new Error('This PDF is not available to open here.');
  const res = await fetch(file.url);
  if (!res.ok) throw new Error(`The PDF could not be read (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

/** PDF editor: annotate, fill forms, sign, and rearrange pages. Changes are saved as a new copy. */
export const PdfEditor: React.FC<PdfEditorProps> = ({ file, onClose, embedded = false, onSaveCopy, onNotify }) => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<History<DocState>>(() => newHistory({ pages: [], annotations: {} }));
  const [tool, setTool] = useState<PdfTool>('select');
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_COLORS[0]);
  const [width, setWidth] = useState(3);
  const [textSize, setTextSize] = useState(16);
  const [zoom, setZoom] = useState(1);
  const [showPages, setShowPages] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<{ pageId: string; id: string } | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [pageVersion, setPageVersion] = useState(0);
  const [fields, setFields] = useState<FormFieldInfo[]>([]);
  const [formValues, setFormValues] = useState<Record<string, FormValue>>({});
  const [signing, setSigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const sources = useRef(new Map<string, LoadedSource>());
  const proxies = useRef(new Map<string, PDFPageProxy>());
  const pageEls = useRef(new Map<string, HTMLDivElement>());
  const scroller = useRef<HTMLDivElement>(null);
  const insertInput = useRef<HTMLInputElement>(null);
  const insertSeq = useRef(0);
  const saved = useRef<{ present: DocState; formKey: string } | null>(null);

  const state = history.present;
  const notify = useCallback((message: string) => onNotify?.(message), [onNotify]);

  const pen: PdfPenStyle = useMemo(() => ({
    color: tool === 'highlight' ? highlightColor : penColor, width, textSize,
  }), [tool, highlightColor, penColor, width, textSize]);

  const commit = useCallback((next: DocState) => setHistory(h => pushHistory(h, next)), []);

  /** Read each page's proxy and size in small batches, so a long PDF does not stall the editor. */
  const loadPages = useCallback(async (srcId: string, count: number, isCancelled: () => boolean) => {
    const src = sources.current.get(srcId);
    if (!src) return;
    for (let start = 0; start < count && !isCancelled(); start += 12) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(12, count - start) }, (_, k) => src.doc.getPage(start + k + 1)),
      );
      if (isCancelled()) return;
      const found: Record<string, { w: number; h: number }> = {};
      batch.forEach((page, k) => {
        proxies.current.set(`${srcId}:${start + k}`, page);
        found[`${srcId}:${start + k}`] = contentSizeOf(page);
      });
      setSizes(prev => ({ ...prev, ...found }));
      setPageVersion(v => v + 1);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loaded = sources.current;
    (async () => {
      try {
        const bytes = await loadPdfBytes(file);
        const opened = await openPdf(bytes);
        if (cancelled) { opened.destroy(); return; }
        loaded.set('base', { id: 'base', bytes, doc: opened.doc, destroy: opened.destroy });
        const n = opened.doc.numPages;
        const pages: PageEntry[] = Array.from({ length: n }, (_, i) => ({ id: `base-${i}`, srcId: 'base', srcIndex: i, rotation: 0 }));
        const first: DocState = { pages, annotations: {} };
        saved.current = { present: first, formKey: '{}' };
        setHistory(newHistory(first));
        setActivePageId(pages[0]?.id ?? null);
        setStatus('ready');
        readFormFields(bytes).then(f => { if (!cancelled) setFields(f); }).catch(() => { /* no form */ });
        void loadPages('base', n, () => cancelled);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(/password/i.test(msg) ? 'This PDF is password protected, so it cannot be edited here.' : msg || 'This PDF could not be opened.');
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      loaded.forEach(s => s.destroy());
      loaded.clear();
      proxies.current.clear();
    };
    // Reopen only for a different document, not for every new object of the same file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, file.url, file.localPath, loadPages]);

  // Fit the first page to the width of the window once the sizes are known.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !scroller.current) return;
    const first = state.pages[0] && sizes[`${state.pages[0].srcId}:${state.pages[0].srcIndex}`];
    if (!first) return;
    fitted.current = true;
    const avail = scroller.current.clientWidth - 48;
    setZoom(Math.max(ZOOM_MIN, Math.min(1.5, avail / displaySize(first.w, first.h, state.pages[0].rotation).w)));
  }, [sizes, state.pages]);

  const formKey = JSON.stringify(formValues);
  const dirty = !!saved.current && (saved.current.present !== state || saved.current.formKey !== formKey);

  const undo = () => { setHistory(undoHistory); setSelected(null); };
  const redo = () => { setHistory(redoHistory); setSelected(null); };

  const setPageAnnotations = (pageId: string, list: PdfAnnotation[]) =>
    commit({ ...state, annotations: { ...state.annotations, [pageId]: list } });

  const removeSelected = () => {
    if (!selected) return;
    setPageAnnotations(selected.pageId, (state.annotations[selected.pageId] ?? []).filter(a => a.id !== selected.id));
    setSelected(null);
  };

  const rotatePage = (id: string, delta: number) =>
    commit({ ...state, pages: state.pages.map(p => (p.id === id ? { ...p, rotation: normalizeRot(p.rotation + delta) } : p)) });

  const deletePage = (id: string) => {
    if (state.pages.length <= 1) { notify('A PDF needs at least one page.'); return; }
    const { [id]: _gone, ...rest } = state.annotations;
    void _gone;
    commit({ pages: state.pages.filter(p => p.id !== id), annotations: rest });
    if (selected?.pageId === id) setSelected(null);
  };

  const movePage = (id: string, by: -1 | 1) => {
    const i = state.pages.findIndex(p => p.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= state.pages.length) return;
    const pages = [...state.pages];
    [pages[i], pages[j]] = [pages[j], pages[i]];
    commit({ ...state, pages });
  };

  const goTo = (id: string) => {
    setActivePageId(id);
    pageEls.current.get(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const insertPdf = async (picked: File) => {
    try {
      const bytes = new Uint8Array(await picked.arrayBuffer());
      const count = (await PDFDocument.load(bytes)).getPageCount();
      const opened = await openPdf(bytes);
      const id = `ins${++insertSeq.current}`;
      sources.current.set(id, { id, bytes, doc: opened.doc, destroy: opened.destroy });
      const entries: PageEntry[] = Array.from({ length: count }, (_, i) => ({ id: `${id}-${i}`, srcId: id, srcIndex: i, rotation: 0 }));
      const at = Math.max(0, state.pages.findIndex(p => p.id === activePageId)) + 1;
      commit({ ...state, pages: [...state.pages.slice(0, at), ...entries, ...state.pages.slice(at)] });
      void loadPages(id, count, () => false);
      notify(`Inserted ${count} page${count === 1 ? '' : 's'} from “${picked.name}”.`);
    } catch (err) {
      notify(`That file could not be inserted: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const placeSignature = (png: Uint8Array, aspect: number) => {
    setSigning(false);
    const entry = state.pages.find(p => p.id === activePageId) ?? state.pages[0];
    if (!entry) return;
    const size = sizes[`${entry.srcId}:${entry.srcIndex}`];
    if (!size) return;
    const w = Math.min(180, size.w * 0.4);
    const h = w / aspect;
    const id = newAnnotationId();
    setPageAnnotations(entry.id, [...(state.annotations[entry.id] ?? []), {
      id, kind: 'image', x: (size.w - w) / 2, y: (size.h - h) / 2, w, h, png,
    }]);
    setTool('select');
    setSelected({ pageId: entry.id, id });
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const list: EditSource[] = [...sources.current.values()].map(s => ({ id: s.id, bytes: s.bytes }));
      const bytes = await buildEditedPdf(list, state.pages, state.annotations, formValues);
      const message = await onSaveCopy(bytes, editedPdfName(file.name));
      saved.current = { present: state, formKey };
      if (message) notify(message);
    } catch (err) {
      notify(`Could not save the PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => (dirty ? setConfirmClose(true) : onClose());

  // Keyboard: undo, redo, save, delete, escape.
  const latest = useRef({ undo, redo, save, removeSelected });
  latest.current = { undo, redo, save, removeSelected };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || signing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? latest.current.redo : latest.current.undo)(); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void latest.current.save(); }
      else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); latest.current.removeSelected(); }
      else if (e.key === 'Escape') { setSelected(null); setTool('select'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [signing]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const line = el.scrollTop + el.clientHeight / 3;
    let current: string | null = null;
    for (const p of state.pages) {
      const node = pageEls.current.get(p.id);
      if (node && node.offsetTop - el.offsetTop <= line) current = p.id;
    }
    if (current && current !== activePageId) setActivePageId(current);
  };

  const openExternally = () => {
    if (!file.localPath || !previewBridge.available()) return;
    void previewBridge.openWithDefault(file.localPath).catch(() => {});
  };

  const badge = formatBadgeClasses('pdf');
  const shell = embedded
    ? 'doc-editor-shell relative flex-1 h-full w-full min-h-0 min-w-0 flex flex-col text-neutral-100 select-none overflow-hidden'
    : 'doc-editor-shell fixed inset-0 z-50 flex flex-col text-neutral-100 select-none';
  const swatches = tool === 'highlight' ? HIGHLIGHT_COLORS : PEN_COLORS;
  const color = tool === 'highlight' ? highlightColor : penColor;
  const usesWidth = ['draw', 'rect', 'ellipse', 'line', 'arrow'].includes(tool);

  return (
    <div data-document-editor className={shell}>
      <div className="h-12 shrink-0 flex items-center gap-1.5 px-3 border-b border-white/8 bg-neutral-950/80 backdrop-blur-md">
        <div className="flex items-center gap-2.5 min-w-0 px-2">
          <div className={`h-7 shrink-0 pl-1.5 pr-2 rounded-lg border flex items-center gap-1.5 ${badge}`} title="pdf">
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wide">pdf</span>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-neutral-100 truncate max-w-[320px]">{file.name}{dirty ? ' •' : ''}</div>
            <div className="text-[10px] text-neutral-500 font-mono truncate">
              PDF · Editor{status === 'ready' ? ` · ${state.pages.length} page${state.pages.length === 1 ? '' : 's'}` : ''}{dirty ? ' · unsaved changes' : ''}
            </div>
          </div>
        </div>
        <div className="flex-1" />
        {file.localPath && previewBridge.available() && (
          <button type="button" onClick={openExternally} className="h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-neutral-100 text-xs font-semibold flex items-center gap-1.5 transition-colors" title="Open with default app">
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Externally</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => { void save(); }}
          disabled={status !== 'ready' || saving || !dirty}
          className="h-8 px-3 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:hover:bg-orange-500 transition-colors"
          title="Save the edits as a new copy (⌘S). The original is not changed."
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Saving…' : 'Save a Copy'}</span>
        </button>
        <button type="button" onClick={requestClose} className={toolButton} title="Close"><X className="w-4 h-4" /></button>
      </div>

      {status === 'ready' && (
        <div className="min-h-10 shrink-0 flex items-center flex-wrap gap-x-1 gap-y-0.5 px-3 py-1 border-b border-white/8 bg-neutral-900/70">
          <button type="button" onClick={() => setShowPages(s => !s)} className={`${toolButton} ${showPages ? toolOn : ''}`} title="Pages" aria-label="Pages" aria-pressed={showPages}><PanelLeft className="w-4 h-4" /></button>
          <span className="w-px h-5 bg-white/10 mx-1" />
          {TOOLS.map(t => (
            <button key={t.id} type="button" onClick={() => { setTool(t.id); setSelected(null); }} className={`${toolButton} ${tool === t.id ? toolOn : ''}`} title={t.label} aria-label={t.label} aria-pressed={tool === t.id}>
              <t.icon className="w-4 h-4" />
            </button>
          ))}
          <button type="button" onClick={() => setSigning(true)} className={toolButton} title="Sign" aria-label="Sign"><PenLine className="w-4 h-4" /></button>
          <span className="w-px h-5 bg-white/10 mx-1" />
          {tool !== 'select' ? (
            <div className="flex items-center gap-1" aria-label="Colour">
              {swatches.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => (tool === 'highlight' ? setHighlightColor(c) : setPenColor(c))}
                  className={`w-5 h-5 rounded-full border ${color === c ? 'ring-2 ring-orange-400 border-white/60' : 'border-white/25'}`}
                  style={{ background: c }}
                  title={c}
                  aria-label={`Colour ${c}`}
                />
              ))}
            </div>
          ) : null}
          {usesWidth && (
            <select value={width} onChange={e => setWidth(Number(e.target.value))} className="h-7 px-1.5 rounded-md bg-neutral-950/80 border border-white/10 text-[11px] text-neutral-100 ml-1" aria-label="Line width">
              {WIDTHS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          )}
          {tool === 'text' && (
            <select value={textSize} onChange={e => setTextSize(Number(e.target.value))} className="h-7 px-1.5 rounded-md bg-neutral-950/80 border border-white/10 text-[11px] text-neutral-100 ml-1" aria-label="Text size">
              {TEXT_SIZES.map(s => <option key={s} value={s}>{s} pt</option>)}
            </select>
          )}
          <span className="w-px h-5 bg-white/10 mx-1" />
          <button type="button" onClick={undo} disabled={history.past.length === 0} className={toolButton} title="Undo (⌘Z)" aria-label="Undo"><Undo2 className="w-4 h-4" /></button>
          <button type="button" onClick={redo} disabled={history.future.length === 0} className={toolButton} title="Redo (⇧⌘Z)" aria-label="Redo"><Redo2 className="w-4 h-4" /></button>
          <button type="button" onClick={removeSelected} disabled={!selected} className={toolButton} title="Delete the selected mark (Delete)" aria-label="Delete selected"><Trash2 className="w-4 h-4" /></button>
          <div className="flex-1" />
          {fields.length > 0 && (
            <button type="button" onClick={() => setShowForm(s => !s)} className={`h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${showForm ? toolOn : 'text-neutral-300 hover:bg-white/8'}`} aria-pressed={showForm}>
              <ListChecks className="w-4 h-4" />
              <span>Form ({fields.length})</span>
            </button>
          )}
          <button type="button" onClick={() => setZoom(z => Math.max(ZOOM_MIN, +(z - 0.15).toFixed(2)))} className={toolButton} title="Zoom out" aria-label="Zoom out"><ZoomOut className="w-4 h-4" /></button>
          <span className="w-10 text-center text-[11px] font-mono text-neutral-300">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom(z => Math.min(ZOOM_MAX, +(z + 0.15).toFixed(2)))} className={toolButton} title="Zoom in" aria-label="Zoom in"><ZoomIn className="w-4 h-4" /></button>
        </div>
      )}

      {confirmClose && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-amber-500/15 border-b border-amber-400/30 text-xs text-amber-100">
          <span className="flex-1">You have unsaved changes. Close without saving a copy?</span>
          <button type="button" onClick={() => setConfirmClose(false)} className="h-7 px-3 rounded-md bg-white/10 hover:bg-white/15 border border-white/15">Keep editing</button>
          <button type="button" onClick={onClose} className="h-7 px-3 rounded-md bg-red-500/80 hover:bg-red-500 text-white">Discard and close</button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        {status === 'loading' && (
          <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">Opening PDF…</div>
        )}
        {status === 'error' && (
          <div className="flex-1 m-4 rounded-xl border border-white/10 bg-neutral-900/60 flex flex-col items-center justify-center gap-3 text-neutral-400 px-6 text-center">
            <FileText className="w-10 h-10 text-red-300/80" />
            <p className="text-sm text-neutral-300">{error}</p>
            {file.localPath && previewBridge.available() && (
              <button type="button" onClick={openExternally} className="h-8 px-3 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-sky-200 text-xs font-semibold">
                Open with Default App
              </button>
            )}
          </div>
        )}
        {status === 'ready' && (
          <>
            {showPages && (
              <div className="w-40 shrink-0 border-r border-white/8 bg-neutral-950/70 flex flex-col min-h-0" aria-label="Pages">
                <button
                  type="button"
                  onClick={() => insertInput.current?.click()}
                  className="m-2 h-8 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] font-medium flex items-center justify-center gap-1.5"
                  title="Insert the pages of another PDF after the current page"
                >
                  <FilePlus2 className="w-3.5 h-3.5" /> Insert PDF…
                </button>
                <input
                  ref={insertInput}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={e => {
                    const picked = e.target.files?.[0];
                    e.target.value = '';
                    if (picked) void insertPdf(picked);
                  }}
                />
                <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-3">
                  {state.pages.map((p, i) => {
                    const key = `${p.srcId}:${p.srcIndex}`;
                    const size = sizes[key] ?? { w: 612, h: 792 };
                    return (
                      <div key={p.id} className={`rounded-lg p-1.5 ${p.id === activePageId ? 'bg-orange-500/15 ring-1 ring-orange-400/50' : 'hover:bg-white/5'}`}>
                        <button type="button" onClick={() => goTo(p.id)} className="block w-full" title={`Go to page ${i + 1}`} aria-label={`Go to page ${i + 1}`}>
                          <PdfThumb page={proxies.current.get(key) ?? null} size={size} rotation={p.rotation} />
                        </button>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-[10px] font-mono text-neutral-400">{i + 1}</span>
                          <div className="flex items-center">
                            {([['Rotate left', RotateCcw, () => rotatePage(p.id, -90)], ['Rotate right', RotateCw, () => rotatePage(p.id, 90)]] as const).map(([label, Icon, run]) => (
                              <button key={label} type="button" onClick={run} className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-white" title={label} aria-label={`${label}, page ${i + 1}`}><Icon className="w-3 h-3" /></button>
                            ))}
                            <button type="button" onClick={() => movePage(p.id, -1)} disabled={i === 0} className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-white disabled:opacity-30" title="Move up" aria-label={`Move page ${i + 1} up`}><ArrowUp className="w-3 h-3" /></button>
                            <button type="button" onClick={() => movePage(p.id, 1)} disabled={i === state.pages.length - 1} className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-white disabled:opacity-30" title="Move down" aria-label={`Move page ${i + 1} down`}><ArrowDown className="w-3 h-3" /></button>
                            <button type="button" onClick={() => deletePage(p.id)} className="w-5 h-5 flex items-center justify-center text-neutral-400 hover:text-red-400" title="Delete page" aria-label={`Delete page ${i + 1}`}><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div ref={scroller} onScroll={onScroll} className="flex-1 min-w-0 overflow-auto bg-neutral-950/60 py-4 space-y-4" data-pdf-scroll>
              {state.pages.map((p, i) => {
                const key = `${p.srcId}:${p.srcIndex}`;
                const size = sizes[key] ?? { w: 612, h: 792 };
                return (
                  <PdfPageView
                    key={`${p.id}`}
                    entry={p}
                    page={proxies.current.get(key) ?? null}
                    size={size}
                    zoom={zoom}
                    tool={tool}
                    pen={pen}
                    annotations={state.annotations[p.id] ?? []}
                    selectedId={selected?.pageId === p.id ? selected.id : null}
                    pageNumber={i + 1}
                    onSelect={id => setSelected(id ? { pageId: p.id, id } : null)}
                    onActivate={() => setActivePageId(p.id)}
                    onCommit={list => setPageAnnotations(p.id, list)}
                    registerEl={el => { if (el) pageEls.current.set(p.id, el); else pageEls.current.delete(p.id); }}
                  />
                );
              })}
              <span className="hidden">{pageVersion}</span>
            </div>
            {showForm && fields.length > 0 && (
              <PdfFormPanel fields={fields} values={formValues} onChange={(name, value) => setFormValues(v => ({ ...v, [name]: value }))} />
            )}
          </>
        )}
      </div>
      {signing && <PdfSignatureDialog onCancel={() => setSigning(false)} onPlace={placeSignature} />}
    </div>
  );
};
