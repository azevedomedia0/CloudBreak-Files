import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  // Tauri loads the dev server at this fixed port (see src-tauri/tauri.conf.json).
  server: {
    port: 3000,
    strictPort: true,
  },
});
