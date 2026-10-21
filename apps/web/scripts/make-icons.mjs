#!/usr/bin/env node
/**
 * Draws the app icons from the A Color Company mark, as its brand guide asks for an app icon: the
 * calm-arc bar alone, no text, on the website's warm canvas, with clear space on every side at least
 * the bar's height. The bar carries the website's impasto texture, scaled with it. The favicon is
 * the flat version: the same gradient as a rounded square, no texture, for very small sizes.
 *   node apps/web/scripts/make-icons.mjs
 * Chromium (installed for the end-to-end tests) renders the SVG, so the texture comes out exactly
 * as the browser draws it on the website. Writes PNGs to apps/web/public/icons/ and apps/web/public/,
 * plus favicon.svg.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The calm arc, coral to blue-grey. The brand guide: never reorder, recolor or stretch it. */
const ARC = ['#D9826B', '#D8B878', '#8FAE8B', '#5E9C9A', '#6F88B0', '#8E80A8', '#8C9BB0'];
const CANVAS = '#F3EEE4';

/** Icons are drawn on a 128-unit square and rendered at each size. */
const UNIT = 128;
/** The website header's bar is 28 x 11 px; the icon keeps that ratio. */
const BAR_H = 28;
const BAR_W = (BAR_H * 28) / 11;
const BAR_R = (BAR_H * 3) / 11;
/** The texture grows with the bar: noise as on the 11 px header bar, displacement about 6 per 30 px of height. */
const GROW = BAR_H / 11;
const DISPLACEMENT = (6 * BAR_H) / 30;

const stops = ARC.map((c, i) => `<stop offset="${(i / (ARC.length - 1)).toFixed(4)}" stop-color="${c}"/>`).join('');

function iconSvg(size, rounded) {
  const x = (UNIT - BAR_W) / 2,
    y = (UNIT - BAR_H) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${UNIT} ${UNIT}">
  <defs>
    <linearGradient id="arc" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>
    <filter id="impasto" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="${(0.03 / GROW).toFixed(5)} ${(0.11 / GROW).toFixed(5)}" numOctaves="3" seed="7" result="t"/>
      <feDiffuseLighting in="t" surfaceScale="1.6" lighting-color="#ffffff" result="l"><feDistantLight azimuth="235" elevation="58"/></feDiffuseLighting>
      <feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.16" k2="0" k3="0" k4="0" result="lit"/>
      <feDisplacementMap in="lit" in2="t" scale="${DISPLACEMENT.toFixed(2)}" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
  <rect width="${UNIT}" height="${UNIT}" rx="${rounded ? UNIT * 0.22 : 0}" fill="${CANVAS}"/>
  <rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${BAR_W.toFixed(3)}" height="${BAR_H}" rx="${BAR_R.toFixed(3)}" fill="url(#arc)" filter="url(#impasto)"/>
</svg>`;
}

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '../public');
const iconDir = join(publicDir, 'icons');
mkdirSync(iconDir, { recursive: true });

// Rounded corners for the manifest's ordinary icons; full-bleed squares for maskable and Apple
// touch use, which the phone masks itself.
const outputs = [
  [join(iconDir, 'icon-192.png'), 192, true],
  [join(iconDir, 'icon-512.png'), 512, true],
  [join(iconDir, 'icon-maskable-512.png'), 512, false],
  [join(publicDir, 'apple-touch-icon.png'), 180, false],
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [file, size, rounded] of outputs) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${iconSvg(size, rounded)}</body></html>`);
    writeFileSync(file, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
    console.log(`wrote ${file}`);
  }
} finally {
  await browser.close();
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#a)"/></svg>\n`;
writeFileSync(join(publicDir, 'favicon.svg'), favicon);
console.log('wrote favicon.svg');
