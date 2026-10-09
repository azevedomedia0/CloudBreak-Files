import React from 'react';
import { UploadCloud } from '@/src/icons';

export const DropOverlay: React.FC = () => (
  <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-2xl border-2 border-dashed border-cyan-400 flex flex-col items-center justify-center p-6 text-center select-none pointer-events-none animate-fadeIn">
    <div className="p-5 rounded-3xl bg-cyan-500/10 border border-cyan-400/40 text-cyan-300 mb-3 shadow-2xl">
      <UploadCloud className="w-14 h-14 animate-bounce" />
    </div>
    <h2 className="text-xl font-bold text-white mb-1">Drop to Upload into Cloud Bucket</h2>
    <p className="text-xs text-neutral-300 max-w-sm">
      Files get a SHA-256 checksum. With the vault unlocked, uploads are encrypted with AES-256-GCM using the session key.
    </p>
  </div>
);
