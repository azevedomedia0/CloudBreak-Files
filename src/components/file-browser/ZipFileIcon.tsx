import React from 'react';
import zipFilePng from '../../assets/icons/zip-file.png';

/**
 * Streamline Ultimate zip/compress glyph, tinted via `currentColor`
 * (zip thumbnails use the pink archive accent).
 */
export const ZipFileIcon: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-10 h-10', title }) => (
  <span
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    className={`inline-block shrink-0 bg-current ${className}`}
    style={{
      WebkitMaskImage: `url(${zipFilePng})`,
      maskImage: `url(${zipFilePng})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }}
  />
);
