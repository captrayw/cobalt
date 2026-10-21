#!/usr/bin/env node
/**
 * Draws the app icons from the calm arc itself: a vertical OKLCH gradient through the seven groups
 * (warm Meet at the top, cool Rest at the bottom) with one soft "breath" circle.
 *   node apps/web/scripts/make-icons.mjs
 * Writes PNGs to apps/web/public/icons/ and apps/web/public/, plus favicon.svg.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const core = await import(pathToFileURL(join(here, '../../../packages/core/src/index.ts')).href);
const { GROUPS, FAMILY_BY_ID, CHROMA, baseL, fitChroma, mixOklch, oklchToLinear, oklchToHex, encode } = core;

/** The arc's seven colors, one per group center (as on the Home screen). */
const STOPS = GROUPS.map((g) => {
  const tn = (g.phase - 0.5) / GROUPS.length;
  const main = [...g.fams].sort((a, b) => b.w - a.w)[0].cat;
  const [lo, hi] = FAMILY_BY_ID[main].band;
  const h = (lo + hi) / 2,
    L = baseL(tn);
  return { L, C: fitChroma(L, CHROMA.start + (CHROMA.end - CHROMA.start) * tn, h), h };
});

function arcAt(t) {
  const x = Math.min(STOPS.length - 1 - 1e-9, Math.max(0, t * (STOPS.length - 1)));
  const i = Math.floor(x);
  return mixOklch(STOPS[i], STOPS[i + 1], x - i);
}

const toRgb8 = ({ L, C, h }) => oklchToLinear(L, C, h).map((v) => Math.round(encode(v) * 255));

// --- PNG encoding (RGBA, 8-bit) ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const smooth = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * One pixel of the icon. `rounded` gives transparent corners (radius 22%); full-bleed icons are
 * opaque squares for maskable and Apple touch use. Four samples per pixel smooth the edges.
 */
function iconPixel(size, rounded) {
  const radius = 0.22;
  return (px, py) => {
    let r = 0,
      g = 0,
      b = 0,
      a = 0;
    for (const [ox, oy] of [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ]) {
      const x = (px + ox) / size,
        y = (py + oy) / size;
      let alpha = 1;
      if (rounded) {
        const dx = Math.max(radius - x, 0, x - (1 - radius)),
          dy = Math.max(radius - y, 0, y - (1 - radius));
        alpha = Math.hypot(dx, dy) <= radius ? 1 : 0;
      }
      const base = arcAt(y);
      // The breath: a soft lighter circle in the middle.
      const d = Math.hypot(x - 0.5, y - 0.5);
      const inside = 1 - smooth(0.25, 0.262, d);
      const ring = 0.18 * (smooth(0.2, 0.25, d) - smooth(0.262, 0.31, d));
      const color = { L: base.L + 0.075 * inside + ring * 0.2, C: base.C * (1 - 0.35 * inside), h: base.h };
      const [cr, cg, cb] = toRgb8(color);
      r += cr * alpha;
      g += cg * alpha;
      b += cb * alpha;
      a += alpha;
    }
    if (a === 0) return [0, 0, 0, 0];
    return [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round((a / 4) * 255)];
  };
}

const publicDir = join(here, '../public');
const iconDir = join(publicDir, 'icons');
mkdirSync(iconDir, { recursive: true });

const outputs = [
  [join(iconDir, 'icon-192.png'), 192, true],
  [join(iconDir, 'icon-512.png'), 512, true],
  [join(iconDir, 'icon-maskable-512.png'), 512, false],
  [join(publicDir, 'apple-touch-icon.png'), 180, false],
];
for (const [file, size, rounded] of outputs) {
  writeFileSync(file, png(size, iconPixel(size, rounded)));
  console.log(`wrote ${file}`);
}

const stops = STOPS.map((s, i) => `<stop offset="${(i / (STOPS.length - 1)).toFixed(3)}" stop-color="${oklchToHex(s.L, s.C, s.h)}"/>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#a)"/><circle cx="32" cy="32" r="16" fill="#ffffff" fill-opacity="0.22"/></svg>\n`;
writeFileSync(join(publicDir, 'favicon.svg'), svg);
console.log('wrote favicon.svg');
