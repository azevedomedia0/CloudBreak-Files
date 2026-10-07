import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PhotoNav {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

interface PhotoNavArrowsProps {
  nav: PhotoNav;
  compact?: boolean;
}

export const PhotoNavArrows: React.FC<PhotoNavArrowsProps> = ({ nav, compact = false }) => {
  const base = `absolute top-1/2 -translate-y-1/2 z-10 flex items-center justify-center rounded-full bg-neutral-900/70 backdrop-blur-md border border-white/15 text-white shadow-lg transition-all hover:bg-neutral-800/90 active:scale-95 disabled:opacity-0 disabled:pointer-events-none ${
    compact ? 'w-7 h-7' : 'w-10 h-10'
  }`;
  const icon = compact ? 'w-4 h-4' : 'w-5 h-5';

  return (
    <>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          nav.onPrev();
        }}
        disabled={!nav.hasPrev}
        aria-label="Previous image"
        title="Previous image (←)"
        className={`${base} ${compact ? 'left-1.5' : 'left-3'}`}
      >
        <ChevronLeft className={icon} />
      </button>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          nav.onNext();
        }}
        disabled={!nav.hasNext}
        aria-label="Next image"
        title="Next image (→)"
        className={`${base} ${compact ? 'right-1.5' : 'right-3'}`}
      >
        <ChevronRight className={icon} />
      </button>
    </>
  );
};
