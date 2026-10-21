import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Audio tests render real Web Audio graphs, so they run in a browser (Chromium through Playwright).
export default defineConfig({
  test: {
    name: 'audio',
    include: ['test/**/*.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
