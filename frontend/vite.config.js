import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Não usamos plugin de PWA: o service worker é escrito à mão em /public/sw.js
// e copiado como está para o build.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
