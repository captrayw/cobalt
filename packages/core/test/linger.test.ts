import { describe, expect, it } from 'vitest';
import { breathsReached, dimOpacity, inhaleShare, lingerCycle, lingerLevelDb } from '../src/index.ts';

describe('linger schedule', () => {
  it('stretches breaths from a 7.5 s page as the brief lists them', () => {
    const expected = [7.95, 8.43, 8.93, 9.47, 10.0, 10.3, 10.61, 10.93, 11.26, 11.59, 11.94, 12.0, 12.0, 12.0];
    expected.forEach((sec, i) => expect(Math.abs(lingerCycle(7.5, i + 1, 'gradual') - sec)).toBeLessThanOrEqual(0.01));
  });

  it('clamps the starting cycle to 4 to 10 s', () => {
    expect(lingerCycle(2, 1, 'gradual')).toBeCloseTo(4.24, 10);
    expect(lingerCycle(24, 1, 'gradual')).toBeCloseTo(10.3, 10);
    expect(lingerCycle(24, 50, 'gradual')).toBe(12);
  });

  it('the "2, 5, 9 s" mode lasts 2, 5, 9 and then 9 s', () => {
    expect([1, 2, 3, 4, 5].map((k) => lingerCycle(7.5, k, 'user'))).toEqual([2, 5, 9, 9, 9]);
  });

  it('inhale share falls from 0.40 by 0.0125 per breath to 0.30', () => {
    expect(inhaleShare(1, 'gradual')).toBeCloseTo(0.3875, 12);
    expect(inhaleShare(8, 'gradual')).toBeCloseTo(0.3, 12);
    expect(inhaleShare(20, 'gradual')).toBe(0.3);
    expect(inhaleShare(5, 'user')).toBe(0.4);
  });

  it('each breath is 1 dB softer, at most 12 dB below the page', () => {
    expect(lingerLevelDb(-3, 1)).toBe(-4);
    expect(lingerLevelDb(-3, 12)).toBe(-15);
    expect(lingerLevelDb(-3, 40)).toBe(-15);
  });

  it('the dim layer deepens 0.02 per breath up to 0.28', () => {
    expect(dimOpacity(1)).toBeCloseTo(0.02, 12);
    expect(dimOpacity(14)).toBeCloseTo(0.28, 12);
    expect(dimOpacity(30)).toBe(0.28);
  });

  it('counts the breaths reached during a long stay', () => {
    expect(breathsReached(7.5, 7, 'gradual')).toBe(0);
    expect(breathsReached(7.5, 7.6, 'gradual')).toBe(1);
    expect(breathsReached(7.5, 7.5 + 7.95 + 0.01, 'gradual')).toBe(2);
    expect(breathsReached(5, 5 + 2 + 5 + 0.5, 'user')).toBe(3);
  });
});
