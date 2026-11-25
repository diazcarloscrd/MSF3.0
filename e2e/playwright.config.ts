import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
const browserChannel = process.env.E2E_BROWSER_CHANNEL || 'chrome';

export default defineConfig({
  testDir: './',
  testMatch: ['smoke/**/*.spec.ts', 'tiers/**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    channel: browserChannel,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm.cmd --prefix .. run preview -- --host 127.0.0.1 --port 4173 --strictPort',
        cwd: e2eDir,
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
  projects: [
    {
      name: 'mobile-390x844',
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'desktop-1280x800',
      use: {
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});
