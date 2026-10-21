import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/** Feed scenarios run in Chromium and WebKit against the production build, served by vite preview. */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm run build && pnpm run preview',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /perf\.spec\.ts/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /perf\.spec\.ts/ },
    // Budgets are measured alone, on one worker, so other tests do not compete for the CPU.
    { name: 'perf', use: { ...devices['Desktop Chrome'] }, testMatch: /perf\.spec\.ts/ },
  ],
});
