import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: './',
  plugins: [react(), { name: 'dbx-watch-success', writeBundle() { console.log('DBX_UI_BUILD_SUCCESS'); } }],
  build: { outDir: 'ui', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 1200 },
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.ts'], include: ['tests/**/*.test.{ts,tsx}'] },
});
