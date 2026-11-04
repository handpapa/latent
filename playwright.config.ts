import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    // Playwright's own Chromium by default; CI installs it. On a machine where
    // that download is unavailable, PW_CHANNEL=msedge borrows the installed Edge.
    channel: process.env.PW_CHANNEL || undefined,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
