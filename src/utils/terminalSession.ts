/**
 * What the terminal saves so it reopens as it was: tabs, splits, each pane's folder and title, the profile,
 * and the last lines of output (plain text). Shells themselves cannot be resumed; new ones start in the
 * saved folders, under the restored output, as in Terminal.app.
 */

import { isValidLayout, MAX_PANES_PER_TAB, type PaneLayout } from './terminalLayout';
import { profileById } from './terminalProfiles';

export const SESSION_VERSION = 1;
/** Output kept per pane. */
export const RESTORE_LINES = 500;
export const RESTORE_CHARS = 200_000;
const MAX_TABS = 20;

export interface SavedPane {
  id: string;
  cwd?: string;
  title?: string;
  text?: string;
}

export interface SavedTab {
  id: string;
  profileId: string;
  focusedPane: string;
  layout: PaneLayout;
  panes: SavedPane[];
}

export interface SavedSession {
  version: number;
  savedAt: string;
  activeTab: string;
  tabs: SavedTab[];
}

/** Output written back into a pane: plain text only. Escape sequences and other control characters are
 *  dropped so a damaged or edited file cannot drive the terminal. */
export function sanitizeRestoredText(text: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
  return clean.length > RESTORE_CHARS ? clean.slice(clean.length - RESTORE_CHARS) : clean;
}

/**
 * Lines of the terminal's normal buffer, with soft-wrapped rows joined back into one line so they reflow
 * at the new width. Trailing blank rows are dropped. `isWrapped(i)` says row i continues row i-1.
 */
export function joinBufferRows(rows: { text: string; isWrapped: boolean }[], maxLines = RESTORE_LINES): string {
  const lines: string[] = [];
  for (const row of rows) {
    if (row.isWrapped && lines.length) lines[lines.length - 1] += row.text;
    else lines.push(row.text);
  }
  const trimmed = lines.map(l => l.replace(/\s+$/, ''));
  while (trimmed.length && !trimmed[trimmed.length - 1]) trimmed.pop();
  return trimmed.slice(-maxLines).join('\n');
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

function str(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.length <= max ? value : undefined;
}

/** Parse a saved session, or null when it is missing, from another version, or malformed in any way. */
export function parseSavedSession(json: string | null): SavedSession | null {
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (s.version !== SESSION_VERSION || !Array.isArray(s.tabs) || !s.tabs.length || s.tabs.length > MAX_TABS) return null;

  const tabs: SavedTab[] = [];
  for (const t of s.tabs as unknown[]) {
    if (!t || typeof t !== 'object') return null;
    const tab = t as Record<string, unknown>;
    if (typeof tab.id !== 'string' || !ID.test(tab.id) || !Array.isArray(tab.panes)) return null;
    if (!tab.panes.length || tab.panes.length > MAX_PANES_PER_TAB) return null;
    const panes: SavedPane[] = [];
    for (const p of tab.panes as unknown[]) {
      if (!p || typeof p !== 'object') return null;
      const pane = p as Record<string, unknown>;
      if (typeof pane.id !== 'string' || !ID.test(pane.id)) return null;
      const cwd = str(pane.cwd, 4096);
      panes.push({
        id: pane.id,
        cwd: cwd?.startsWith('/') ? cwd : undefined,
        title: str(pane.title, 200),
        text: typeof pane.text === 'string' ? sanitizeRestoredText(pane.text) : undefined,
      });
    }
    const ids = new Set(panes.map(p => p.id));
    if (ids.size !== panes.length || !isValidLayout(tab.layout, ids)) return null;
    const focused = typeof tab.focusedPane === 'string' && ids.has(tab.focusedPane) ? tab.focusedPane : panes[0].id;
    tabs.push({ id: tab.id, profileId: profileById(str(tab.profileId, 64)).id, focusedPane: focused, layout: tab.layout, panes });
  }
  if (new Set(tabs.map(t => t.id)).size !== tabs.length) return null;
  const activeTab = typeof s.activeTab === 'string' && tabs.some(t => t.id === s.activeTab) ? s.activeTab : tabs[0].id;
  return { version: SESSION_VERSION, savedAt: str(s.savedAt, 64) ?? '', activeTab, tabs };
}
