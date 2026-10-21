import { expect, test } from './fixtures';

test('Settings offers no pace or linger rhythm, and no screen carries a disclaimer', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Use what I lingered on' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Pace' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Linger rhythm' })).toHaveCount(0);
  for (const route of ['/#/done', '/#/settings', '/#/about']) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByText(/relaxation aid/i), route).toHaveCount(0);
  }
});

test('About names the maker, links to its site and reserves the rights', async ({ page }) => {
  await page.goto('/#/about');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('a cobalt app by a color company');
  const site = page.getByRole('link', { name: /acolorcompany\.com/ });
  await expect(site).toHaveAttribute('href', 'https://acolorcompany.com');
  await expect(site).toHaveAttribute('target', '_blank');
  await expect(page.getByText('© 2026 a color company. All rights reserved.')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Done for now' })).toBeVisible();
});
