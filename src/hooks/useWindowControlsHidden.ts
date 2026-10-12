import { useEffect } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';

/** Hides the native window buttons (macOS) while `hidden` is true, and brings them back afterwards. */
export function useWindowControlsHidden(hidden: boolean): void {
  useEffect(() => {
    if (!isTauri()) return;
    void invoke('set_window_controls_hidden', { hidden }).catch(() => {
      // Not macOS, or the window is not ready yet: nothing to hide.
    });
    return () => {
      if (hidden) void invoke('set_window_controls_hidden', { hidden: false }).catch(() => {});
    };
  }, [hidden]);
}
