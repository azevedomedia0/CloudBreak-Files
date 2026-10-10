/** Resolves once the Desktop local scan finishes (or is skipped). Cloud/P2P wait on this. */
let resolveDesktopReady: (() => void) | null = null;
let desktopReady = false;

export const desktopScanReady: Promise<void> = new Promise<void>(resolve => {
  resolveDesktopReady = resolve;
});

export function markDesktopScanReady(): void {
  if (desktopReady) return;
  desktopReady = true;
  resolveDesktopReady?.();
}

/** Browser preview / no local FS — do not block background sync. */
export function markDesktopScanSkipped(): void {
  markDesktopScanReady();
}
