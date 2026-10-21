import { expect, type Page } from '@playwright/test';

export interface FeedSnapshot {
  status: string;
  index: number;
  breath: number;
  breaths: { k: number; start: number; dur: number }[];
  records: { dwell: number; sleep: boolean }[];
  planned: number;
  memKeys: number;
  /** Pages in the session plan; pace slicing adds more. */
  pages: number;
  /** The plan passes the nine checks. */
  valid: boolean;
  /** The audio engine: idle until the first touch. */
  audio: string;
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
      pages: s.session.items.length,
      valid: s.session.validation.pass,
      audio: f.audioState,
    };
  });
}

/**
 * Open a screen with a fake clock that is paused, so the test moves time with page.clock.runFor.
 * The default is the Done screen: the app opens into the feed only at '/', so a session starts
 * when the test calls startSession, with the clock already paused and every time exact.
 */
export async function openWithClock(page: Page, path = '/#/done'): Promise<void> {
  await page.clock.install();
  await page.goto(path);
  // Storage opening is not under test, and WebKit on a loaded machine can take over 10 s.
  await expect.poll(() => page.evaluate(() => window.__calm?.getState().ready === true), { timeout: 30_000 }).toBe(true);
  await pauseSoon(page);
}

/**
 * Pause the fake clock a moment ahead of the page's time. On a loaded machine the page's clock can
 * pass that moment before the pause arrives ("Cannot fast-forward to the past"); the failed pause
 * still stops the clock, so the next try starts from the time it stopped at.
 */
export async function pauseSoon(page: Page, aheadMs = 1000): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const now = await page.evaluate(() => Date.now());
    try {
      await page.clock.pauseAt(now + aheadMs);
      return;
    } catch (error) {
      if (attempt === 3 || !String(error).includes('fast-forward to the past')) throw error;
    }
  }
}

/** Go to the feed, which starts a session, and wait for its first page. */
export async function startSession(page: Page): Promise<void> {
  await page.goto('/#/');
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
