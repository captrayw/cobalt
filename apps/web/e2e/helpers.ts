import { expect, type Page } from '@playwright/test';

export interface FeedSnapshot {
  status: string;
  index: number;
  breath: number;
  breaths: { k: number; start: number; dur: number }[];
  records: { dwell: number; sleep: boolean }[];
  planned: number;
  memKeys: number;
}

/** The running feed's state, read through the app's QA hook. */
export async function feed(page: Page): Promise<FeedSnapshot | null> {
  return page.evaluate(() => {
    const f = window.__calm?.getState().feed;
    if (!f) return null;
    const s = f.state;
    return {
      status: s.status,
      index: s.index,
      breath: s.breath,
      breaths: s.breaths,
      records: s.records.map((r) => ({ dwell: r.dwell, sleep: r.sleep })),
      planned: s.session.items[s.index].dwell,
      memKeys: s.session.items.filter((p) => p.memKey).length,
    };
  });
}

/** Open Home with a fake clock that is paused, so the test moves time with page.clock.runFor. */
export async function openWithClock(page: Page, path = '/'): Promise<void> {
  await page.clock.install();
  await page.goto(path);
  await expect.poll(() => page.evaluate(() => window.__calm?.getState().ready === true)).toBe(true);
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
}

export async function startSession(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.locator('main.feed')).toHaveAttribute('data-page', '1');
}

/** Press ↓ n times, waiting 2 to 4.5 s (fake time) before each press. */
export async function pressDownTimes(page: Page, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await page.clock.runFor(2000 + ((i * 1700) % 2500));
    await page.keyboard.press('ArrowDown');
  }
}

/** Hide or show the page as the browser would when switching apps. */
export async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** A quick session that leaves one remembered page: hold page 1 past twice its planned dwell, then end. */
export async function rememberOnePage(page: Page): Promise<void> {
  await openWithClock(page);
  await startSession(page);
  const s = await feed(page);
  await page.clock.runFor(Math.ceil(s!.planned * 1000 * 2) + 3000);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Session ended' })).toBeVisible();
  await expect(page.locator('[data-lingered="true"]')).toHaveCount(1);
}

/** The lingerCycle rule from the brief, for checking breath lengths. */
export function lingerCycle(start: number, k: number): number {
  let c = Math.max(4, Math.min(10, start));
  for (let i = 0; i < k; i++) c = c < 10 ? Math.min(10, c * 1.06) : Math.min(12, c * 1.03);
  return c;
}
