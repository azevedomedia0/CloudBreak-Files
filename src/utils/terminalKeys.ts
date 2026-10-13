/**
 * macOS Terminal key bindings. xterm.js knows nothing about Command or the Option word-jump keys, so
 * they are translated here: either text to send to the shell, or an action for the terminal panel.
 */

export type TerminalAction =
  | 'copy' | 'paste' | 'selectAll' | 'clear' | 'find' | 'findNext' | 'findPrevious'
  | 'newTab' | 'close' | 'nextTab' | 'previousTab' | 'selectTab'
  | 'splitDown' | 'splitRight' | 'nextPane' | 'previousPane' | 'focusPane'
  | 'previousMark' | 'nextMark'
  | 'zoomIn' | 'zoomOut' | 'zoomReset';

export type PaneDirection = 'left' | 'right' | 'up' | 'down';

export type KeyResult =
  | { type: 'send'; data: string }
  | { type: 'action'; action: TerminalAction; index?: number; direction?: PaneDirection };

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const send = (data: string): KeyResult => ({ type: 'send', data });
const act = (action: TerminalAction, index?: number): KeyResult => ({ type: 'action', action, index });
const ARROWS: Record<string, PaneDirection> = {
  arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down',
};

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
        // ⌘W closes the pane with focus, and the tab with its last pane.
        case 'w': return e.shiftKey ? null : act('close');
        // ⌘D splits top and bottom (as in Terminal.app); ⌘⇧D side by side.
        case 'd': return act(e.shiftKey ? 'splitRight' : 'splitDown');
        case ']': case '}': return act(e.shiftKey ? 'nextTab' : 'nextPane');
        case '[': case '{': return act(e.shiftKey ? 'previousTab' : 'previousPane');
        // Jump between prompts (marks), as Terminal.app's ⌘↑ / ⌘↓.
        case 'arrowup': return e.shiftKey ? null : act('previousMark');
        case 'arrowdown': return e.shiftKey ? null : act('nextMark');
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
    // ⌘⌥ arrows move focus to the neighbouring split pane.
    if (!e.shiftKey && ARROWS[key]) return { type: 'action', action: 'focusPane', direction: ARROWS[key] };
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
