import { defineConfig } from 'vitest/config';

// Node-side test projects. The audio package runs in a real browser through its own
// config (pnpm test:audio), and end-to-end scenarios run in Playwright (pnpm e2e).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          root: './packages/core',
          include: ['test/**/*.test.ts'],
          environment: 'node',
          testTimeout: 120_000,
        },
      },
      {
        test: {
          name: 'web',
          root: './apps/web',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'node',
        },
      },
    ],
  },
});
