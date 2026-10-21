import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openWithClock, rememberOnePage, startSession } from './helpers';

/** Serious or critical axe findings on the page as it is now. */
async function seriousIssues(page: Page) {
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
      await expect(page.getByText('Resting')).toBeVisible();
      await page.clock.resume();
      expect(await seriousIssues(page), 'rest').toEqual([]);
    });
  });
}
