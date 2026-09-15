import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: 'extension',
  build: { outDir: 'dist/extension', emptyOutDir: true, target: 'chrome122' },
  worker: { format: 'es' },
});
