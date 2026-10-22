import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openWithClock, pauseSoon, rememberOnePage, startSession } from './helpers';

/**
 * Wait until fades (180 ms text fade-ins, the dim layer's opacity) have finished, so axe sees final
 * colors. The progress hairline, which runs for the whole planned dwell, and endless animations
 * such as the About glow's breathing are not waited for.
 */
async function settled(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => !('animationName' in a) || (a as CSSAnimation).animationName !== 'hairline')
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
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
      // Six axe passes plus the sandbox's 3,000 simulated sessions: near the default limit in WebKit.
      test.slow();
      await rememberOnePage(page);
      await page.clock.resume();
      expect(await seriousIssues(page), 'summary').toEqual([]);

      for (const route of ['/#/done', '/#/settings', '/#/about', '/#/memory', '/#/dev']) {
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

    test('the feed with its first-page hint, page details, rest and paused screens have no serious or critical issues', async ({ page }) => {
      // Page details are on by default.
      await openWithClock(page);
      await startSession(page);
      await expect(page.getByText('Swipe up for the next page', { exact: true })).toBeVisible();
      await page.clock.runFor(1000);
      await expect(page.locator('.feed-details')).toBeVisible();
      // axe schedules its own timers, so let time flow while it runs.
      await page.clock.resume();
      expect(await seriousIssues(page), 'feed').toEqual([]);
      await pauseSoon(page, 3000);
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
