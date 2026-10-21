import { test as base, expect } from '@playwright/test';

/** Every test page turns on the app's QA hook (window.__calm) before the app loads. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => sessionStorage.setItem('calm-qa', '1'));
    await use(page);
  },
});

export { expect };
