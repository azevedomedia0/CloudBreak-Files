/**
 * Terminal profiles: a colour theme and cursor style per tab, picked from the header's palette menu.
 * The last profile chosen is used for new tabs. "Cloudbreak" follows the app's appearance.
 */

import type { ITheme } from '@xterm/xterm';

export type CursorStyle = 'block' | 'bar' | 'underline';

export interface TerminalProfile {
  id: string;
  name: string;
  /** Swatch colours for the menu: background and text. */
  swatch: [string, string];
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  /** Null: follow the app theme (see `cloudbreakTheme`). */
  theme: ITheme | null;
}

const ANSI_DARK = {
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

const ANSI_LIGHT = {
  black: '#000000',
  red: '#b91c1c',
  green: '#15803d',
  yellow: '#a16207',
  blue: '#1d4ed8',
  magenta: '#a21caf',
  cyan: '#0e7490',
  white: '#d4d4d8',
  brightBlack: '#52525b',
  brightRed: '#dc2626',
  brightGreen: '#16a34a',
  brightYellow: '#ca8a04',
  brightBlue: '#2563eb',
  brightMagenta: '#c026d3',
  brightCyan: '#0891b2',
  brightWhite: '#ffffff',
};

const XTERM_THEME_DARK: ITheme = {
  // Transparent so the glass panel shows through (no solid black layer).
  background: '#00000000',
  foreground: '#c0c0c8',
  cursor: '#a3e635',
  cursorAccent: '#121214',
  selectionBackground: '#a3e63555',
  ...ANSI_DARK,
};

const XTERM_THEME_GLACIAL: ITheme = {
  ...XTERM_THEME_DARK,
  background: '#2b4c59',
  foreground: '#beceda',
  cursor: '#beceda',
  cursorAccent: '#2b4c59',
  selectionBackground: '#95bccc66',
  black: '#2b4c59',
};

const XTERM_THEME_LIGHT: ITheme = {
  ...XTERM_THEME_DARK,
  background: '#001d3d',
  foreground: '#c8d4e0',
  cursorAccent: '#001d3d',
  black: '#001d3d',
};

/** The Cloudbreak profile's colours for the app's current appearance. */
export function cloudbreakTheme(): ITheme {
  const theme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
  if (theme === 'glacial') return XTERM_THEME_GLACIAL;
  if (theme === 'gnome') return XTERM_THEME_LIGHT;
  return XTERM_THEME_DARK;
}

export const TERMINAL_PROFILES: TerminalProfile[] = [
  { id: 'cloudbreak', name: 'Cloudbreak', swatch: ['#18181b', '#a3e635'], cursorStyle: 'block', cursorBlink: false, theme: null },
  {
    id: 'basic', name: 'Basic', swatch: ['#ffffff', '#000000'], cursorStyle: 'block', cursorBlink: false,
    theme: { background: '#ffffff', foreground: '#000000', cursor: '#7f7f7f', cursorAccent: '#ffffff', selectionBackground: '#b4d5fe', ...ANSI_LIGHT },
  },
  {
    id: 'pro', name: 'Pro', swatch: ['#000000', '#f2f2f2'], cursorStyle: 'block', cursorBlink: false,
    theme: { background: '#000000', foreground: '#f2f2f2', cursor: '#4d4d4d', cursorAccent: '#000000', selectionBackground: '#414141', ...ANSI_DARK },
  },
  {
    id: 'homebrew', name: 'Homebrew', swatch: ['#000000', '#28fe14'], cursorStyle: 'block', cursorBlink: true,
    theme: { background: '#000000', foreground: '#28fe14', cursor: '#38fe27', cursorAccent: '#000000', selectionBackground: '#083905', ...ANSI_DARK, green: '#28fe14', brightGreen: '#5dff4f' },
  },
  {
    id: 'ocean', name: 'Ocean', swatch: ['#224fbc', '#ffffff'], cursorStyle: 'block', cursorBlink: false,
    theme: { background: '#224fbc', foreground: '#ffffff', cursor: '#7f7f7f', cursorAccent: '#224fbc', selectionBackground: '#216dff', ...ANSI_DARK, blue: '#93c5fd', black: '#1e3a8a' },
  },
  {
    id: 'novel', name: 'Novel', swatch: ['#dfdbc3', '#3b2322'], cursorStyle: 'bar', cursorBlink: false,
    theme: { background: '#dfdbc3', foreground: '#3b2322', cursor: '#73635a', cursorAccent: '#dfdbc3', selectionBackground: '#a4a390', ...ANSI_LIGHT },
  },
  {
    id: 'solarized-dark', name: 'Solarized Dark', swatch: ['#002b36', '#839496'], cursorStyle: 'block', cursorBlink: false,
    theme: {
      background: '#002b36', foreground: '#839496', cursor: '#93a1a1', cursorAccent: '#002b36', selectionBackground: '#073642',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#93a1a1', brightYellow: '#839496', brightBlue: '#657b83', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
    },
  },
  {
    id: 'solarized-light', name: 'Solarized Light', swatch: ['#fdf6e3', '#657b83'], cursorStyle: 'bar', cursorBlink: false,
    theme: {
      background: '#fdf6e3', foreground: '#657b83', cursor: '#586e75', cursorAccent: '#fdf6e3', selectionBackground: '#eee8d5',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
    },
  },
];

export const DEFAULT_PROFILE_ID = 'cloudbreak';

export function profileById(id: string | undefined): TerminalProfile {
  return TERMINAL_PROFILES.find(p => p.id === id) ?? TERMINAL_PROFILES[0];
}

export function profileTheme(profile: TerminalProfile): ITheme {
  return profile.theme ?? cloudbreakTheme();
}

const PROFILE_KEY = 'cloudbreak.terminal.profile';

export function loadDefaultProfileId(): string {
  try {
    return profileById(localStorage.getItem(PROFILE_KEY) ?? undefined).id;
  } catch {
    return DEFAULT_PROFILE_ID;
  }
}

export function saveDefaultProfileId(id: string): void {
  try {
    localStorage.setItem(PROFILE_KEY, id);
  } catch { /* storage unavailable */ }
}
