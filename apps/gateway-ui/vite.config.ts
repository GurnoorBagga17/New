import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Axiom NHI Gateway UI - Standalone Build Configuration
// Team 7B: Strict air-gap compliance, zero external requests
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(dirname, './src') },
      {
        find: '@axiom/cedar-editor/studio',
        replacement: path.resolve(dirname, '../../packages/cedar-editor/src/studio.ts'),
      },
      {
        find: '@axiom/cedar-editor/styles.css',
        replacement: path.resolve(dirname, '../../packages/cedar-editor/src/styles.css'),
      },
      {
        find: '@axiom/cedar-editor',
        replacement: path.resolve(dirname, '../../packages/cedar-editor/src/index.ts'),
      },
    ],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    manifest: true,
    // Gate G1: < 450 KB gzipped initial JS for embedded apps/gateway-ui
    chunkSizeWarningLimit: 500,
  },
  server: {
    port: 3000,
    proxy: {
      // Local development proxy to backend (Team 1 gateway on :8080)
      '/v1/local': {
        target: 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
