import { SharedLibrary } from '../types';
import { isIncomingLibrary, isOutgoingLibrary } from './libraryDirection';

export type SelectionAccent = 'sky' | 'purple' | 'emerald' | 'orange';

/**
 * Selected-file color: orange on a network share or removable device, purple inside an outgoing
 * library, green inside an incoming one, blue everywhere else.
 */
export const accentForSelection = (lib: SharedLibrary | null, sourceId: string | null): SelectionAccent => {
  if (sourceId) return 'orange';
  if (!lib) return 'sky';
  return isOutgoingLibrary(lib) ? 'purple' : isIncomingLibrary(lib) ? 'emerald' : 'sky';
};

/** Full class names are spelled out so Tailwind can see them. */
export const SELECTION_CLASSES: Record<SelectionAccent, {
  card: string;        // icon view: the current file
  cardMulti: string;   // icon view: checked, not current
  row: string;         // list view: the current row
  rowMulti: string;    // list view: checked row
  columnRow: string;   // columns view: the current file
  galleryRing: string; // gallery thumbnail strip
  checkIcon: string;   // checked checkbox icon
}> = {
  sky: {
    card: 'bg-sky-500/25 ring-1 ring-sky-400/60 shadow-lg shadow-sky-950/50',
    cardMulti: 'bg-sky-500/15 ring-1 ring-sky-500/30',
    row: 'bg-sky-500/20 text-white font-medium',
    rowMulti: 'bg-sky-500/10',
    columnRow: 'bg-sky-500/25 text-white font-medium shadow-sm',
    galleryRing: 'ring-2 ring-sky-400 border-sky-400 scale-102 shadow-lg',
    checkIcon: 'text-sky-400',
  },
  purple: {
    card: 'bg-purple-500/25 ring-1 ring-purple-400/60 shadow-lg shadow-purple-950/50',
    cardMulti: 'bg-purple-500/15 ring-1 ring-purple-500/30',
    row: 'bg-purple-500/20 text-white font-medium',
    rowMulti: 'bg-purple-500/10',
    columnRow: 'bg-purple-500/25 text-white font-medium shadow-sm',
    galleryRing: 'ring-2 ring-purple-400 border-purple-400 scale-102 shadow-lg',
    checkIcon: 'text-purple-400',
  },
  emerald: {
    card: 'bg-emerald-500/25 ring-1 ring-emerald-400/60 shadow-lg shadow-emerald-950/50',
    cardMulti: 'bg-emerald-500/15 ring-1 ring-emerald-500/30',
    row: 'bg-emerald-500/20 text-white font-medium',
    rowMulti: 'bg-emerald-500/10',
    columnRow: 'bg-emerald-500/25 text-white font-medium shadow-sm',
    galleryRing: 'ring-2 ring-emerald-400 border-emerald-400 scale-102 shadow-lg',
    checkIcon: 'text-emerald-400',
  },
  orange: {
    card: 'bg-orange-500/25 ring-1 ring-orange-400/60 shadow-lg shadow-orange-950/50',
    cardMulti: 'bg-orange-500/15 ring-1 ring-orange-500/30',
    row: 'bg-orange-500/20 text-white font-medium',
    rowMulti: 'bg-orange-500/10',
    columnRow: 'bg-orange-500/25 text-white font-medium shadow-sm',
    galleryRing: 'ring-2 ring-orange-400 border-orange-400 scale-102 shadow-lg',
    checkIcon: 'text-orange-400',
  },
};
