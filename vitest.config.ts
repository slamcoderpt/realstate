import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` lança ao ser importado fora de um RSC; em Node/vitest não
      // há bundle de cliente, por isso substituímos por um stub vazio para poder
      // testar módulos server-side (ex.: lib/mail).
      'server-only': fileURLToPath(
        new URL('./tests/stubs/server-only.ts', import.meta.url)
      )
    }
  },
  test: {
    // Só os testes vitest em tests/. Os E2E (e2e/*.spec.ts) correm no Playwright.
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
    fileParallelism: false
  }
});
