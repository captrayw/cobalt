import { expect, test } from './fixtures';
import { feed, openWithClock, startSession } from './helpers';

test('a swipe right turns on night colors with a notice that fades, and ← brings day back', async ({ page }) => {
  // The notice lasts 1.6 s. With the clock paused it stays until the test moves time on, so a
  // loaded machine cannot miss it.
  await openWithClock(page);
  await startSession(page);
  const surface = page.locator('main.feed');
  // The feed takes focus right after its input listeners are attached: only then can it hear a swipe.
  await expect(surface).toBeFocused();
  const box = (await surface.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 60, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 280, y + 10, { steps: 8 });
  await page.mouse.up();

  const notice = page.locator('.feed-notice');
  await expect(notice).toHaveText('Night mode');
  await expect(surface).toHaveAttribute('data-night', 'true');
  await page.clock.runFor(1700);
  await expect(notice).toBeHidden();
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
  await openWithClock(page);
  await startSession(page);
  const surface = page.locator('main.feed');
  await page.getByRole('button', { name: 'Night mode' }).click();
  await expect(page.locator('.feed-notice')).toHaveText('Night mode');
  await expect(surface).toHaveAttribute('data-night', 'true');
  await page.getByRole('button', { name: 'Day mode' }).click();
  await expect(page.locator('.feed-notice')).toHaveText('Day mode');
  await expect(surface).not.toHaveAttribute('data-night', 'true');
  await expect(surface).toHaveAttribute('data-page', '1');
});

test('each arrow fades out once its gesture is used, and the hints stay out of sight in later sessions', async ({ page }) => {
  await page.goto('/');
  const surface = page.locator('main.feed');
  await expect(surface).toHaveAttribute('data-page', '1');
  const swipeUp = page.getByText('Swipe up for the next page', { exact: true });
  await expect(swipeUp).toBeVisible();
  const next = page.getByRole('button', { name: 'Next page' });
  const day = page.getByRole('button', { name: 'Day mode' });
  const night = page.getByRole('button', { name: 'Night mode' });
  await expect(next).not.toHaveCSS('opacity', '0');
  await expect(night).not.toHaveCSS('opacity', '0');
  await expect(surface).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(night).toHaveCSS('opacity', '0');
  await expect(day).toHaveCSS('opacity', '0');
  await expect(next).not.toHaveCSS('opacity', '0');

  await page.keyboard.press('ArrowDown');
  await expect(surface).toHaveAttribute('data-page', '2');
  await expect(next).toHaveCSS('opacity', '0');

  // Still a button for screen readers, and shown again when reached from the keyboard.
  await next.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(next).toBeFocused();
  await expect(next).not.toHaveCSS('opacity', '0');

  // A new session: the hints stay retired, the swipe-up text with the down arrow.
  await expect
    .poll(() => page.evaluate(async () => (await window.__calm!.getState().repo!.loadSettings()).learnedNext))
    .toBe(true);
  await page.reload();
  await expect(surface).toHaveAttribute('data-page', '1');
  await expect(swipeUp).toBeHidden();
  await expect(next).toHaveCSS('opacity', '0');
  await expect(night).toHaveCSS('opacity', '0');
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
