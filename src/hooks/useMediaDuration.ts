import { useEffect, useState } from 'react';

/**
 * Resolve media length in seconds. Prefers a known positive value, otherwise
 * loads metadata from `url` (asset / blob) so thumbnail badges show real runtime.
 */
export function useMediaDuration(url: string | undefined, knownSeconds?: number): number {
  const known = knownSeconds && Number.isFinite(knownSeconds) && knownSeconds > 0
    ? knownSeconds
    : 0;
  const [duration, setDuration] = useState(known);

  useEffect(() => {
    if (known > 0) {
      setDuration(known);
    }
    if (!url || url === '#') return;

    const el = document.createElement('video');
    el.preload = 'metadata';
    el.muted = true;
    el.playsInline = true;

    const apply = () => {
      const d = el.duration;
      if (Number.isFinite(d) && d > 0) setDuration(d);
    };

    el.addEventListener('loadedmetadata', apply);
    el.src = url;

    return () => {
      el.removeEventListener('loadedmetadata', apply);
      el.removeAttribute('src');
      el.load();
    };
  }, [url, known]);

  return duration;
}
