import React from 'react';
import privateVaultPng from '../../assets/icons/private-vault.png';

/**
 * Streamline Ultimate lock-shield glyph, tinted via `currentColor`
 * (sidebar Private Vault uses the emerald accent).
 */
export const PrivateVaultIcon: React.FC<{
  className?: string;
  title?: string;
}> = ({ className = 'w-4 h-4', title }) => (
  <span
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    className={`inline-block shrink-0 bg-current ${className}`}
    style={{
      WebkitMaskImage: `url(${privateVaultPng})`,
      maskImage: `url(${privateVaultPng})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    }}
  />
);
