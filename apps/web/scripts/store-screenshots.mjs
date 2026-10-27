#!/usr/bin/env node
/**
 * App Store screenshots in two iPhone sizes: 6.9-inch, 1320 x 2868 (440 x 956 points at 3x), and
 * 6.3-inch, 1206 x 2622 (402 x 874 points at 3x), the size App Store Connect requires.
 *
 * First the app's own screens are taken from the production build in WebKit, the engine the iPhone
 * app runs on, with the iPhone 17 Pro Max's safe areas (62 points at the top with the status bar
 * hidden, 34 at the bottom), as the simulator shows them. Each session has a fixed seed, so the same
 * pages come back every time, and runs on Playwright's clock, so minutes of scrolling take seconds.
 * Then store-frames.mjs puts each screen in an iPhone with a caption and callouts, in Chromium, and
 * writes JPEGs, which have no alpha channel, to docs/app-store/screenshots/6.9-inch/ and 6.3-inch/.
 *   pnpm --filter @calm/web build && node apps/web/scripts/store-screenshots.mjs
 * With --frames it only redraws the frames from the screens taken last time.
 */
/* global document, window, Node -- the functions passed to evaluate() and addInitScript() run in the page. */
import { chromium, webkit } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { FRAMES, frameHtml } from './store-frames.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../../docs/app-store/screenshots');
const screens = join(tmpdir(), 'cobalt-store-screens');
mkdirSync(out, { recursive: true });
mkdirSync(screens, { recursive: true });

const VIEWPORT = { width: 440, height: 956 };
/** The frames' sizes in points: 6.9-inch, which they are laid out at, and 6.3-inch. */
const SIZES = [
  { dir: '6.9-inch', width: 440, height: 956 },
  { dir: '6.3-inch', width: 402, height: 874 },
];
const INSETS = { top: 62, right: 0, bottom: 34, left: 0 };
/** Seed 1 opens on a soft red and reaches teal and blue; seed 5 opens on yellow. */
const SEED = { day: 1, yellow: 5 };
/** Pages, counted from 0, that the day session stays on: a yellow and a green. */
const LINGER = [20, 41];
/** The teal page the day session shows its note on, and the dim sage page of the night session. */
const TEAL = 59;
const SAGE = 80;

/** Where each named element sits, in points, plus the page's colors. */
function measure(page, selectors) {
  return page.evaluate((selectors) => {
    const rects = {};
    for (const [name, selector] of Object.entries(selectors)) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      rects[name] = { x: r.x, y: r.y, w: r.width, h: r.height };
    }
    const feed = window.__calm?.getState().feed;
    const item = feed ? feed.state.session.items[feed.state.index] : null;
    return { rects, page: item && { note: item.note, name: item.catName, hex: item.hex, phase: item.phase } };
  }, selectors);
}

/** The rectangle of some words inside an element, in points. */
function measureText(page, selector, words) {
  return page.evaluate(
    ({ selector, words }) => {
      const el = document.querySelector(selector);
      const node = el && [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.includes(words));
      if (!node) return null;
      const range = document.createRange();
      const start = node.textContent.indexOf(words);
      range.setStart(node, start);
      range.setEnd(node, start + words.length);
      return [...range.getClientRects()].map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }));
    },
    { selector, words },
  );
}

async function takeScreens() {
  const server = await preview({ root: join(here, '..'), logLevel: 'warn', preview: { port: 4185, strictPort: true } });
  const browser = await webkit.launch();
  const meta = {};
  try {
    const open = async (seed) => {
      const context = await browser.newContext({
        baseURL: 'http://localhost:4185',
        viewport: VIEWPORT,
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        colorScheme: 'light',
        reducedMotion: 'no-preference',
        serviceWorkers: 'block',
        // Lets the styles below in past the page's Content-Security-Policy.
        bypassCSP: true,
      });
      // A desktop browser has no safe areas, so the phone's are written into the style sheet.
      await context.route('**/assets/*.css', async (route) => {
        const response = await route.fetch();
        const css = (await response.text()).replace(/env\(\s*safe-area-inset-(top|right|bottom|left)\s*(?:,[^)]*)?\)/g, (_, side) => `${INSETS[side]}px`);
        await route.fulfill({ response, body: css });
      });
      await context.addInitScript((seed) => {
        // Turns on the app's QA hook, which the steps below read the feed's state through.
        sessionStorage.setItem('calm-qa', '1');
        // The session's seed comes from the first draw of one 32-bit number.
        const draw = crypto.getRandomValues.bind(crypto);
        let pending = seed;
        crypto.getRandomValues = (array) => {
          if (pending !== null && array instanceof Uint32Array && array.length === 1) {
            array[0] = pending;
            pending = null;
            return array;
          }
          return draw(array);
        };
        // The iPhone app starts its sound at launch, so it never shows the browser's "Tap for sound".
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = '.feed-hint-sound { display: none; }';
          document.head.append(style);
        });
      }, seed);
      const page = await context.newPage();
      await page.clock.install({ time: new Date('2026-10-26T21:30:00') });
      await page.goto('/#/');
      await page.locator('.feed-details').waitFor();
      await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 100)));
      return { context, page };
    };

    const feedState = (page) =>
      page.evaluate(() => {
        const s = window.__calm.getState().feed.state;
        const item = s.session.items[s.index];
        return { index: s.index, dwell: item.dwell, xfade: item.xfade };
      });

    /** Scroll on to page `target` (from 0), moving on just before each page's planned time is up. */
    const scrollTo = async (page, target, linger = []) => {
      for (let s = await feedState(page); s.index < target; s = await feedState(page)) {
        await page.clock.runFor(linger.includes(s.index) ? s.dwell * 5000 : s.dwell * 1000 - 300);
        await page.keyboard.press('ArrowDown');
        await page.locator(`main.feed[data-page="${s.index + 2}"]`).waitFor();
      }
      // The crossfade to the page's color, then the page details' fade in.
      await page.clock.runFor((await feedState(page)).xfade * 1000 + 100);
      await page.waitForTimeout(500);
    };

    const shot = async (page, name, selectors = {}) => {
      await page.screenshot({ path: join(screens, `${name}.png`) });
      meta[name] = await measure(page, selectors);
      console.log(`took ${name}`);
    };
    const FEED = {
      end: '.feed-end',
      next: '.feed-next',
      day: '.feed-day',
      night: '.feed-night',
      note: '.feed-note',
      name: '.feed-name',
      hint: '.feed-hint:not(.feed-hint-sound)',
      notice: '.feed-notice',
    };

    // The palettes the Done screen shows, worked out as arc.ts does.
    {
      const { context, page } = await open(SEED.day);
      meta.palettes = await page.evaluate(() => {
        const c = window.__calm.core;
        const day = c.GROUPS.map((g) => {
          const tn = (g.phase - 0.5) / c.GROUPS.length;
          const main = [...g.fams].sort((a, b) => b.w - a.w)[0].cat;
          const [lo, hi] = c.FAMILY_BY_ID[main].band;
          const h = (lo + hi) / 2;
          const L = c.baseL(tn);
          return c.oklchToHex(L, c.fitChroma(L, c.CHROMA.start + (c.CHROMA.end - c.CHROMA.start) * tn, h), h);
        });
        return { day, night: c.eveningArc().map((x) => x.hex) };
      });

      // The first page, as the app opens.
      await page.waitForTimeout(500);
      await shot(page, 'open', FEED);

      // Further on: a teal page with its note, after staying on a yellow and a green page.
      await scrollTo(page, TEAL, LINGER);
      await shot(page, 'teal', FEED);

      // The summary of that session, then Memory.
      await page.keyboard.press('Escape');
      await page.getByRole('heading', { name: 'Session ended' }).waitFor();
      await page.clock.runFor(1000);
      await page.waitForTimeout(800);
      await shot(page, 'summary', { stats: '.stats', tile: '.tile', mark: '.tile .mark', tiles: '.tiles', remembered: 'section .muted.small', buttons: '.btn-row' });
      await page.getByRole('button', { name: 'Done' }).click();
      await page.getByTestId('day-night').waitFor();
      await page.getByRole('button', { name: /^Memory/ }).click();
      await page.getByTestId('memory-count').waitFor();
      await page.clock.runFor(1000);
      await page.waitForTimeout(800);
      await shot(page, 'memory', { title: 'h1', intro: '.screen-head p', list: 'ul.list', count: '[data-testid="memory-count"]' });
      meta.memory.stays = await measureText(page, '.screen-head p', 'everything stays on this device');
      await context.close();
    }

    // The first page of another session, with the controls lit as after a touch.
    {
      const { context, page } = await open(SEED.yellow);
      await page.mouse.move(220, 300);
      await page.mouse.move(230, 320);
      await page.waitForTimeout(700);
      await shot(page, 'controls', FEED);
      await context.close();
    }

    // Night: swiped right on the first page, then deep into the session, on a dim sage page.
    {
      const { context, page } = await open(SEED.day);
      await page.keyboard.press('ArrowRight');
      await scrollTo(page, SAGE);
      // The day-or-night notice, held where its fade would hold it.
      await page.addStyleTag({ content: '.feed-notice { animation: none !important; opacity: 1 !important; }' });
      await page.keyboard.press('ArrowRight');
      await page.locator('.feed-notice').waitFor();
      await page.waitForTimeout(300);
      await shot(page, 'night', FEED);
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
  writeFileSync(join(screens, 'screens.json'), JSON.stringify(meta, null, 2));
}

async function drawFrames() {
  const meta = JSON.parse(readFileSync(join(screens, 'screens.json'), 'utf8'));
  const browser = await chromium.launch();
  try {
    for (const { dir, width, height } of SIZES) {
      mkdirSync(join(out, dir), { recursive: true });
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 3 });
      for (const frame of FRAMES) {
        await page.setContent(frameHtml(frame, meta, screens), { waitUntil: 'load' });
        // A smaller frame is the 6.9-inch one scaled to fit; the two shapes differ by under 0.1%. With
        // a background of its own, the page no longer paints the body's background unscaled.
        if (width !== VIEWPORT.width) {
          await page.addStyleTag({
            content: `html { background: #000; } body { transform: scale(${width / VIEWPORT.width}, ${height / VIEWPORT.height}); transform-origin: 0 0; }`,
          });
        }
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: join(out, dir, `${frame.file}.jpg`), type: 'jpeg', quality: 92 });
        console.log(`wrote ${dir}/${frame.file}.jpg`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

if (!process.argv.includes('--frames')) await takeScreens();
await drawFrames();
