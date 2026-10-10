import React from 'react';
import desktopPng from '../../assets/icons/desktop.png';

/**
 * Streamline Ultimate desktop-computer glyph, tinted via `currentColor`
 * (sidebar Desktop uses the sky accent).
 */
export const DesktopIcon: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-4 h-4', title }) => (
  <span
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    className={`inline-block shrink-0 bg-current ${className}`}
    style={{
      WebkitMaskImage: `url(${desktopPng})`,
      maskImage: `url(${desktopPng})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }}
  />
);
