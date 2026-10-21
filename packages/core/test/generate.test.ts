import { describe, expect, it } from 'vitest';
import {
  baseL,
  CHROMA,
  FAMILY_BY_ID,
  generate,
  generateValid,
  GROUP_SEC,
  GROUPS,
  midiToHz,
  mulberry32,
  noteName,
  PACE_PRESETS,
  type PaceId,
  SESSION_SEC,
} from '../src/index.ts';

const PRESETS = Object.entries(PACE_PRESETS) as [PaceId, { minDwell: number; maxDwell: number }][];
const seeds = (n: number, salt: number) => {
  const rng = mulberry32(salt);
  return Array.from({ length: n }, () => Math.floor(rng() * 4294967296) >>> 0);
};

describe('generator', () => {
  it('is deterministic: the same seed and options give deep-equal sessions', () => {
    for (const [, pace] of PRESETS) {
      for (const seed of seeds(50, 1)) {
        expect(generateValid({ seed, ...pace })).toEqual(generateValid({ seed, ...pace }));
      }
    }
  });

  for (const [name, pace] of PRESETS) {
    it(`passes all nine checks for 10,000 random seeds (${name} preset)`, () => {
      let failures = 0,
        maxTries = 0;
      for (const seed of seeds(10_000, name === 'standard' ? 11 : 12)) {
        const s = generateValid({ seed, ...pace });
        if (!s.validation.pass) failures += 1;
        maxTries = Math.max(maxTries, s.tries);
      }
      expect(failures).toBe(0);
      // A first draw fails about 3 times in 100,000 at the standard preset (pitchFalls between
      // groups 1 and 2) and about 1% of the time at the measured preset. Two failures in a row
      // then happen about once in 10,000 seeds, so a third draw is rare but expected here; the
      // brief's "never more than two" covered 5,000 seeds.
      expect(maxTries).toBeLessThanOrEqual(name === 'standard' ? 2 : 3);
    });
  }

  it('gives 10,000 distinct color and note sequences for 10,000 random seeds', () => {
    const seen = new Set<string>();
    for (const seed of new Set(seeds(10_000, 99))) {
      seen.add(
        generateValid({ seed, ...PACE_PRESETS.standard })
          .items.map((p) => p.hex + p.midi)
          .join(''),
      );
    }
    expect(seen.size).toBe(10_000);
  });

  it('plans about 120 pages of 5 to 10 s that fill exactly 900 s', () => {
    const counts: number[] = [];
    for (const seed of seeds(500, 3)) {
      const { items } = generateValid({ seed, ...PACE_PRESETS.standard });
      counts.push(items.length);
      const total = items.reduce((s, p) => s + p.dwell, 0);
      expect(total).toBeCloseTo(SESSION_SEC, 9);
      items.forEach((p, i) => {
        expect(p.i).toBe(i + 1);
        if (i > 0) expect(p.start).toBeCloseTo(items[i - 1].start + items[i - 1].dwell, 9);
        if (i < items.length - 1) {
          expect(p.dwell).toBeGreaterThanOrEqual(5);
          expect(p.dwell).toBeLessThan(10);
        }
      });
      // The last page absorbs a remainder under half of minDwell.
      const last = items[items.length - 1];
      expect(last.dwell).toBeGreaterThanOrEqual(2.5);
      expect(last.dwell).toBeLessThan(12.5);
    }
    counts.sort((a, b) => a - b);
    expect(counts[0]).toBeGreaterThanOrEqual(105);
    expect(counts[counts.length - 1]).toBeLessThanOrEqual(135);
    expect(counts[counts.length >> 1]).toBeGreaterThanOrEqual(118);
    expect(counts[counts.length >> 1]).toBeLessThanOrEqual(122);
  });

  it('places pages in groups by start time and follows the arc', () => {
    const { items } = generateValid({ seed: 7, ...PACE_PRESETS.standard });
    for (const p of items) {
      const group = GROUPS[Math.min(6, Math.floor(p.start / GROUP_SEC))];
      expect(p.phase).toBe(group.phase);
      expect(p.phaseName).toBe(group.name);
      expect(group.fams.map((f) => f.cat)).toContain(p.cat);
      expect(p.catName).toBe(FAMILY_BY_ID[p.cat].name);
      expect(group.notes).toContain(p.midi);
      expect(p.drone).toEqual(group.drone);
      expect(p.note).toBe(noteName(p.midi));
      expect(p.hz).toBe(midiToHz(p.midi));
      const [lo, hi] = FAMILY_BY_ID[p.cat].band;
      expect(p.h).toBeGreaterThanOrEqual(lo);
      expect(p.h).toBeLessThanOrEqual(hi);
      expect(p.L).toBeGreaterThanOrEqual(0.6);
      expect(p.L).toBeLessThanOrEqual(0.8);
      expect(p.C).toBeGreaterThanOrEqual(0);
      expect(p.C).toBeLessThanOrEqual(CHROMA.max + 1e-12);
      expect(p.gainDb).toBeCloseTo((-14 * p.start) / SESSION_SEC, 12);
      expect(p.xfade).toBeCloseTo(Math.min(1.5, 0.2 * p.dwell), 12);
      expect(p.hex).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(items[0].gainDb).toBe(0);
    expect(Object.is(items[0].gainDb, -0)).toBe(false);
    expect(items[items.length - 1].midi).toBe(50);
    expect(items[items.length - 1].note).toBe('D3');
  });

  it('first page is the loudest, and levels only fall', () => {
    for (const seed of seeds(100, 5)) {
      const { items } = generateValid({ seed, ...PACE_PRESETS.measured });
      for (let i = 1; i < items.length; i++) expect(items[i].gainDb).toBeLessThan(items[i - 1].gainDb);
    }
  });

  it('interpolates base lightness between group centers', () => {
    expect(baseL(0)).toBe(0.69);
    expect(baseL(0.5 / 7)).toBe(0.69);
    expect(baseL(1.5 / 7)).toBeCloseTo(0.7, 12);
    expect(baseL(1 / 7)).toBeCloseTo((0.69 + 0.7) / 2, 12);
    expect(baseL(6.5 / 7)).toBe(0.67);
    expect(baseL(0.999)).toBe(0.67);
  });

  it('generateValid tries seed, seed + 1, ... and reports the accepted seed', () => {
    // Find a measured-preset seed whose first draw fails.
    const failing = seeds(5000, 21).find((seed) => generateValid({ seed, ...PACE_PRESETS.measured }).tries > 1);
    expect(failing).toBeDefined();
    const s = generateValid({ seed: failing!, ...PACE_PRESETS.measured });
    expect(s.tries).toBeGreaterThan(1);
    expect(s.seed).toBe((failing! + s.tries - 1) >>> 0);
    expect(s.items).toEqual(generate({ seed: s.seed, ...PACE_PRESETS.measured }));
    expect(s.opts).toEqual({ ...PACE_PRESETS.measured, totalSec: 900 });
    expect(s.inserted).toBe(0);
  });

  it('refuses a pace that could plan a page under 2 s, and never plans one', () => {
    expect(() => generate({ seed: 1, minDwell: 1.9, maxDwell: 10 })).toThrow(RangeError);
    expect(() => generate({ seed: 1, minDwell: 8, maxDwell: 6 })).toThrow(RangeError);
    for (const seed of seeds(200, 31)) {
      // Even the absorbing last page stays at 2 s or more.
      const items = generate({ seed, minDwell: 2, maxDwell: 2.6 });
      expect(Math.min(...items.map((p) => p.dwell))).toBeGreaterThanOrEqual(2);
    }
  });

  it('wraps seed + 1 around 2^32', () => {
    const s = generateValid({ seed: 0xffffffff, ...PACE_PRESETS.standard });
    expect(s.seed).toBe(0xffffffff);
    expect(generate({ seed: 0x100000000, ...PACE_PRESETS.standard })).toEqual(generate({ seed: 0, ...PACE_PRESETS.standard }));
  });
});
