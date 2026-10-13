/**
 * Split panes for the terminal: a tab's panes form a tree of rows and columns. The tree is only geometry;
 * every pane is rendered flat and positioned from `paneRects`, so splitting or closing a neighbour never
 * remounts a pane (which would end its shell).
 */

export type SplitDirection = 'row' | 'column';

export type PaneLayout =
  | { pane: string }
  | { dir: SplitDirection; children: PaneLayout[] };

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** More than this in a side panel leaves panes too small to type in. */
export const MAX_PANES_PER_TAB = 6;

export function paneIds(layout: PaneLayout): string[] {
  return 'pane' in layout ? [layout.pane] : layout.children.flatMap(paneIds);
}

/**
 * Split `target` and put `added` after it. `column` stacks top to bottom (⌘D), `row` places side by side.
 * Splitting in the direction the parent already runs adds a sibling instead of nesting.
 */
export function splitPane(layout: PaneLayout, target: string, added: string, dir: SplitDirection): PaneLayout {
  if ('pane' in layout) {
    return layout.pane === target ? { dir, children: [layout, { pane: added }] } : layout;
  }
  const at = layout.children.findIndex(c => 'pane' in c && c.pane === target);
  if (at >= 0 && layout.dir === dir) {
    const children = [...layout.children];
    children.splice(at + 1, 0, { pane: added });
    return { dir, children };
  }
  return { dir: layout.dir, children: layout.children.map(c => splitPane(c, target, added, dir)) };
}

/** Remove a pane. A split left with one child collapses into it. Null when it was the last pane. */
export function removePane(layout: PaneLayout, target: string): PaneLayout | null {
  if ('pane' in layout) return layout.pane === target ? null : layout;
  const children = layout.children
    .map(c => removePane(c, target))
    .filter((c): c is PaneLayout => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  // A collapsed child running the same way as its parent folds in, so sizes stay even.
  const flat = children.flatMap(c => ('dir' in c && c.dir === layout.dir ? c.children : [c]));
  return { dir: layout.dir, children: flat };
}

/** Where each pane sits, as fractions (0–1) of the tab's area. Children share their split evenly. */
export function paneRects(layout: PaneLayout, rect: Rect = { left: 0, top: 0, width: 1, height: 1 }): Map<string, Rect> {
  const out = new Map<string, Rect>();
  const walk = (node: PaneLayout, r: Rect) => {
    if ('pane' in node) {
      out.set(node.pane, r);
      return;
    }
    const n = node.children.length;
    node.children.forEach((child, i) => {
      walk(
        child,
        node.dir === 'row'
          ? { left: r.left + (r.width * i) / n, top: r.top, width: r.width / n, height: r.height }
          : { left: r.left, top: r.top + (r.height * i) / n, width: r.width, height: r.height / n },
      );
    });
  };
  walk(layout, rect);
  return out;
}

export type FocusDirection = 'left' | 'right' | 'up' | 'down';

const EPS = 1e-9;

/** The pane next to `from` in a direction (⌘⌥ arrows): the nearest one that overlaps it across that edge. */
export function neighbourPane(rects: Map<string, Rect>, from: string, dir: FocusDirection): string | null {
  const a = rects.get(from);
  if (!a) return null;
  let best: { id: string; gap: number; offset: number } | null = null;
  for (const [id, b] of rects) {
    if (id === from) continue;
    let gap: number;
    let overlaps: boolean;
    if (dir === 'left' || dir === 'right') {
      gap = dir === 'right' ? b.left - (a.left + a.width) : a.left - (b.left + b.width);
      overlaps = b.top < a.top + a.height - EPS && b.top + b.height > a.top + EPS;
    } else {
      gap = dir === 'down' ? b.top - (a.top + a.height) : a.top - (b.top + b.height);
      overlaps = b.left < a.left + a.width - EPS && b.left + b.width > a.left + EPS;
    }
    if (gap < -EPS || !overlaps) continue;
    // Prefer the closest, then the one most in line with the current pane's top or left edge.
    const offset = dir === 'left' || dir === 'right' ? Math.abs(b.top - a.top) : Math.abs(b.left - a.left);
    if (!best || gap < best.gap - EPS || (Math.abs(gap - best.gap) <= EPS && offset < best.offset)) {
      best = { id, gap, offset };
    }
  }
  return best?.id ?? null;
}

/** Accept a layout read back from disk only if it is well formed and names exactly these panes. */
export function isValidLayout(value: unknown, panes: Set<string>): value is PaneLayout {
  const seen = new Set<string>();
  const ok = (node: unknown, depth: number): boolean => {
    if (depth > 8 || !node || typeof node !== 'object') return false;
    const n = node as Record<string, unknown>;
    if (typeof n.pane === 'string') {
      if (!panes.has(n.pane) || seen.has(n.pane)) return false;
      seen.add(n.pane);
      return true;
    }
    return (n.dir === 'row' || n.dir === 'column')
      && Array.isArray(n.children)
      && n.children.length >= 2
      && n.children.every(c => ok(c, depth + 1));
  };
  return ok(value, 0) && seen.size === panes.size;
}
