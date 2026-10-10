/** Run after the current paint so the shell can appear first. */
export function afterNextPaint(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fn();
      });
    });
    return;
  }
  setTimeout(fn, 0);
}

/** Run when the browser is idle, or after `timeoutMs` at the latest. */
export function whenIdle(fn: () => void, timeoutMs = 1200): () => void {
  let cancelled = false;
  const run = () => {
    if (!cancelled) fn();
  };

  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout: timeoutMs });
    return () => {
      cancelled = true;
      cancelIdleCallback(id);
    };
  }

  const timer = window.setTimeout(run, Math.min(timeoutMs, 400));
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}
