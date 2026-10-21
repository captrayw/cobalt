import { describe, expect, it } from 'vitest';
import { generateValid, median, PACE_PRESETS, scoreRecords, type Page } from '../src/index.ts';
import { recordFor } from './helpers.ts';

const items = generateValid({ seed: 31, ...PACE_PRESETS.standard }).items;
const steady = (n: number): Page[] => items.slice(0, n).map((p) => ({ ...p, dwell: 7.5 }));

describe('scoreRecords', () => {
  it('marks one 3x stay among steady neighbors as a linger, and nothing else', () => {
    const pages = steady(40);
    const records = pages.map((p, k) => recordFor(p, k, k === 17 ? 22.5 : 7.5));
    const scored = scoreRecords(records);
    expect(scored.filter((r) => r.linger).map((r) => r.k)).toEqual([17]);
    const hit = scored[17];
    expect(hit.r).toBeCloseTo(Math.log(3), 12);
    expect(hit.z).toBeCloseTo(Math.log(3) / 0.12, 9); // MAD is 0, so the 0.12 floor applies
  });

  it('does not count a smooth upward drift as lingering', () => {
    for (const growth of [1.02, 1.05, 1.08]) {
      const pages = steady(40);
      const records = pages.map((p, k) => recordFor(p, k, 5 * growth ** k));
      expect(scoreRecords(records).some((r) => r.linger)).toBe(false);
    }
  });

  it('applies the short-session rule exactly under 6 records', () => {
    const pages = steady(5);
    const records = [
      recordFor(pages[0], 0, 7.5),
      recordFor(pages[1], 1, 15.01),
      recordFor(pages[2], 2, 15),
      recordFor(pages[3], 3, 1, true),
      recordFor(pages[4], 4, 0),
    ];
    const scored = scoreRecords(records);
    expect(scored.map((r) => r.linger)).toEqual([false, true, false, true, false]);
    expect(scored.every((r) => r.z === null && r.r === null)).toBe(true);
  });

  it('always counts possible sleep as a linger', () => {
    const pages = steady(20);
    const records = pages.map((p, k) => recordFor(p, k, 7.5, k === 4));
    expect(scoreRecords(records)[4].linger).toBe(true);
  });

  it('needs both z >= 2 and at least 1.5 x the neighbors median', () => {
    // Jittered neighbors widen the spread so a 1.45x stay has a high z but too small a ratio.
    const pages = steady(40);
    const records = pages.map((p, k) => recordFor(p, k, k === 20 ? 7.5 * 1.45 : 7.5 * (1 + 0.01 * (k % 3))));
    const scored = scoreRecords(records);
    expect(scored[20].z!).toBeGreaterThanOrEqual(2);
    expect(scored[20].linger).toBe(false);
  });

  it('floors dwell at 0.5 s before taking logs', () => {
    const pages = steady(10);
    const scored = scoreRecords(pages.map((p, k) => recordFor(p, k, k === 3 ? 0 : 7.5)));
    expect(scored[3].r).toBeCloseTo(Math.log(0.5) - Math.log(7.5), 12);
  });

  it('does not mutate its input', () => {
    const records = steady(10).map((p, k) => recordFor(p, k, 7.5));
    const copy = structuredClone(records);
    scoreRecords(records);
    expect(records).toEqual(copy);
  });

  it('median averages the middle pair', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });
});
