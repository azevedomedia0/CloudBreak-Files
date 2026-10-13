import React from 'react';
import openDocumentSvg from '../../assets/icons/open-document.svg';

/**
 * Streamline "Content Paper Edit" glyph for Open Document, tinted via `currentColor`
 * (the button keeps its own text colour).
 */
export const OpenDocumentIcon: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-3.5 h-3.5', title }) => (
  <span
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    className={`inline-block shrink-0 bg-current ${className}`}
    style={{
      WebkitMaskImage: `url(${openDocumentSvg})`,
      maskImage: `url(${openDocumentSvg})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }}
  />
);
