#!/usr/bin/env node
/**
 * App Store screenshots at the 6.9-inch iPhone size, 1320 x 2868 (440 x 956 points at 3x), taken
 * from the production build in WebKit, the engine the iPhone app runs on. A first session, as
 * someone would see it: the first page with page details, the next page at night, the session's
 * summary, Done for now and Settings. Page details show while a page is showing, before it starts
 * to breathe, so each feed screenshot is taken within its page's planned time. Writes JPEGs, which
 * have no alpha channel, to docs/app-store/screenshots/.
 *   pnpm --filter @calm/web build && node apps/web/scripts/store-screenshots.mjs
 */
import { webkit } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../../docs/app-store/screenshots');
mkdirSync(out, { recursive: true });

const PORT = 4185;
const server = await preview({ root: join(here, '..'), logLevel: 'warn', preview: { port: PORT, strictPort: true } });
const browser = await webkit.launch();
try {
  const context = await browser.newContext({
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 440, height: 956 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const shot = async (name) => {
    await page.screenshot({ path: join(out, `${name}.jpg`), type: 'jpeg', quality: 92 });
    console.log(`wrote ${name}.jpg`);
  };
  // Long enough for a page's color crossfade to finish, well within its planned 5 to 10 s.
  const settle = () => page.waitForTimeout(2000);
  const feed = page.locator('main.feed');

  await page.goto('/#/settings');
  await page.getByRole('switch', { name: 'Page details' }).click();
  await page.goto('/#/');
  await feed.waitFor();
  await page.locator('.feed-details').waitFor();
  await settle();
  await shot('1-feed');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await settle();
  await shot('2-night');

  // Stay past the page's planned time, so the summary has a page lingered on.
  await page.waitForTimeout(12_000);
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'Session ended' }).waitFor();
  await page.waitForTimeout(800);
  await shot('3-summary');

  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByTestId('day-night').waitFor();
  await page.waitForTimeout(800);
  await shot('4-done');

  await page.goto('/#/settings');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.waitForTimeout(800);
  await shot('5-settings');
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
