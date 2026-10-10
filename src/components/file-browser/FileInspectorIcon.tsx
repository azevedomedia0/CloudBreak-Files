import React from 'react';
import fileInspectorPng from '../../assets/icons/file-inspector.png';

/**
 * Streamline Ultimate shipment-search glyph for File Inspector,
 * tinted via `currentColor` (keeps toolbar / panel accent classes).
 */
export const FileInspectorIcon: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-[18px] h-[18px]', title }) => (
  <span
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    className={`inline-block shrink-0 align-middle bg-current ${className}`}
    style={{
      WebkitMaskImage: `url(${fileInspectorPng})`,
      maskImage: `url(${fileInspectorPng})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }}
  />
);
