import React from 'react';
import videoTrimPng from '../../assets/icons/video-trim.png';

/**
 * Streamline Ultimate video-edit-cut glyph, tinted via `currentColor`
 * (Cinema Suite trim uses the amber accent).
 */
export const VideoTrimIcon: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-3.5 h-3.5', title }) => (
  <span
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    className={`inline-block shrink-0 bg-current ${className}`}
    style={{
      WebkitMaskImage: `url(${videoTrimPng})`,
      maskImage: `url(${videoTrimPng})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }}
  />
);
