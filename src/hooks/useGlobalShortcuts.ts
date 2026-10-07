import { useEffect, useRef } from 'react';

interface Options {
  canQuickLook: boolean;
  onToggleSidebar: () => void;
  onToggleQuickLook: () => void;
}

/** Cmd/Ctrl+B toggles the sidebar. Space toggles Quick Look when no other modal is open. */
export function useGlobalShortcuts(options: Options) {
  // Keep the latest options in a ref so the listener is added once.
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLElement && e.target.closest('[data-document-editor]')) return;

      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'b' || (e.ctrlKey && e.key.toLowerCase() === 's'))) {
        e.preventDefault();
        latest.current.onToggleSidebar();
        return;
      }

      if (e.code === 'Space' && latest.current.canQuickLook) {
        e.preventDefault();
        latest.current.onToggleQuickLook();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
