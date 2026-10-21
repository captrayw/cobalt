import { expect, test } from './fixtures';
import { feed, lingerCycle, openWithClock, pressDownTimes, rememberOnePage, setHidden, startSession } from './helpers';

test('opening the app goes straight into the feed, and sound waits for the first touch', async ({ page }) => {
  await page.goto('/');
  const surface = page.locator('main.feed');
  await expect(surface).toHaveAttribute('data-page', '1');
  await expect(surface).toHaveAttribute('data-status', 'showing');
  const hint = page.getByText('Swipe up for the next page', { exact: true });
  await expect(hint).toBeVisible();
  // No audio context before a gesture: browsers would block it.
  expect((await feed(page))!.audio).toBe('idle');
  await page.keyboard.press('ArrowDown');
  await expect(surface).toHaveAttribute('data-page', '2');
  await expect(hint).toBeHidden();
  // Playwright's WebKit on Windows has no Web Audio, so there the feed runs on the silent engine.
  const webAudio = await page.evaluate(() => 'AudioContext' in window || 'webkitAudioContext' in window);
  if (webAudio) await expect.poll(async () => (await feed(page))!.audio).not.toBe('idle');
});

test('quick scrolling: after ten quick pages the rest is sliced so the session still lasts 15 minutes', async ({ page }) => {
  await openWithClock(page);
  await startSession(page);
  const plan = () => page.evaluate(() => window.__calm!.getState().feed!.state.session.items.map((p) => `${p.hex} ${p.midi} ${p.dwell}`));
  const before = await plan();
  for (let i = 0; i < 10; i++) {
    await page.clock.runFor(2500);
    await page.keyboard.press('ArrowDown');
  }
  await expect(page.locator('main.feed')).toHaveAttribute('data-page', '11');
  // The pace check waits for the browser to be idle after the tenth page change.
  await page.clock.runFor(1600);
  await expect.poll(async () => (await feed(page))!.pages).toBeGreaterThan(before.length);

  const s = (await feed(page))!;
  const after = await plan();
  // The pages seen and the page on screen stay as they were.
  expect(after.slice(0, 11)).toEqual(before.slice(0, 11));
  expect(s.valid).toBe(true);
  // At 2.5 s a page, the pages left now fill the rest of the 15 minutes.
  const projected = 25 + (s.pages - 1 - s.index) * 2.5;
  expect(projected).toBeGreaterThan(0.95 * 900);
  expect(projected).toBeLessThan(1.06 * 900);
  // No page is planned under 2 s.
  expect(Math.min(...after.map((p) => Number(p.split(' ')[2])))).toBeGreaterThanOrEqual(2);
  // Nothing breaks on the next page changes.
  await pressDownTimes(page, 3);
  await expect(page.locator('main.feed')).toHaveAttribute('data-page', '14');
});

test('scenarios 1 to 4: a session moves on, lingers, ends, and a remembered page returns', async ({ page }) => {
  // Four scenarios in a row, about a minute in WebKit on a quiet machine.
  test.slow();
  await openWithClock(page);
  await startSession(page);

  await test.step('1: press ↓ 14 times at 2 to 4.5 s intervals; page 15 shows', async () => {
    await pressDownTimes(page, 14);
    await expect(page.locator('main.feed')).toHaveAttribute('data-page', '15');
  });

  await test.step('2: stay on page 15; breath 1 lasts lingerCycle(dwell, 1), and 60 s later at least 5 breaths', async () => {
    const before = await feed(page);
    await page.clock.runFor(Math.ceil(before!.planned * 1000) + 20);
    const first = await feed(page);
    expect(first!.status).toBe('lingering');
    expect(first!.breath).toBe(1);
    await page.clock.runFor(Math.ceil(first!.breaths[0].dur) + 20);
    const second = await feed(page);
    const lasted = (second!.breaths[1].start - second!.breaths[0].start) / 1000;
    expect(Math.abs(lasted - lingerCycle(before!.planned, 1))).toBeLessThan(0.01);
    await page.clock.runFor(60_000);
    expect((await feed(page))!.breath).toBeGreaterThanOrEqual(5);
  });

  await test.step('3: move on 15 more pages and press Esc; the summary shows 30 pages and the lingered tile', async () => {
    await pressDownTimes(page, 15);
    await expect(page.locator('main.feed')).toHaveAttribute('data-page', '30');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Session ended' })).toBeVisible();
    await expect(page.getByTestId('watched')).toHaveText('30');
    expect(Number(await page.getByTestId('lingers').textContent())).toBeGreaterThanOrEqual(1);
    await expect(page.locator('[data-lingered="true"]').first()).toContainText('Lingered');
    await page.goto('/#/memory');
    await expect(page.getByTestId('memory-page')).toHaveCount(1);
  });

  await test.step('4: generate the next session, up to 8 draws, until a remembered page returns', async () => {
    await page.goto('/#/dev');
    let inserted = 0;
    for (let draw = 0; draw < 8 && inserted === 0; draw++) {
      await page.getByTestId('dev-generate').click();
      inserted = Number(await page.getByTestId('dev-checks').getAttribute('data-inserted'));
    }
    expect(inserted).toBeGreaterThan(0);
    await expect(page.getByTestId('dev-checks')).toHaveAttribute('data-pass', 'true');
    await expect(page.locator('[data-check][data-ok="true"]')).toHaveCount(9);
    await expect(page.locator('tr[data-memory="true"]').first()).toContainText('from memory');
  });
});

test('scenario 5: in "2, 5, 9 s" mode breaths last 2, 5, 9 and 9 s', async ({ page }) => {
  await openWithClock(page, '/#/settings');
  await page.getByText('2, 5, 9 s', { exact: true }).click();
  await startSession(page);
  const s = await feed(page);
  await page.clock.runFor(Math.ceil(s!.planned * 1000) + 25_100);
  const after = await feed(page);
  expect(after!.breaths.slice(0, 4).map((b) => b.dur / 1000)).toEqual([2, 5, 9, 9]);
  const gaps = after!.breaths.slice(1, 5).map((b, i) => Number(((b.start - after!.breaths[i].start) / 1000).toFixed(3)));
  expect(gaps).toEqual([2, 5, 9, 9]);
});

test('scenario 6: the rest screen shows after 200 s without input; ↓ moves on and clears it', async ({ page }) => {
  await openWithClock(page);
  await startSession(page);
  await page.clock.runFor(200_000);
  await expect(page.getByText('Resting', { exact: true })).toBeVisible();
  await expect(page.getByText('Tap or swipe to continue', { exact: true })).toBeVisible();
  expect((await feed(page))!.status).toBe('resting');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByText('Resting', { exact: true })).toBeHidden();
  await expect(page.locator('main.feed')).toHaveAttribute('data-page', '2');
  expect((await feed(page))!.records[0].sleep).toBe(true);
});

test('scenario 8: hidden for 300 s, no rest starts and the 300 s stays out of the recorded dwell', async ({ page }) => {
  await openWithClock(page);
  await startSession(page);
  await page.clock.runFor(10_000);
  await setHidden(page, true);
  await page.clock.runFor(300_000);
  expect((await feed(page))!.status).not.toBe('resting');
  await setHidden(page, false);
  await page.clock.runFor(5_000);
  expect((await feed(page))!.status).toBe('lingering');
  await page.keyboard.press('ArrowDown');
  const s = await feed(page);
  expect(s!.records[0].dwell).toBeGreaterThan(14.9);
  expect(s!.records[0].dwell).toBeLessThan(15.2);
  expect(s!.records[0].sleep).toBe(false);
});

test('an audio interruption pauses the feed with "Tap to resume", and a tap resumes it', async ({ page }) => {
  await openWithClock(page);
  await startSession(page);
  await page.clock.runFor(2000);
  // The browser took the audio away (a call, another app): the context reports a non-running state.
  await page.evaluate(() => window.__calm!.getState().feed!.dispatch({ type: 'interrupted', at: performance.now() }));
  await expect(page.getByText('Tap to resume', { exact: true })).toBeVisible();
  await page.clock.runFor(30_000);
  expect((await feed(page))!.status).toBe('paused');
  await page.locator('main.feed').click({ position: { x: 200, y: 300 } });
  await expect(page.getByText('Tap to resume', { exact: true })).toBeHidden();
  await page.clock.runFor(400);
  const s = await feed(page);
  expect(s!.status).toBe('lingering');
  expect(s!.breath).toBe(1);
  await page.keyboard.press('ArrowDown');
  // Paused time stays out of the dwell: 2 s before the interruption, 0.4 s after the tap.
  const after = await feed(page);
  expect(after!.records[0].dwell).toBeGreaterThan(2.3);
  expect(after!.records[0].dwell).toBeLessThan(2.6);
});

test('scenario 9: three wheel events 60 ms apart advance one page; one more 400 ms later advances one more', async ({ page }) => {
  await openWithClock(page);
  await startSession(page);
  await page.clock.runFor(1000);
  await page.mouse.move(400, 300);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 40);
    await page.clock.runFor(60);
  }
  await expect(page.locator('main.feed')).toHaveAttribute('data-page', '2');
  await page.clock.runFor(400);
  await page.mouse.wheel(0, 40);
  await expect(page.locator('main.feed')).toHaveAttribute('data-page', '3');
});

test('scenario 10: the sandbox draws three series and leaves the real memory unchanged', async ({ page }) => {
  await rememberOnePage(page);
  await page.clock.resume();
  await page.goto('/#/memory');
  await expect(page.getByTestId('memory-page')).toHaveCount(1);
  const before = await page.evaluate(() => JSON.stringify(window.__calm!.getState().memory));
  await page.getByRole('button', { name: 'Run sandbox' }).click();
  const chart = page.getByTestId('sandbox-chart');
  await expect(chart).toBeVisible({ timeout: 60_000 });
  await expect(chart.locator('[data-series] path')).toHaveCount(3);
  expect(await page.evaluate(() => JSON.stringify(window.__calm!.getState().memory))).toBe(before);
  await page.reload();
  await expect(page.getByTestId('memory-page')).toHaveCount(1);
});

test('scenario 11: reset needs two taps and leaves memory empty', async ({ page }) => {
  await rememberOnePage(page);
  await page.goto('/#/memory');
  await expect(page.getByTestId('memory-page')).toHaveCount(1);
  await page.getByTestId('reset').click();
  await expect(page.getByTestId('memory-page')).toHaveCount(1);
  await page.getByTestId('reset-confirm').click();
  await expect(page.getByTestId('memory-empty')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('memory-empty')).toBeVisible();
});

test('scenario 12: memory survives a reload', async ({ page }) => {
  await rememberOnePage(page);
  await page.reload();
  await page.goto('/#/memory');
  await expect(page.getByTestId('memory-page')).toHaveCount(1);
  await page.goto('/#/done');
  await expect(page.getByTestId('last-session')).toContainText('Last session: 1 page');
});

test.describe('scenario 13: a 390 × 844 phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('no horizontal overflow, and tapping Next advances', async ({ page }) => {
    await openWithClock(page);
    for (const route of ['/#/done', '/#/settings', '/#/memory', '/#/about', '/#/dev']) {
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, route).toBeLessThanOrEqual(0);
    }
    await startSession(page);
    await page.clock.runFor(1000);
    await page.getByRole('button', { name: 'Next page' }).tap();
    await expect(page.locator('main.feed')).toHaveAttribute('data-page', '2');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test('ending from the feed records the page on screen and saves memory with the session', async ({ page }) => {
  await rememberOnePage(page);
  const saved = await page.evaluate(async () => {
    const repo = window.__calm!.getState().repo!;
    const [memory, last] = await Promise.all([repo.loadMemory(), repo.lastSession()]);
    return { pages: Object.keys(memory.pages).length, status: last?.status, records: last?.records.length };
  });
  expect(saved).toEqual({ pages: 1, status: 'done', records: 1 });
});
