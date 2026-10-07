import React, { useEffect, useRef, useState } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, ChevronUp,
  Download, FileText, Italic, Link, List, ListIndentDecrease, ListIndentIncrease, ListOrdered,
  PanelLeft, Pilcrow, Printer, Redo2, RemoveFormatting, Save, Search,
  Strikethrough, Underline, Undo2, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { FileItem } from '../../types';
import {
  countWords, fileExtension, htmlWithoutFindMarks, initialDocumentBody, isPlainTextDocument,
} from '../../utils/documentKind';

interface DocumentEditorModalProps {
  file: FileItem;
  isOpen: boolean;
  onClose: () => void;
  onSave: (file: FileItem) => void;
}

const ZOOMS = [50, 75, 100, 125, 150, 200];

const toolButton = 'w-7 h-7 shrink-0 flex items-center justify-center rounded text-[#fbfbfe] hover:bg-[#52525e] disabled:opacity-40 disabled:hover:bg-transparent';
const toolOn = 'bg-black text-white hover:bg-black';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char
  ));
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

export const DocumentEditorModal: React.FC<DocumentEditorModalProps> = ({ file, isOpen, onClose, onSave }) => {
  const plain = isPlainTextDocument(file);
  const starting = initialDocumentBody(file);
  const baselineRef = useRef(starting);
  const versionRef = useRef(file.version);
  const initialHtmlRef = useRef(starting);
  const richRef = useRef<HTMLDivElement>(null);
  const plainRef = useRef<HTMLTextAreaElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const marksRef = useRef<HTMLElement[]>([]);

  const [text, setText] = useState(starting);
  const [dirty, setDirty] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [sidebarOpen, setSidebarOpen] = useState(!plain);
  const [outline, setOutline] = useState<Array<{ index: number; level: number; text: string }>>([]);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [findMiss, setFindMiss] = useState(false);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [block, setBlock] = useState('p');
  const [active, setActive] = useState({ bold: false, italic: false, underline: false, strike: false });

  useEffect(() => {
    if (plain || !richRef.current) return;
    setOutline(readOutline(richRef.current));
    richRef.current.focus();
  }, [file.id, plain]);

  useEffect(() => {
    if (!findOpen) return;
    findRef.current?.focus();
    findRef.current?.select();
  }, [findOpen]);

  useEffect(() => {
    if (plain) return;
    const sync = () => {
      try {
        setActive({
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
          strike: document.queryCommandState('strikeThrough'),
        });
        const value = String(document.queryCommandValue('formatBlock') || 'p').replace(/[<>]/g, '').toLowerCase();
        if (value === 'h1' || value === 'h2' || value === 'p') setBlock(value);
      } catch {
        // queryCommand throws when the selection is outside the page.
      }
    };
    document.addEventListener('selectionchange', sync);
    return () => document.removeEventListener('selectionchange', sync);
  }, [plain]);

  if (!isOpen) return null;

  const plainMatches = (source: string, needle: string, caseSensitive: boolean) => {
    if (!needle) return [] as number[];
    const hay = caseSensitive ? source : source.toLowerCase();
    const look = caseSensitive ? needle : needle.toLowerCase();
    const found: number[] = [];
    let from = 0;
    while (from <= hay.length) {
      const at = hay.indexOf(look, from);
      if (at < 0) break;
      found.push(at);
      from = at + look.length;
    }
    return found;
  };

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
      if (!plain) clearRichMarks();
      setMatchCount(0);
      setMatchIndex(0);
      setFindMiss(false);
      return;
    }
    if (plain && plainRef.current) {
      const hits = plainMatches(plainRef.current?.value ?? text, needle, caseSensitive);
      setMatchCount(hits.length);
      setFindMiss(hits.length === 0);
      if (!hits.length) return;
      const index = (nextIndex + hits.length) % hits.length;
      setMatchIndex(index);
      plainRef.current.focus();
      plainRef.current.setSelectionRange(hits[index], hits[index] + needle.length);
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

  const currentBody = () => {
    if (plain) return text;
    return richRef.current ? htmlWithoutFindMarks(richRef.current) : starting;
  };

  const refreshRichState = () => {
    const root = richRef.current;
    if (!root) return;
    setDirty(htmlWithoutFindMarks(root) !== baselineRef.current);
    setOutline(readOutline(root));
  };

  const editHistory = (command: 'undo' | 'redo') => {
    (plain ? plainRef.current : richRef.current)?.focus();
    document.execCommand(command);
    if (plain && plainRef.current) {
      setText(plainRef.current.value);
      setDirty(plainRef.current.value !== baselineRef.current);
    } else {
      refreshRichState();
    }
  };

  const format = (command: string, value?: string) => {
    richRef.current?.focus();
    document.execCommand(command, false, value);
    refreshRichState();
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
    const body = plain ? `<pre>${escapeHtml(currentBody())}</pre>` : currentBody();
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
      pre{font:14px ui-monospace,monospace;white-space:pre-wrap}
      h1{font-size:28px}h2{font-size:20px}a{color:#0060df}
    </style></head><body>${body}</body></html>`);
    doc.close();
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  };

  const download = () => {
    const body = currentBody();
    const extension = plain ? (fileExtension(file.name) || 'txt') : 'html';
    const base = file.name.replace(/\.[^.]+$/, '');
    const blob = new Blob([plain ? body : `<!doctype html><meta charset="utf-8"><title>${escapeHtml(base)}</title><body>${body}</body>`], {
      type: plain ? 'text/plain' : 'text/html',
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
    } else if (event.key === 'Escape' && findOpen) {
      event.preventDefault();
      event.stopPropagation();
      setFindOpen(false);
      if (!plain) clearRichMarks();
      setMatchCount(0);
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

  const words = countWords(plain ? text : richRef.current?.textContent ?? '');
  const characters = (plain ? text : richRef.current?.textContent ?? '').length;
  const zoomIndex = ZOOMS.indexOf(zoom);

  return (
    <div
      data-document-editor
      onKeyDown={onEditorKeyDown}
      className="fixed inset-0 z-50 flex flex-col bg-[#2a2a2e] text-[#fbfbfe] select-text"
    >
      <div className="h-10 shrink-0 flex items-center gap-1 px-2 bg-[#38383d] border-b border-black">
        {!plain && (
          <button
            type="button"
            onClick={() => setSidebarOpen(open => !open)}
            className={`${toolButton} ${sidebarOpen ? toolOn : ''}`}
            title="Document outline"
            aria-pressed={sidebarOpen}
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}
        <button type="button" onClick={() => setFindOpen(open => !open)} className={`${toolButton} ${findOpen ? toolOn : ''}`} title="Find in document (Ctrl+F)" aria-pressed={findOpen}>
          <Search className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0 px-2">
          <FileText className="w-4 h-4 shrink-0 text-[#cfcfd8]" />
          <span className="text-xs truncate max-w-[280px]">{file.name}</span>
        </div>

        <div className="flex-1 flex items-center justify-center gap-1">
          <button type="button" onClick={() => setZoom(ZOOMS[Math.max(0, zoomIndex - 1)] ?? 50)} className={toolButton} title="Zoom out" disabled={zoomIndex <= 0}>
            <ZoomOut className="w-4 h-4" />
          </button>
          <select
            value={zoom}
            onChange={event => setZoom(Number(event.target.value))}
            className="h-7 px-1 rounded bg-[#42414d] border border-[#8f8f9d]/50 text-xs text-[#fbfbfe]"
            aria-label="Zoom"
          >
            {ZOOMS.map(value => <option key={value} value={value}>{value}%</option>)}
          </select>
          <button type="button" onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zoomIndex + 1)] ?? 200)} className={toolButton} title="Zoom in" disabled={zoomIndex >= ZOOMS.length - 1}>
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <button type="button" onClick={() => editHistory('undo')} className={toolButton} title="Undo">
          <Undo2 className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => editHistory('redo')} className={toolButton} title="Redo">
          <Redo2 className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-white/20 mx-1" />
        <button
          type="button"
          onClick={save}
          disabled={!dirty}
          className="h-7 px-2.5 rounded bg-[#0060df] hover:bg-[#0250bb] disabled:bg-[#52525e] disabled:text-white/60 text-xs font-semibold text-white flex items-center gap-1.5"
          title="Save (Ctrl+S)"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save</span>
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

      {!plain && (
        <div className="h-9 shrink-0 flex items-center gap-0.5 px-2 bg-[#2b2a33] border-b border-black overflow-x-auto">
          <FormatButton title="Bold (Ctrl+B)" onClick={() => format('bold')} pressed={active.bold}><Bold className="w-4 h-4" /></FormatButton>
          <FormatButton title="Italic (Ctrl+I)" onClick={() => format('italic')} pressed={active.italic}><Italic className="w-4 h-4" /></FormatButton>
          <FormatButton title="Underline (Ctrl+U)" onClick={() => format('underline')} pressed={active.underline}><Underline className="w-4 h-4" /></FormatButton>
          <FormatButton title="Strikethrough" onClick={() => format('strikeThrough')} pressed={active.strike}><Strikethrough className="w-4 h-4" /></FormatButton>
          <div className="w-px h-4 bg-white/20 mx-1" />
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
            className="h-7 px-1 rounded bg-[#42414d] border border-[#8f8f9d]/50 text-xs text-[#fbfbfe]"
            aria-label="Paragraph style"
          >
            <option value="p">Paragraph</option>
            <option value="h1">Heading</option>
            <option value="h2">Subheading</option>
          </select>
          <FormatButton title="Paragraph" onClick={() => { setBlock('p'); format('formatBlock', '<p>'); }}><Pilcrow className="w-4 h-4" /></FormatButton>
          <div className="w-px h-4 bg-white/20 mx-1" />
          <FormatButton title="Bulleted list" onClick={() => format('insertUnorderedList')}><List className="w-4 h-4" /></FormatButton>
          <FormatButton title="Numbered list" onClick={() => format('insertOrderedList')}><ListOrdered className="w-4 h-4" /></FormatButton>
          <FormatButton title="Decrease indent" onClick={() => format('outdent')}><ListIndentDecrease className="w-4 h-4" /></FormatButton>
          <FormatButton title="Increase indent" onClick={() => format('indent')}><ListIndentIncrease className="w-4 h-4" /></FormatButton>
          <div className="w-px h-4 bg-white/20 mx-1" />
          <FormatButton title="Align left" onClick={() => format('justifyLeft')}><AlignLeft className="w-4 h-4" /></FormatButton>
          <FormatButton title="Align center" onClick={() => format('justifyCenter')}><AlignCenter className="w-4 h-4" /></FormatButton>
          <FormatButton title="Align right" onClick={() => format('justifyRight')}><AlignRight className="w-4 h-4" /></FormatButton>
          <div className="w-px h-4 bg-white/20 mx-1" />
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
          <FormatButton title="Clear formatting" onClick={() => format('removeFormat')}><RemoveFormatting className="w-4 h-4" /></FormatButton>
          {linkDraft !== null && (
            <form
              className="flex items-center gap-1 ml-1"
              onSubmit={event => {
                event.preventDefault();
                applyLink();
              }}
            >
              <input
                autoFocus
                value={linkDraft}
                onChange={event => setLinkDraft(event.target.value)}
                className="h-7 w-44 px-2 rounded bg-[#42414d] border border-[#8f8f9d]/50 text-xs text-[#fbfbfe]"
                aria-label="Link address"
              />
              <button type="submit" className="h-7 px-2 rounded bg-[#0060df] text-xs font-semibold">Apply</button>
              <button type="button" onClick={() => setLinkDraft(null)} className="h-7 px-2 rounded hover:bg-[#52525e] text-xs">Cancel</button>
            </form>
          )}
        </div>
      )}

      {findOpen && (
        <form
          className="h-10 shrink-0 flex items-center gap-2 px-3 bg-[#38383d] border-b border-black"
          onSubmit={event => {
            event.preventDefault();
            stepFind(1);
          }}
        >
          <Search className="w-3.5 h-3.5 text-[#cfcfd8]" />
          <input
            ref={findRef}
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              runFind(event.target.value, 0);
            }}
            placeholder="Find in document"
            className={`h-7 w-56 px-2 rounded bg-[#42414d] border text-xs text-[#fbfbfe] ${findMiss ? 'border-[#ff4f5e]' : 'border-[#8f8f9d]/50'}`}
            aria-label="Find in document"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-[#fbfbfe]">
            <input type="checkbox" checked={matchCase} onChange={event => { setMatchCase(event.target.checked); runFind(query, 0, event.target.checked); }} />
            Match case
          </label>
          <button type="button" onClick={() => stepFind(-1)} className={toolButton} title="Previous match" disabled={!matchCount}>
            <ChevronUp className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => stepFind(1)} className={toolButton} title="Next match" disabled={!matchCount}>
            <ChevronDown className="w-4 h-4" />
          </button>
          <span className="text-[11px] text-[#cfcfd8] min-w-24">
            {query.trim() ? (matchCount ? `${matchIndex + 1} of ${matchCount}` : 'Phrase not found') : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              setFindOpen(false);
              if (!plain) clearRichMarks();
              setMatchCount(0);
            }}
            className={`${toolButton} ml-auto`}
            title="Close find"
          >
            <X className="w-4 h-4" />
          </button>
        </form>
      )}

      <div className="flex-1 min-h-0 flex">
        {!plain && sidebarOpen && (
          <aside className="w-56 shrink-0 overflow-y-auto bg-[#323234] border-r border-black p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#cfcfd8] mb-2">Outline</div>
            {outline.length === 0 && <p className="text-xs text-[#cfcfd8]">Headings you add show up here.</p>}
            <div className="space-y-0.5">
              {outline.map(item => (
                <button
                  key={item.index}
                  type="button"
                  onClick={() => {
                    const heading = richRef.current?.querySelectorAll('h1, h2, h3')[item.index];
                    heading?.scrollIntoView({ block: 'center' });
                  }}
                  className="w-full text-left text-xs text-[#fbfbfe] hover:bg-[#52525e] rounded px-2 py-1 truncate"
                  style={{ paddingLeft: `${8 + (item.level - 1) * 12}px` }}
                >
                  {item.text}
                </button>
              ))}
            </div>
          </aside>
        )}

        <div className="flex-1 overflow-auto py-8 px-6">
          <div className="mx-auto" style={{ zoom: zoom / 100 }}>
            {plain ? (
              <textarea
                ref={plainRef}
                defaultValue={starting}
                spellCheck={!['json', 'csv', 'log', 'xml', 'yaml', 'yml'].includes(fileExtension(file.name))}
                onInput={event => {
                  const value = event.currentTarget.value;
                  setText(value);
                  setDirty(value !== baselineRef.current);
                }}
                aria-label={file.name}
                className="block w-[816px] min-h-[1056px] bg-white text-[#15141a] shadow-[0_2px_8px_rgba(0,0,0,0.4)] p-16 font-mono text-[15px] leading-relaxed resize-none outline-none"
              />
            ) : (
              <div
                ref={richRef}
                contentEditable
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: initialHtmlRef.current }}
                role="textbox"
                aria-multiline="true"
                aria-label={file.name}
                spellCheck
                onInput={refreshRichState}
                className="doc-page w-[816px] min-h-[1056px] bg-white text-[#15141a] shadow-[0_2px_8px_rgba(0,0,0,0.4)] px-[72px] py-16 outline-none font-serif text-base leading-relaxed"
              />
            )}
          </div>
        </div>
      </div>

      <div className="h-7 shrink-0 px-3 flex items-center justify-between bg-[#323234] border-t border-black text-[11px] text-[#cfcfd8]">
        <span>{plain ? 'Plain text' : 'Rich text'} · {file.mimeType}</span>
        <span className="font-mono">{words} words · {characters} characters</span>
        <span className={dirty ? 'text-[#ffb86c]' : ''}>{dirty ? 'Unsaved changes' : 'Saved'}</span>
      </div>

      {confirmClose && (
        <div className="absolute top-12 right-3 w-72 rounded-lg bg-[#42414d] border border-black shadow-2xl p-3 text-sm">
          <p>This document has unsaved changes.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmClose(false)} className="h-7 px-2 rounded hover:bg-white/10 text-xs">Keep editing</button>
            <button type="button" onClick={onClose} className="h-7 px-2 rounded bg-[#0060df] text-xs font-semibold">Discard</button>
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
