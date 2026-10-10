import { useCallback, useEffect, useState } from 'react';

/**
 * Render large folders in chunks so selecting Applications (etc.) does not
 * mount hundreds of icon tiles in one frame.
 */
export function useProgressiveItems<T>(
  items: readonly T[],
  initialCount = 60,
  step = 60,
): {
  visible: T[];
  hasMore: boolean;
  shownCount: number;
  totalCount: number;
  showMore: () => void;
} {
  const [shownCount, setShownCount] = useState(() => Math.min(initialCount, items.length));

  useEffect(() => {
    setShownCount(Math.min(initialCount, items.length));
  }, [items, initialCount]);

  const visible = items.length <= shownCount ? (items as T[]) : items.slice(0, shownCount);
  const hasMore = shownCount < items.length;

  const showMore = useCallback(() => {
    setShownCount(c => Math.min(items.length, c + step));
  }, [items.length, step]);

  return {
    visible,
    hasMore,
    shownCount: Math.min(shownCount, items.length),
    totalCount: items.length,
    showMore,
  };
}
