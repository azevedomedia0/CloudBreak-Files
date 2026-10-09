import React from 'react';
import videosPng from '../../assets/icons/videos.png';

/**
 * Streamline Ultimate video-player glyph, tinted via `currentColor`
 * (sidebar Videos uses the sky accent).
 */
export const VideosIcon: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-4 h-4', title }) => (
  <span
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    className={`inline-block shrink-0 bg-current ${className}`}
    style={{
      WebkitMaskImage: `url(${videosPng})`,
      maskImage: `url(${videosPng})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }}
  />
);
