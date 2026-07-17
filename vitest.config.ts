import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
    fileParallelism: false
  }
});
