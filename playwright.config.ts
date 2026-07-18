import {defineConfig, devices} from '@playwright/test';
import {config} from 'dotenv';

// Carrega as chaves do stack Supabase local (demo, públicas). O E2E precisa
// delas tanto para semear dados (service role) como para o servidor da app.
config({path: '.env.test'});

const APP_URL = 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {timeout: 10_000},
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: APP_URL,
    trace: 'on-first-retry'
  },
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  // A app é construída antes (passo de build no CI) e servida com `next start`.
  // As NEXT_PUBLIC_* de browser são fixadas no build; aqui passam-se as de
  // runtime (service role + URL) para as Server Actions/SSR.
  webServer: {
    command: 'npm run start',
    url: APP_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      NEXT_PUBLIC_APP_URL: APP_URL
    }
  }
});
