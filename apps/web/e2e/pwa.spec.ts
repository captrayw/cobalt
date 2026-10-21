import { expect, test } from '@playwright/test';

test.describe('installable, offline and private', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Service workers are checked in Chromium.');

  test('the manifest and icons are served, and the app runs offline after the first visit', async ({ page, context }) => {
    await page.goto('/');
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();
    const manifest = await (await page.request.get(manifestHref!)).json();
    expect(manifest).toMatchObject({ name: 'Calm Scroll', display: 'standalone', start_url: '/' });
    for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok(), icon.src).toBe(true);

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15_000 }).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Calm Scroll' })).toBeVisible();
    await page.getByRole('button', { name: 'Start session' }).click();
    await expect(page.locator('main.feed')).toHaveAttribute('data-page', '1');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Session ended' })).toBeVisible();
  });

  test('makes no request to any other origin', async ({ page }) => {
    const foreign: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== 'http://localhost:4173' && !url.protocol.startsWith('data') && !url.protocol.startsWith('blob')) foreign.push(request.url());
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Start session' }).click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    for (const route of ['/#/memory', '/#/settings', '/#/about', '/#/dev']) {
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
    }
    expect(foreign).toEqual([]);
  });

  test('ships a content security policy that allows only this origin', async ({ page }) => {
    await page.goto('/');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
  });
});
