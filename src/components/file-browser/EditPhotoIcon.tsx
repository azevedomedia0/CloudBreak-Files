import React from 'react';
import editPhotoPng from '../../assets/icons/edit-photo.png';

/**
 * Edit-photo pencil glyph, tinted via `currentColor`
 * (studio panel / Edit Photo actions use the cyan accent).
 */
export const EditPhotoIcon: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-5 h-5', title }) => (
  <span
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    className={`inline-block shrink-0 align-middle bg-current ${className}`}
    style={{
      WebkitMaskImage: `url(${editPhotoPng})`,
      maskImage: `url(${editPhotoPng})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }}
  />
);
