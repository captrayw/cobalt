import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openWithClock, rememberOnePage, startSession } from './helpers';

/**
 * Wait until fades (180 ms text fade-ins, the dim layer's opacity) have finished, so axe sees final
 * colors. The progress hairline, which runs for the whole planned dwell, is not waited for.
 */
async function settled(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => !('animationName' in a) || (a as CSSAnimation).animationName !== 'hairline')
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

/** Serious or critical axe findings on the page as it is now. */
async function seriousIssues(page: Page) {
  await settled(page);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
}

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`accessibility, ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test('every screen has no serious or critical issues', async ({ page }) => {
      await rememberOnePage(page);
      await page.clock.resume();
      expect(await seriousIssues(page), 'summary').toEqual([]);

      for (const route of ['/', '/#/settings', '/#/about', '/#/memory', '/#/dev']) {
        await page.goto(route);
        await expect(page.locator('h1')).toBeVisible();
        if (route === '/#/memory') {
          await page.getByRole('button', { name: 'Run sandbox' }).click();
          await expect(page.getByTestId('sandbox-chart')).toBeVisible({ timeout: 60_000 });
        }
        if (route === '/#/dev') {
          await page.getByTestId('dev-generate').click();
          await expect(page.getByTestId('dev-checks')).toBeVisible();
        }
        expect(await seriousIssues(page), route).toEqual([]);
      }
    });

    test('the feed, its page details, rest screen and summary have no serious or critical issues', async ({ page }) => {
      await openWithClock(page, '/#/settings');
      await page.getByRole('switch', { name: 'Page details' }).click();
      await page.goto('/');
      await startSession(page);
      await page.clock.runFor(1000);
      await expect(page.locator('.feed-details')).toBeVisible();
      // axe schedules its own timers, so let time flow while it runs.
      await page.clock.resume();
      expect(await seriousIssues(page), 'feed').toEqual([]);
      const now = await page.evaluate(() => Date.now());
      await page.clock.pauseAt(now + 3000);
      await page.clock.runFor(200_000);
      await expect(page.getByText('Resting', { exact: true })).toBeVisible();
      await page.clock.resume();
      expect(await seriousIssues(page), 'rest').toEqual([]);

      // Paused after an audio interruption: "Tap to resume" over the page color.
      await page.keyboard.press('ArrowDown');
      await page.evaluate(() => window.__calm!.getState().feed!.dispatch({ type: 'interrupted', at: performance.now() }));
      await expect(page.getByText('Tap to resume', { exact: true })).toBeVisible();
      expect(await seriousIssues(page), 'paused').toEqual([]);
    });
  });
}
