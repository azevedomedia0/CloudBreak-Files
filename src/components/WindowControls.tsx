import React, { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';

/** True on macOS and in a Mac browser, where the window buttons go at the top left. */
export const isMacLike = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

type Action = 'close' | 'minimize' | 'zoom';

const BUTTONS: { action: Action; label: string; color: string; glyph: string }[] = [
  { action: 'close', label: 'Close window', color: '#ff5f57', glyph: '×' },
  { action: 'minimize', label: 'Minimize window', color: '#febc2e', glyph: '−' },
  { action: 'zoom', label: 'Full screen', color: '#28c840', glyph: '+' },
];

/**
 * Close, minimize and full-screen buttons for the header, drawn like the macOS ones. In the desktop app the
 * native buttons are hidden (see `useWindowControlsHidden`) and these take over; in a browser they are shown
 * for layout only because a page cannot close or minimize its window.
 */
export const WindowControls: React.FC = () => {
  const [focused, setFocused] = useState(true);
  const [hover, setHover] = useState(false);
  const desktop = isTauri();

  useEffect(() => {
    if (desktop) {
      let unlisten: (() => void) | undefined;
      let cancelled = false;
      void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
        const off = await getCurrentWindow().onFocusChanged(({ payload }) => setFocused(payload));
        if (cancelled) off();
        else unlisten = off;
      }).catch(() => { /* focus state is cosmetic */ });
      return () => {
        cancelled = true;
        unlisten?.();
      };
    }
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    window.addEventListener('focus', on);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('focus', on);
      window.removeEventListener('blur', off);
    };
  }, [desktop]);

  const run = async (action: Action, altKey: boolean) => {
    if (!desktop) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      if (action === 'close') await win.close();
      else if (action === 'minimize') await win.minimize();
      else if (altKey) await win.toggleMaximize();
      else await win.setFullscreen(!(await win.isFullscreen()));
    } catch {
      /* the window manager refused; nothing to show */
    }
  };

  return (
    <div
      data-tauri-drag-region
      role="group"
      aria-label="Window controls"
      className="flex items-center gap-2 pl-0.5 pr-1 self-center shrink-0"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {BUTTONS.map(({ action, label, color, glyph }) => (
        <button
          key={action}
          type="button"
          onClick={e => void run(action, e.altKey)}
          aria-label={label}
          title={desktop ? (action === 'zoom' ? 'Full screen (Option-click to zoom)' : label) : `${label} (desktop app)`}
          className="relative w-3 h-3 rounded-full flex items-center justify-center text-[10px] leading-none font-bold text-black/60 transition-colors"
          style={{ backgroundColor: focused || hover ? color : '#4d4d52', boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.25)' }}
        >
          <span className={`transition-opacity ${hover ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true">{glyph}</span>
        </button>
      ))}
    </div>
  );
};
