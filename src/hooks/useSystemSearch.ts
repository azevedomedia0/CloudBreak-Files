import { useEffect, useState } from 'react';
import { FileItem } from '../types';
import {
  hitToFileItem,
  systemSearchBridge,
} from '../services/systemSearchBridge';

const DEBOUNCE_MS = 320;
const MIN_QUERY = 2;

/** Debounced Spotlight search across the whole Mac. */
export function useSystemSearch(searchQuery: string): {
  systemResults: FileItem[];
  systemSearching: boolean;
} {
  const [systemResults, setSystemResults] = useState<FileItem[]>([]);
  const [systemSearching, setSystemSearching] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!systemSearchBridge.available() || q.length < MIN_QUERY) {
      setSystemResults([]);
      setSystemSearching(false);
      if (systemSearchBridge.available()) {
        void systemSearchBridge.clear().catch(() => {});
      }
      return;
    }

    let cancelled = false;
    setSystemSearching(true);
    const timer = window.setTimeout(() => {
      void systemSearchBridge
        .search(q)
        .then(hits => {
          if (cancelled) return;
          setSystemResults(
            hits
              .filter(h => !h.isDir)
              .map(hitToFileItem),
          );
        })
        .catch(() => {
          if (!cancelled) setSystemResults([]);
        })
        .finally(() => {
          if (!cancelled) setSystemSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  return { systemResults, systemSearching };
}
