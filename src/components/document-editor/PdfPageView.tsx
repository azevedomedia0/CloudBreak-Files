import React, { useEffect, useRef, useState } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';
import { renderPage } from '../../services/pdfEngine';
import {
  annotationAt, annotationBounds, displaySize, normalizeRect, rotatePoint, svgRotationMatrix, translateAnnotation,
  unrotatePoint, type PageEntry, type PdfAnnotation, type Pt,
} from '../../utils/pdfGeometry';

export type PdfTool = 'select' | 'highlight' | 'draw' | 'text' | 'rect' | 'ellipse' | 'line' | 'arrow';

export interface PdfPenStyle { color: string; width: number; textSize: number }

const imageUrls = new WeakMap<Uint8Array, string>();
/** A browser address for a signature's PNG bytes (made once per image). */
function pngUrl(png: Uint8Array): string {
  let url = imageUrls.get(png);
  if (!url) {
    url = URL.createObjectURL(new Blob([new Uint8Array(png)], { type: 'image/png' }));
    imageUrls.set(png, url);
  }
  return url;
}

let idSeq = 0;
export const newAnnotationId = () => `ann-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

/** One annotation as SVG, in content space. */
function AnnotationShape({ a }: { a: PdfAnnotation }) {
  switch (a.kind) {
    case 'highlight':
      return <rect x={a.x} y={a.y} width={a.w} height={a.h} fill={a.color} opacity={0.45} style={{ mixBlendMode: 'multiply' }} />;
    case 'rect':
      return <rect x={a.x} y={a.y} width={a.w} height={a.h} fill="none" stroke={a.color} strokeWidth={a.width} />;
    case 'ellipse':
      return <ellipse cx={a.x + a.w / 2} cy={a.y + a.h / 2} rx={a.w / 2} ry={a.h / 2} fill="none" stroke={a.color} strokeWidth={a.width} />;
    case 'line': {
      const head = Math.max(8, a.width * 4);
      const theta = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
      const tip = (turn: number) => `${a.x2 + head * Math.cos(theta + turn)},${a.y2 + head * Math.sin(theta + turn)}`;
      return (
        <g stroke={a.color} strokeWidth={a.width} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} />
          {a.arrow && <polyline points={`${tip(Math.PI * 0.85)} ${a.x2},${a.y2} ${tip(-Math.PI * 0.85)}`} />}
        </g>
      );
    }
    case 'ink':
      return a.points.length === 1
        ? <circle cx={a.points[0].x} cy={a.points[0].y} r={a.width / 2} fill={a.color} />
        : <polyline points={a.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={a.color} strokeWidth={a.width} strokeLinecap="round" strokeLinejoin="round" />;
    case 'text':
      return (
        <text x={a.x} y={a.y} fill={a.color} fontSize={a.size} fontFamily="Helvetica, Arial, sans-serif" style={{ userSelect: 'none' }}>
          {a.text.split('\n').map((line, i) => (
            <tspan key={i} x={a.x} y={a.y + a.size * 0.9 + i * a.size * 1.2}>{line || ' '}</tspan>
          ))}
        </text>
      );
    case 'image':
      return <image href={pngUrl(a.png)} x={a.x} y={a.y} width={a.w} height={a.h} preserveAspectRatio="none" />;
  }
}

interface PdfPageViewProps {
  entry: PageEntry;
  page: PDFPageProxy | null;
  /** The page in content space (its own /Rotate applied), in points. */
  size: { w: number; h: number };
  zoom: number;
  tool: PdfTool;
  pen: PdfPenStyle;
  annotations: PdfAnnotation[];
  selectedId: string | null;
  pageNumber: number;
  onSelect: (id: string | null) => void;
  onActivate: () => void;
  /** A finished change to this page's annotations (one undo step). */
  onCommit: (next: PdfAnnotation[]) => void;
  registerEl: (el: HTMLDivElement | null) => void;
}

export const PdfPageView: React.FC<PdfPageViewProps> = ({
  entry, page, size, zoom, tool, pen, annotations, selectedId, pageNumber, onSelect, onActivate, onCommit, registerEl,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<PdfAnnotation | null>(null);
  const [moving, setMoving] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [editing, setEditing] = useState<{ id?: string; x: number; y: number; text: string; size: number; color: string } | null>(null);
  const drag = useRef<
    | { type: 'shape'; start: Pt }
    | { type: 'ink'; points: Pt[] }
    | { type: 'move'; id: string; start: Pt; moved: boolean }
    | null
  >(null);

  const rot = entry.rotation;
  const d = displaySize(size.w, size.h, rot);

  useEffect(() => {
    registerEl(wrapRef.current);
    return () => registerEl(null);
  }, [registerEl]);

  // Draw the page only when it is near the screen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => setVisible(entries.some(e => e.isIntersecting)), { rootMargin: '700px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !page || !canvasRef.current) return;
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(zoom * dpr, 4096 / Math.max(size.w, size.h));
    const job = renderPage(page, canvasRef.current, scale, rot);
    job.done.catch(() => { /* a page that fails to draw stays blank */ });
    return () => job.cancel();
  }, [visible, page, zoom, rot, size.w, size.h]);

  const toContent = (e: React.PointerEvent): Pt => {
    const svg = svgRef.current!;
    const m = svg.getScreenCTM();
    const raw = m ? new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()) : new DOMPoint(0, 0);
    const p = unrotatePoint({ x: raw.x, y: raw.y }, d.w, d.h, rot);
    return { x: Math.max(0, Math.min(size.w, p.x)), y: Math.max(0, Math.min(size.h, p.y)) };
  };

  const startText = (at: Pt, existing?: Extract<PdfAnnotation, { kind: 'text' }>) => {
    setEditing(existing
      ? { id: existing.id, x: existing.x, y: existing.y, text: existing.text, size: existing.size, color: existing.color }
      : { x: at.x, y: at.y, text: '', size: pen.textSize, color: pen.color });
  };

  const finishText = (keep: boolean) => {
    const e = editing;
    setEditing(null);
    if (!e || !keep) return;
    const text = e.text.replace(/\s+$/, '');
    if (e.id) {
      onCommit(text ? annotations.map(a => (a.id === e.id && a.kind === 'text' ? { ...a, text } : a)) : annotations.filter(a => a.id !== e.id));
    } else if (text) {
      onCommit([...annotations, { id: newAnnotationId(), kind: 'text', x: e.x, y: e.y, text, size: e.size, color: e.color }]);
    }
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || editing) return;
    onActivate();
    const p = toContent(e);
    const tol = 6 / zoom;
    if (tool === 'select') {
      const hit = annotationAt(annotations, p, tol);
      onSelect(hit?.id ?? null);
      if (hit) {
        drag.current = { type: 'move', id: hit.id, start: p, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
    onSelect(null);
    if (tool === 'text') {
      e.preventDefault();
      const hit = annotationAt(annotations, p, tol);
      startText(p, hit?.kind === 'text' ? hit : undefined);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'draw') {
      drag.current = { type: 'ink', points: [p] };
      setDraft({ id: 'draft', kind: 'ink', points: [p], color: pen.color, width: pen.width });
    } else {
      drag.current = { type: 'shape', start: p };
    }
  };

  const shapeFor = (start: Pt, p: Pt): PdfAnnotation => {
    if (tool === 'line' || tool === 'arrow') {
      return { id: 'draft', kind: 'line', x1: start.x, y1: start.y, x2: p.x, y2: p.y, color: pen.color, width: pen.width, arrow: tool === 'arrow' };
    }
    const r = normalizeRect(start, p);
    if (tool === 'highlight') return { id: 'draft', kind: 'highlight', ...r, color: pen.color };
    if (tool === 'ellipse') return { id: 'draft', kind: 'ellipse', ...r, color: pen.color, width: pen.width };
    return { id: 'draft', kind: 'rect', ...r, color: pen.color, width: pen.width };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = drag.current;
    if (!g) return;
    const p = toContent(e);
    if (g.type === 'ink') {
      g.points = [...g.points, p];
      setDraft({ id: 'draft', kind: 'ink', points: g.points, color: pen.color, width: pen.width });
    } else if (g.type === 'shape') {
      setDraft(shapeFor(g.start, p));
    } else {
      const dx = p.x - g.start.x;
      const dy = p.y - g.start.y;
      if (Math.hypot(dx, dy) * zoom > 3) g.moved = true;
      if (g.moved) setMoving({ id: g.id, dx, dy });
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = drag.current;
    drag.current = null;
    if (!g) return;
    const p = toContent(e);
    if (g.type === 'ink') {
      setDraft(null);
      onCommit([...annotations, { id: newAnnotationId(), kind: 'ink', points: g.points, color: pen.color, width: pen.width }]);
    } else if (g.type === 'shape') {
      setDraft(null);
      const made = shapeFor(g.start, p);
      const big = made.kind === 'line' ? Math.hypot(made.x2 - made.x1, made.y2 - made.y1) > 3 : annotationBounds(made).w > 3 && annotationBounds(made).h > 3;
      if (big) onCommit([...annotations, { ...made, id: newAnnotationId() }]);
    } else if (moving) {
      const { dx, dy } = moving;
      setMoving(null);
      onCommit(annotations.map(a => (a.id === g.id ? translateAnnotation(a, dx, dy) : a)));
    } else {
      setMoving(null);
    }
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool !== 'select') return;
    const svg = svgRef.current!;
    const m = svg.getScreenCTM();
    if (!m) return;
    const raw = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const p = unrotatePoint({ x: raw.x, y: raw.y }, d.w, d.h, rot);
    const hit = annotationAt(annotations, p, 6 / zoom);
    if (hit?.kind === 'text') startText(p, hit);
  };

  const cursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair';
  const selected = annotations.find(a => a.id === selectedId);
  const box = selected ? annotationBounds(moving && moving.id === selected.id ? translateAnnotation(selected, moving.dx, moving.dy) : selected) : null;
  // Where the text box sits on screen while it is being typed (turned with the page, as it will be saved).
  const editShown = editing ? rotatePoint({ x: editing.x, y: editing.y }, size.w, size.h, rot) : null;

  return (
    <div
      ref={wrapRef}
      data-pdf-page={entry.id}
      className="relative bg-white shadow-xl mx-auto shrink-0"
      style={{ width: d.w * zoom, height: d.h * zoom }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {!visible && (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-xs select-none">Page {pageNumber}</div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${d.w} ${d.h}`}
        width={d.w * zoom}
        height={d.h * zoom}
        className="absolute inset-0"
        style={{ cursor, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <g transform={svgRotationMatrix(size.w, size.h, rot)}>
          {annotations.map(a => (
            <g key={a.id} transform={moving && moving.id === a.id ? `translate(${moving.dx} ${moving.dy})` : undefined} opacity={editing?.id === a.id ? 0 : 1}>
              <AnnotationShape a={a} />
            </g>
          ))}
          {draft && <AnnotationShape a={draft} />}
          {box && (
            <rect
              x={box.x - 3} y={box.y - 3} width={box.w + 6} height={box.h + 6}
              fill="none" stroke="#38bdf8" strokeWidth={1.5 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} pointerEvents="none"
            />
          )}
        </g>
      </svg>
      {editing && editShown && (
        <textarea
          autoFocus
          value={editing.text}
          onChange={e => setEditing({ ...editing, text: e.target.value })}
          onBlur={() => finishText(true)}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Escape') finishText(false);
            else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) finishText(true);
          }}
          placeholder="Type, then click away"
          rows={Math.max(1, editing.text.split('\n').length)}
          className="absolute z-10 bg-white/70 outline outline-1 outline-sky-400 resize-none overflow-hidden"
          style={{
            left: editShown.x * zoom,
            top: editShown.y * zoom,
            width: Math.max(160, Math.max(...editing.text.split('\n').map(l => l.length), 8) * editing.size * 0.6) * zoom,
            fontSize: editing.size * zoom,
            lineHeight: 1.2,
            color: editing.color,
            fontFamily: 'Helvetica, Arial, sans-serif',
            padding: 0,
            margin: 0,
            transform: `rotate(${rot}deg)`,
            transformOrigin: '0 0',
          }}
        />
      )}
    </div>
  );
};
