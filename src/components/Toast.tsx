import React from 'react';
import { Sparkles } from 'lucide-react';

export const Toast: React.FC<{ message: string }> = ({ message }) => (
  <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl macos-glass-card shadow-2xl text-xs font-medium text-cyan-200 border border-cyan-400/30">
    <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
    <span>{message}</span>
  </div>
);
