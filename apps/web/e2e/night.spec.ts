import { expect, test } from './fixtures';
import { feed, openWithClock, startSession } from './helpers';

test('a swipe right turns on night colors with a notice that fades, and ← brings day back', async ({ page }) => {
  await page.goto('/');
  const surface = page.locator('main.feed');
  await expect(surface).toHaveAttribute('data-page', '1');
  const box = (await surface.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 60, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 280, y + 10, { steps: 8 });
  await page.mouse.up();

  const notice = page.locator('.feed-notice');
  await expect(notice).toHaveText('Night mode');
  await expect(surface).toHaveAttribute('data-night', 'true');
  await expect(notice).toBeHidden({ timeout: 5000 });
  // A sideways swipe switches colors; it does not move on.
  await expect(surface).toHaveAttribute('data-page', '1');

  await page.keyboard.press('ArrowLeft');
  await expect(notice).toHaveText('Day mode');
  await expect(surface).not.toHaveAttribute('data-night', 'true');

  // The choice is kept, for this session and the next.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Session ended' })).toBeVisible();
  await page.goto('/#/settings');
  await expect(page.getByRole('switch', { name: 'Night mode' })).toHaveAttribute('aria-checked', 'true');
});

test('arrows at the left and right edges show the way, and switch day and night when tapped', async ({ page }) => {
  await page.goto('/');
  const surface = page.locator('main.feed');
  await expect(surface).toHaveAttribute('data-page', '1');
  await page.getByRole('button', { name: 'Night mode' }).click();
  await expect(page.locator('.feed-notice')).toHaveText('Night mode');
  await expect(surface).toHaveAttribute('data-night', 'true');
  await page.getByRole('button', { name: 'Day mode' }).click();
  await expect(page.locator('.feed-notice')).toHaveText('Day mode');
  await expect(surface).not.toHaveAttribute('data-night', 'true');
  await expect(surface).toHaveAttribute('data-page', '1');
});

test('a page lingered on at night shows its night color in the summary', async ({ page }) => {
  await openWithClock(page);
  await startSession(page);
  await page.keyboard.press('ArrowRight');
  const s = await feed(page);
  await page.clock.runFor(Math.ceil(s!.planned * 1000 * 2) + 3000);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Session ended' })).toBeVisible();
  await expect(page.locator('[data-lingered="true"]')).toHaveAttribute('data-night', 'true');
  await expect(page.locator('[data-lingered="true"]')).toContainText('Warm white');
});

test.describe('on a 390 × 844 phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Done for now explains day and night, with Start a session at the bottom of the screen', async ({ page }) => {
    await page.goto('/#/done');
    const card = page.getByTestId('day-night');
    await expect(card.getByRole('heading', { name: 'Day and night' })).toBeVisible();
    await expect(card).toContainText('Warm, dim colors with no blue');
    await expect(card).toContainText('swipe right for night and left for day');
    await expect(card).toContainText('Day is on now');
    const start = (await page.getByRole('button', { name: 'Start a session' }).boundingBox())!;
    const gap = 844 - (start.y + start.height);
    expect(gap).toBeGreaterThanOrEqual(30);
    expect(gap).toBeLessThanOrEqual(48);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  });
});
