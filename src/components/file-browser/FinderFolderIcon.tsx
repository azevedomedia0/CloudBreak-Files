import React from 'react';

/** Flat yellow macOS-style folder glyph (matches Finder icon grid). */
export const FinderFolderIcon: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-16 h-14', title }) => (
  <svg
    viewBox="0 0 64 52"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden={title ? undefined : true}
    role={title ? 'img' : undefined}
  >
    {title ? <title>{title}</title> : null}
    {/* Back / tab */}
    <path
      d="M2 12c0-3.314 2.686-6 6-6h14.5c1.2 0 2.3.6 3 1.5L28 11h28c3.314 0 6 2.686 6 6v27c0 3.314-2.686 6-6 6H8c-3.314 0-6-2.686-6-6V12z"
      fill="#F5C518"
    />
    {/* Front body (slightly lighter face) */}
    <path
      d="M2 18c0-2.21 1.79-4 4-4h52c2.21 0 4 1.79 4 4v26c0 3.314-2.686 6-6 6H8c-3.314 0-6-2.686-6-6V18z"
      fill="#FFD60A"
    />
    {/* Soft inner highlight */}
    <path
      d="M6 16.5h52c1.1 0 2 .9 2 2V20H4v-1.5c0-1.1.9-2 2-2z"
      fill="#FFE566"
      opacity="0.85"
    />
  </svg>
);
