/**
 * PDF editor model and coordinate maths (no libraries, so it can be tested on its own).
 *
 * Annotations live in "content space": the page as it looks with the page's own /Rotate applied and no extra
 * turn by the person (origin top-left, y down, units of PDF points). Turning a page in the editor only changes how
 * content space is shown, so annotations stay on the same bit of the page. Saving converts content space to PDF
 * user space with `contentToPdf`.
 */

export type Rot = 0 | 90 | 180 | 270;

export interface Pt { x: number; y: number }

export type PdfAnnotation =
  | { id: string; kind: 'highlight'; x: number; y: number; w: number; h: number; color: string }
  | { id: string; kind: 'ink'; points: Pt[]; color: string; width: number }
  | { id: string; kind: 'text'; x: number; y: number; text: string; size: number; color: string }
  | { id: string; kind: 'rect'; x: number; y: number; w: number; h: number; color: string; width: number }
  | { id: string; kind: 'ellipse'; x: number; y: number; w: number; h: number; color: string; width: number }
  | { id: string; kind: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; arrow: boolean }
  | { id: string; kind: 'image'; x: number; y: number; w: number; h: number; png: Uint8Array };

/** A page of the edited document: which page of which source, and the extra turn the person gave it. */
export interface PageEntry { id: string; srcId: string; srcIndex: number; rotation: Rot }

export const normalizeRot = (degrees: number): Rot => ((((Math.round(degrees / 90) * 90) % 360) + 360) % 360) as Rot;

/** Content point -> display point after turning the page clockwise by `rot` (`w` x `h` is the content size). */
export function rotatePoint(p: Pt, w: number, h: number, rot: Rot): Pt {
  switch (rot) {
    case 90: return { x: h - p.y, y: p.x };
    case 180: return { x: w - p.x, y: h - p.y };
    case 270: return { x: p.y, y: w - p.x };
    default: return { x: p.x, y: p.y };
  }
}

/** The reverse of `rotatePoint`; `dw` x `dh` is the display size. */
export function unrotatePoint(p: Pt, dw: number, dh: number, rot: Rot): Pt {
  switch (rot) {
    case 90: return { x: p.y, y: dw - p.x };
    case 180: return { x: dw - p.x, y: dh - p.y };
    case 270: return { x: dh - p.y, y: p.x };
    default: return { x: p.x, y: p.y };
  }
}

export function displaySize(w: number, h: number, rot: Rot): { w: number; h: number } {
  return rot === 90 || rot === 270 ? { w: h, h: w } : { w, h };
}

/** SVG matrix that draws content-space shapes into a display of `rotatePoint`'s orientation. */
export function svgRotationMatrix(w: number, h: number, rot: Rot): string {
  switch (rot) {
    case 90: return `matrix(0 1 -1 0 ${h} 0)`;
    case 180: return `matrix(-1 0 0 -1 ${w} ${h})`;
    case 270: return `matrix(0 -1 1 0 0 ${w})`;
    default: return 'matrix(1 0 0 1 0 0)';
  }
}

/** The page box in PDF user space, as [x0, y0, x1, y1] (the crop box, else the media box). */
export type PageView = [number, number, number, number];

/** Size of the page in content space (the page's own /Rotate applied). */
export function contentSize(view: PageView, pageRotate: Rot): { w: number; h: number } {
  return displaySize(view[2] - view[0], view[3] - view[1], pageRotate);
}

/** Content-space point -> PDF user-space point, for a page with box `view` and its own /Rotate `pageRotate`. */
export function contentToPdf(p: Pt, view: PageView, pageRotate: Rot): Pt {
  const { w, h } = contentSize(view, pageRotate);
  const un = unrotatePoint(p, w, h, pageRotate);
  return { x: view[0] + un.x, y: view[3] - un.y };
}

export function normalizeRect(a: Pt, b: Pt): { x: number; y: number; w: number; h: number } {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function annotationBounds(a: PdfAnnotation): { x: number; y: number; w: number; h: number } {
  switch (a.kind) {
    case 'ink': {
      const xs = a.points.map(p => p.x);
      const ys = a.points.map(p => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case 'line': return normalizeRect({ x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 });
    case 'text': {
      const lines = a.text.split('\n');
      const longest = Math.max(...lines.map(l => l.length), 1);
      return { x: a.x, y: a.y, w: longest * a.size * 0.55, h: lines.length * a.size * 1.2 };
    }
    default: return { x: a.x, y: a.y, w: a.w, h: a.h };
  }
}

export function translateAnnotation<T extends PdfAnnotation>(a: T, dx: number, dy: number): T {
  switch (a.kind) {
    case 'ink': return { ...a, points: a.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    case 'line': return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy };
    default: return { ...a, x: (a as { x: number }).x + dx, y: (a as { y: number }).y + dy };
  }
}

/** Distance from a point to a segment. */
function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Whether a click lands on an annotation (`tol` in points: a bit of slack around thin strokes). */
export function hitTest(a: PdfAnnotation, p: Pt, tol = 4): boolean {
  if (a.kind === 'ink') {
    if (a.points.length === 1) return Math.hypot(p.x - a.points[0].x, p.y - a.points[0].y) <= tol + a.width;
    for (let i = 1; i < a.points.length; i++) {
      if (segmentDistance(p, a.points[i - 1], a.points[i]) <= tol + a.width / 2) return true;
    }
    return false;
  }
  if (a.kind === 'line') return segmentDistance(p, { x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }) <= tol + a.width / 2;
  const b = annotationBounds(a);
  return p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol;
}

/** The topmost annotation under a point (later ones are drawn on top). */
export function annotationAt(list: PdfAnnotation[], p: Pt, tol = 4): PdfAnnotation | undefined {
  for (let i = list.length - 1; i >= 0; i--) {
    if (hitTest(list[i], p, tol)) return list[i];
  }
  return undefined;
}

/** Hex like "#ff9900" -> 0..1 channels. */
export function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Undo / redo over immutable snapshots. */
export interface History<T> { past: T[]; present: T; future: T[] }

export const newHistory = <T,>(present: T): History<T> => ({ past: [], present, future: [] });

export function pushHistory<T>(h: History<T>, next: T, limit = 100): History<T> {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-limit), present: next, future: [] };
}

export function undoHistory<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redoHistory<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
