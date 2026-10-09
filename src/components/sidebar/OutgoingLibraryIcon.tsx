import React from 'react';
import outgoingLibraryPng from '../../assets/icons/outgoing-library.png';

/**
 * Streamline Ultimate drawer-send glyph, tinted via `currentColor`
 * (outgoing libraries use the purple accent).
 */
export const OutgoingLibraryIcon: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-4 h-4', title }) => (
  <span
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    className={`inline-block shrink-0 bg-current ${className}`}
    style={{
      WebkitMaskImage: `url(${outgoingLibraryPng})`,
      maskImage: `url(${outgoingLibraryPng})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }}
  />
);
