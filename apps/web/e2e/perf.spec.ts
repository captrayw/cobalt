import { expect, test } from './fixtures';

/**
 * Performance budgets on a mid-range Android profile: a phone-sized viewport and the CPU slowed
 * 4x through the Chrome DevTools Protocol. Generation under 50 ms; a page change under 16 ms of
 * main-thread work; the crossfade drops no frames.
 */
test.describe('performance budgets', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CPU throttling needs the Chrome DevTools Protocol.');
  test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true });

  test('generation, page change and crossfade stay within budget', async ({ page, browser }, testInfo) => {
    // The app opens straight into a session.
    await page.goto('/');
    await expect(page.locator('main.feed')).toHaveAttribute('data-page', '1');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // A Chromium performance trace of the whole run, attached to the report (open it in DevTools).
    const tracePath = testInfo.outputPath('performance-trace.json');
    await browser.startTracing(page, { path: tracePath, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });

    // Generation: biasFrom + generateValid + applyMemory, with a full 80-page memory.
    const generation = await page.evaluate(() => {
      const c = window.__calm!.core;
      const memory = c.simulate({ seed: 3, viewers: 1, loops: 8 }).memory;
      // Two warm-up runs, as on any page that has generated once before.
      for (let i = 0; i < 2; i++) c.prepareValidSession({ ...c.PACE_PRESETS.standard, memory, useMemory: true }, c.newSeed);
      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const t0 = performance.now();
        c.prepareValidSession({ ...c.PACE_PRESETS.standard, memory, useMemory: true }, c.newSeed);
        times.push(performance.now() - t0);
      }
      return times;
    });

    // The first touch starts the sound, so the page changes below include it.
    await page.locator('main.feed').tap();
    await expect(page.getByText('Swipe up for the next page', { exact: true })).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__calm!.getState().feed!.audioState)).toBe('running');

    // Page change: the key handler, the reducer, the controller's effects (sound included) and
    // React's commit, which React flushes in a microtask, plus a forced style and layout pass.
    // Measuring across microtasks keeps unrelated animation frames out of the number.
    const { times: pageChange, committed } = await page.evaluate(async () => {
      const feed = document.querySelector<HTMLElement>('main.feed')!;
      const times: number[] = [];
      let committed = true;
      for (let i = 0; i < 21; i++) {
        await new Promise((r) => setTimeout(r, 450));
        const expected = String(Number(feed.dataset.page) + 1);
        const t0 = performance.now();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        for (let m = 0; m < 4; m++) await Promise.resolve();
        document.body.getBoundingClientRect();
        times.push(performance.now() - t0);
        // The sample only counts if React had already committed the new page.
        committed &&= feed.dataset.page === expected;
      }
      return { times, committed };
    });
    expect(committed).toBe(true);

    // Crossfade: frame intervals while the color moves to the next page.
    const frames = await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 450));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      const stamps: number[] = [];
      await new Promise<void>((resolve) => {
        const tick = (t: number) => {
          stamps.push(t);
          if (t - stamps[0] < 1200) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      return stamps.slice(1).map((t, i) => t - stamps[i]);
    });

    const sorted = [...frames].sort((a, b) => a - b);
    const frameMs = sorted[sorted.length >> 1];
    const dropped = frames.filter((d) => d > frameMs * 1.5).length;
    // The first page change after loading includes the engine warming up; it is reported, not judged.
    const changes = pageChange.slice(1).sort((a, b) => a - b);
    const quantile = (q: number) => changes[Math.min(changes.length - 1, Math.ceil(q * changes.length) - 1)];
    const report = {
      generationMaxMs: Math.max(...generation),
      generationMedianMs: [...generation].sort((a, b) => a - b)[10],
      pageChangeFirstMs: pageChange[0],
      pageChangeMedianMs: quantile(0.5),
      pageChangeP90Ms: quantile(0.9),
      pageChangeMaxMs: changes[changes.length - 1],
      frameMs,
      frames: frames.length,
      dropped,
      pageChangeSamples: pageChange.map((t) => Math.round(t * 10) / 10),
    };
    await browser.stopTracing();
    await testInfo.attach('performance-trace', { path: tracePath, contentType: 'application/json' });
    await testInfo.attach('performance.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    console.log('performance', JSON.stringify(report));

    expect(report.generationMaxMs).toBeLessThan(50);
    // Single samples can spike from garbage collection or other load on the machine; nine in ten
    // page changes must stay inside one 16 ms frame, and the typical one well inside it.
    expect(report.pageChangeP90Ms).toBeLessThan(16);
    expect(report.pageChangeMedianMs).toBeLessThan(12);
    expect(dropped).toBe(0);
  });
});
