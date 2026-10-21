import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  decode,
  encode,
  FAMILIES,
  fitChroma,
  hexToOklch,
  hueDistance,
  inGamut,
  mixOklch,
  mulberry32,
  okDist,
  oklchToHex,
  oklchToLinear,
  PAGE_INK,
  MIN_INK_CONTRAST,
  CHROMA,
  LIGHTNESS,
} from '../src/index.ts';

const randomHex = (rng: () => number) =>
  '#' +
  Array.from({ length: 3 }, () =>
    Math.floor(rng() * 256)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase(),
  ).join('');

describe('color math', () => {
  it('round-trips hex to OKLCH to hex exactly for 10,000 random colors', () => {
    const rng = mulberry32(2024);
    for (let i = 0; i < 10_000; i++) {
      const hex = randomHex(rng);
      const { L, C, h } = hexToOklch(hex);
      expect(oklchToHex(L, C, h)).toBe(hex);
    }
  });

  it('keeps known anchors: white, black and the sRGB primaries', () => {
    expect(hexToOklch('#FFFFFF').L).toBeCloseTo(1, 6);
    expect(hexToOklch('#000000').L).toBeCloseTo(0, 6);
    const red = hexToOklch('#FF0000');
    expect(red.L).toBeCloseTo(0.628, 3);
    expect(red.C).toBeCloseTo(0.2577, 3);
    expect(red.h).toBeCloseTo(29.23, 1);
    const blue = hexToOklch('#0000FF');
    expect(blue.h).toBeCloseTo(264.05, 1);
  });

  it('encode and decode invert each other', () => {
    for (let x = 0; x <= 1; x += 0.01) expect(decode(encode(x))).toBeCloseTo(x, 12);
  });

  it('fitChroma always returns an in-gamut chroma, and keeps in-gamut input unchanged', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 10_000; i++) {
      const L = 0.3 + 0.65 * rng(),
        C = 0.4 * rng(),
        h = 360 * rng();
      const fitted = fitChroma(L, C, h);
      expect(fitted).toBeLessThanOrEqual(C);
      expect(inGamut(oklchToLinear(L, fitted, h))).toBe(true);
      if (inGamut(oklchToLinear(L, C, h))) expect(fitted).toBe(C);
    }
  });

  it('fitChroma finds the gamut edge to within 24 bisection steps', () => {
    const L = 0.7,
      h = 200,
      C = 0.3;
    const edge = fitChroma(L, C, h);
    expect(inGamut(oklchToLinear(L, edge, h))).toBe(true);
    expect(inGamut(oklchToLinear(L, edge + C / 2 ** 23, h))).toBe(false);
  });

  it(`page ink ${PAGE_INK} keeps at least ${MIN_INK_CONTRAST}:1 on every reachable page color`, () => {
    let lowest = Infinity;
    for (const fam of FAMILIES) {
      for (let L = LIGHTNESS.min; L <= LIGHTNESS.max + 1e-9; L += 0.01) {
        for (let C = 0; C <= CHROMA.max + 1e-9; C += 0.01) {
          for (let h = fam.band[0]; h <= fam.band[1] + 1e-9; h += 2) {
            lowest = Math.min(lowest, contrastRatio(PAGE_INK, oklchToHex(L, fitChroma(L, C, h), h)));
          }
        }
      }
    }
    expect(lowest).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
    expect(lowest).toBeGreaterThan(4.55);
  });

  it('light ink would fail on reachable page colors, so it is never used', () => {
    expect(contrastRatio('#F5F7FB', oklchToHex(0.6, 0, 0))).toBeLessThan(4.5);
  });

  it('okDist is Euclidean in OKLab', () => {
    expect(okDist({ L: 0.5, C: 0, h: 0 }, { L: 0.7, C: 0, h: 0 })).toBeCloseTo(0.2, 12);
    expect(okDist({ L: 0.6, C: 0.1, h: 0 }, { L: 0.6, C: 0.1, h: 180 })).toBeCloseTo(0.2, 12);
  });

  it('contrast ratio spans 1 to 21', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 6);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('hue distance and crossfades take the shorter arc', () => {
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(10, 350)).toBe(20);
    expect(hueDistance(0, 180)).toBe(180);
    const mid = mixOklch({ L: 0.6, C: 0.1, h: 350 }, { L: 0.8, C: 0.05, h: 30 }, 0.5);
    expect(mid.h).toBeCloseTo(10, 9);
    expect(mid.L).toBeCloseTo(0.7, 12);
    expect(mid.C).toBeCloseTo(0.075, 12);
    expect(mixOklch({ L: 0.6, C: 0.1, h: 20 }, { L: 0.6, C: 0.1, h: 300 }, 0.5).h).toBeCloseTo(340, 9);
    expect(mixOklch({ L: 0.6, C: 0.1, h: 20 }, { L: 0.7, C: 0.1, h: 300 }, 1)).toEqual({ L: 0.7, C: 0.1, h: 300 });
  });
});
