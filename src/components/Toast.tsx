import React from 'react';

export const Toast: React.FC<{ message: string }> = ({ message }) => (
  <div
    role="status"
    className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-2xl macos-glass-card shadow-2xl text-xs font-medium text-cyan-200 border border-cyan-400/30"
  >
    {message}
  </div>
);
