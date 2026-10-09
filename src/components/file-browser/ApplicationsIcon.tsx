import React from 'react';
import applicationsPng from '../../assets/icons/applications.png';

/**
 * Streamline Ultimate apps/widget glyph, tinted via `currentColor`
 * (sidebar Applications uses the sky accent).
 */
export const ApplicationsIcon: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-4 h-4', title }) => (
  <span
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    className={`inline-block shrink-0 bg-current ${className}`}
    style={{
      WebkitMaskImage: `url(${applicationsPng})`,
      maskImage: `url(${applicationsPng})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }}
  />
);
