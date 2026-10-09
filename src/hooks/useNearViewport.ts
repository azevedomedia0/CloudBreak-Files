import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * True once the element is near the viewport (IntersectionObserver).
 * Stays true after first intersection so thumbs/media are not torn down on scroll-away.
 */
export function useNearViewport<T extends Element>(
  rootMargin = '200px',
): { ref: RefObject<T | null>; near: boolean } {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { root: null, rootMargin, threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, rootMargin]);

  return { ref, near };
}
