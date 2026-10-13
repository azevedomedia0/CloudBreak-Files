import React from 'react';
import documentsSvg from '../../assets/icons/documents.svg';

/**
 * Streamline Ultimate design-file glyph for the sidebar Documents folder, tinted via `currentColor`
 * (sidebar Documents uses the sky accent).
 */
export const DocumentsIcon: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-4 h-4', title }) => (
  <span
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    className={`inline-block shrink-0 bg-current ${className}`}
    style={{
      WebkitMaskImage: `url(${documentsSvg})`,
      maskImage: `url(${documentsSvg})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }}
  />
);
