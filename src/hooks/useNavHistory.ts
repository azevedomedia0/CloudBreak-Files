import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { CloudProviderId, FileCategory } from '../types';

/** Sidebar / browser place the Back–Forward stack remembers. */
export interface NavLocation {
  accountId: CloudProviderId;
  folderId: string | null;
  libraryId: string | null;
  sourceId: string | null;
  category: FileCategory;
}

export function navLocationsEqual(a: NavLocation, b: NavLocation): boolean {
  return (
    a.accountId === b.accountId
    && a.folderId === b.folderId
    && a.libraryId === b.libraryId
    && a.sourceId === b.sourceId
    && a.category === b.category
  );
}

type HistoryState = {
  entries: NavLocation[];
  index: number;
};

type HistoryAction =
  | { type: 'record'; location: NavLocation }
  | { type: 'back' }
  | { type: 'forward' };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'record': {
      const current = state.entries[state.index];
      if (current && navLocationsEqual(current, action.location)) return state;
      const entries = [...state.entries.slice(0, state.index + 1), action.location];
      return { entries, index: entries.length - 1 };
    }
    case 'back':
      if (state.index <= 0) return state;
      return { ...state, index: state.index - 1 };
    case 'forward':
      if (state.index >= state.entries.length - 1) return state;
      return { ...state, index: state.index + 1 };
    default:
      return state;
  }
}

/**
 * Finder-style Back / Forward for account, folder, library, source, and category.
 * Records distinct locations; back/forward restore without re-pushing when the
 * applied location matches the stack entry.
 */
export function useNavHistory(
  location: NavLocation,
  applyLocation: (location: NavLocation) => void,
) {
  const [state, dispatch] = useReducer(historyReducer, location, initial => ({
    entries: [initial],
    index: 0,
  }));
  const applyRef = useRef(applyLocation);
  applyRef.current = applyLocation;

  useEffect(() => {
    dispatch({ type: 'record', location });
  }, [location]);

  const canGoBack = state.index > 0;
  const canGoForward = state.index < state.entries.length - 1;

  const goBack = useCallback(() => {
    const target = state.entries[state.index - 1];
    if (!target || state.index <= 0) return;
    dispatch({ type: 'back' });
    applyRef.current(target);
  }, [state.entries, state.index]);

  const goForward = useCallback(() => {
    const target = state.entries[state.index + 1];
    if (!target || state.index >= state.entries.length - 1) return;
    dispatch({ type: 'forward' });
    applyRef.current(target);
  }, [state.entries, state.index]);

  return { canGoBack, canGoForward, goBack, goForward };
}
