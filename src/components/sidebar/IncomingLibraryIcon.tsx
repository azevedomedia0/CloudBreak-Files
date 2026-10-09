import React from 'react';
import incomingLibraryPng from '../../assets/icons/incoming-library.png';

/**
 * Streamline Ultimate drawer-envelope glyph, tinted via `currentColor`
 * (incoming libraries use the emerald accent).
 */
export const IncomingLibraryIcon: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-4 h-4', title }) => (
  <span
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    className={`inline-block shrink-0 bg-current ${className}`}
    style={{
      WebkitMaskImage: `url(${incomingLibraryPng})`,
      maskImage: `url(${incomingLibraryPng})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }}
  />
);
