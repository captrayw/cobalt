import { expect, test } from './fixtures';
import { rememberOnePage } from './helpers';

test('Settings offers no pace or linger rhythm, and no screen carries a disclaimer', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Use what I lingered on' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Pace' })).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Linger rhythm' })).toHaveCount(0);
  for (const route of ['/#/done', '/#/settings', '/#/about']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByText(/relaxation aid/i), route).toHaveCount(0);
  }
});

test('Settings groups its controls in cards, with the preview first and the reset last', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.locator('.card h2')).toHaveText(['Preview', 'Sound', 'Screen and color', 'Learning and memory', 'Bedtime', 'Reset']);
  await expect(page.getByRole('slider', { name: 'Volume' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Motion' })).toBeVisible();

  // Page details are on by default, and the preview follows the switch at once.
  const details = page.getByRole('switch', { name: 'Page details' });
  const preview = page.getByRole('img', { name: /first page of a session/ });
  await expect(details).toHaveAttribute('aria-checked', 'true');
  await expect(preview).not.toHaveText('');
  await details.click();
  await expect(preview).toHaveText('');
});

test('Settings resets memory only after a confirmation', async ({ page }) => {
  await rememberOnePage(page);
  await page.clock.resume();
  await page.goto('/#/settings');
  await expect(page.getByRole('button', { name: /What it learned/ })).toContainText('1 remembered page');

  await page.getByTestId('settings-reset').click();
  const confirm = page.getByRole('group', { name: 'Confirm reset' });
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: /What it learned/ })).toContainText('1 remembered page');

  await page.getByTestId('settings-reset').click();
  await page.getByTestId('settings-reset-confirm').click();
  await expect(page.getByRole('status').filter({ hasText: 'Memory cleared' })).toBeVisible();
  await expect(page.getByRole('button', { name: /What it learned/ })).toContainText('Nothing yet');
  await page.getByRole('button', { name: /What it learned/ }).click();
  await expect(page.getByTestId('memory-empty')).toBeVisible();
});

test('About names the maker with its logo, links to its site and reserves the rights', async ({ page }) => {
  await page.goto('/#/about');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('a cobalt app by A Color Company');
  await expect(page.locator('.brand-mark')).toBeVisible();
  const site = page.getByRole('link', { name: /acolorcompany\.com/ });
  await expect(site).toHaveAttribute('href', 'https://acolorcompany.com');
  await expect(site).toHaveAttribute('target', '_blank');
  await expect(page.getByText('© 2026 A Color Company. All rights reserved.')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Done for now' })).toBeVisible();
});
