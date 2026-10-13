import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'enterprise-team.spec.mjs',
  timeout: 30_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', channel: process.env.PLAYWRIGHT_CHANNEL, trace: 'retain-on-failure' },
  webServer: {
    command: 'VITE_BACKEND_API_URL=http://127.0.0.1:5174 VITE_SPRING_API_URL=http://127.0.0.1:5174 node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
