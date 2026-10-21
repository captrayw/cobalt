import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { feed, openWithClock, pressDownTimes, rememberOnePage, startSession } from './helpers';

test('an app closed mid-session is scored and learned as a partial session at the next launch', async ({ page }) => {
  await openWithClock(page);
  await startSession(page);
  await pressDownTimes(page, 3);
  const held = await feed(page);
  await page.clock.runFor(Math.ceil(held!.planned * 1000) + 60_000);
  await pressDownTimes(page, 7);
  await expect(page.locator('main.feed')).toHaveAttribute('data-page', '11');
  // Ten pages recorded: the checkpoint is written. Then the app dies without ending the session.
  await expect
    .poll(() => page.evaluate(async () => (await window.__calm!.getState().repo!.openSessions()).length))
    .toBe(1);
  await page.evaluate(() => window.__calm!.getState().feed!.dispose());
  await page.goto('about:blank');

  await page.goto('/');
  // The checkpoint holds the 10 finished pages (the page just shown had no time yet).
  await expect(page.getByTestId('last-session')).toContainText('Last session: 10 pages');
  const after = await page.evaluate(async () => {
    const repo = window.__calm!.getState().repo!;
    const [open, last, memory] = await Promise.all([repo.openSessions(), repo.lastSession(), repo.loadMemory()]);
    return { open: open.length, status: last?.status, lingers: last?.totals?.lingers, pages: Object.keys(memory.pages).length, loops: memory.loops.length };
  });
  expect(after).toEqual({ open: 0, status: 'partial', lingers: 1, pages: 1, loops: 1 });
});

test('export, reset and import through the Memory screen bring memory back', async ({ page }) => {
  await rememberOnePage(page);
  await page.clock.resume();
  await page.goto('/#/memory');
  await expect(page.getByTestId('memory-page')).toHaveCount(1);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^calm-scroll-\d{4}-\d{2}-\d{2}\.json$/);
  const text = await readFile((await download.path())!, 'utf8');
  expect(JSON.parse(text)).toMatchObject({ app: 'calm-scroll', schema: 1 });

  await page.getByTestId('reset').click();
  await page.getByTestId('reset-confirm').click();
  await expect(page.getByTestId('memory-empty')).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({ name: 'export.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByRole('group', { name: 'Confirm import' })).toContainText('1 remembered pages');
  await page.getByRole('button', { name: 'Replace my data' }).click();
  await expect(page.getByTestId('memory-page')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('memory-page')).toHaveCount(1);

  await page.locator('input[type="file"]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"other"}') });
  await expect(page.getByRole('status')).toContainText('This file');
  await expect(page.getByTestId('memory-page')).toHaveCount(1);
});
