/**
 * macOS Terminal key bindings. xterm.js knows nothing about Command or the Option word-jump keys, so
 * they are translated here: either text to send to the shell, or an action for the terminal panel.
 */

export type TerminalAction =
  | 'copy' | 'paste' | 'selectAll' | 'clear' | 'find' | 'findNext' | 'findPrevious'
  | 'newTab' | 'closeTab' | 'nextTab' | 'previousTab' | 'selectTab'
  | 'zoomIn' | 'zoomOut' | 'zoomReset';

export type KeyResult =
  | { type: 'send'; data: string }
  | { type: 'action'; action: TerminalAction; index?: number };

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const send = (data: string): KeyResult => ({ type: 'send', data });
const act = (action: TerminalAction, index?: number): KeyResult => ({ type: 'action', action, index });

/** What a key press means for the terminal, or null to let xterm handle it as usual. */
export function translateKey(e: KeyLike): KeyResult | null {
  const key = e.key.toLowerCase();

  if (e.metaKey && !e.ctrlKey) {
    if (!e.altKey) {
      switch (key) {
        case 'c': return e.shiftKey ? null : act('copy');
        case 'v': return e.shiftKey ? null : act('paste');
        case 'a': return e.shiftKey ? null : act('selectAll');
        case 'k': return e.shiftKey ? null : act('clear');
        case 'f': return e.shiftKey ? null : act('find');
        case 'g': return act(e.shiftKey ? 'findPrevious' : 'findNext');
        case 't': return e.shiftKey ? null : act('newTab');
        case 'w': return e.shiftKey ? null : act('closeTab');
        case ']': case '}': return e.shiftKey ? act('nextTab') : null;
        case '[': case '{': return e.shiftKey ? act('previousTab') : null;
        case '=': case '+': return act('zoomIn');
        case '-': case '_': return act('zoomOut');
        case '0': return act('zoomReset');
        case 'arrowleft': return send('\x01'); // start of line
        case 'arrowright': return send('\x05'); // end of line
        case 'backspace': return send('\x15'); // delete to the start of the line
        default:
          if (/^[1-9]$/.test(key) && !e.shiftKey) return act('selectTab', Number(key) - 1);
          return null;
      }
    }
    return null;
  }

  if (e.ctrlKey && !e.metaKey && !e.altKey && key === 'tab') {
    return act(e.shiftKey ? 'previousTab' : 'nextTab');
  }

  if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
    switch (key) {
      case 'arrowleft': return send('\x1bb'); // back a word
      case 'arrowright': return send('\x1bf'); // forward a word
      case 'backspace': return send('\x1b\x7f'); // delete the previous word
      case 'delete': return send('\x1bd'); // delete the next word
      default: return null;
    }
  }
  return null;
}

/** Terminal font sizes, in points. */
export const FONT_MIN = 8;
export const FONT_MAX = 28;
export const FONT_DEFAULT = 12;

export function clampFontSize(size: number): number {
  return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(size)));
}
