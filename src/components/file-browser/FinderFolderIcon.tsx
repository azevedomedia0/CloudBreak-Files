import React from 'react';

/** Flat macOS-style folder glyph for icon/list thumbnails (blue in dark mode, yellow in light). */
export const FinderFolderIcon: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-16 h-14', title }) => (
  <svg
    viewBox="0 0 64 52"
    className={`finder-folder-icon ${className}`}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden={title ? undefined : true}
    role={title ? 'img' : undefined}
  >
    {title ? <title>{title}</title> : null}
    {/* Back / tab */}
    <path
      className="finder-folder-back"
      d="M2 12c0-3.314 2.686-6 6-6h14.5c1.2 0 2.3.6 3 1.5L28 11h28c3.314 0 6 2.686 6 6v27c0 3.314-2.686 6-6 6H8c-3.314 0-6-2.686-6-6V12z"
    />
    {/* Front body (slightly lighter face) */}
    <path
      className="finder-folder-front"
      d="M2 18c0-2.21 1.79-4 4-4h52c2.21 0 4 1.79 4 4v26c0 3.314-2.686 6-6 6H8c-3.314 0-6-2.686-6-6V18z"
    />
    {/* Soft inner highlight */}
    <path
      className="finder-folder-highlight"
      d="M6 16.5h52c1.1 0 2 .9 2 2V20H4v-1.5c0-1.1.9-2 2-2z"
      opacity="0.85"
    />
  </svg>
);
