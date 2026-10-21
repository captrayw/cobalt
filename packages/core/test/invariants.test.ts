import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PACE_PRESETS, prepareSession, SESSION_SEC, type PaceId, type Session } from '../src/index.ts';
import { buildMemoryFixture, sandboxMemories } from './helpers.ts';

function expectInvariants(s: Session) {
  const { items } = s;
  expect(s.validation.pass).toBe(true);
  for (let i = 1; i < items.length; i++) {
    expect(items[i].cat).not.toBe(items[i - 1].cat);
    expect(Math.abs(items[i].L - items[i - 1].L)).toBeLessThanOrEqual(0.08);
    expect(Math.abs(items[i].midi - items[i - 1].midi)).toBeLessThanOrEqual(7);
  }
  expect(items[items.length - 1].midi).toBe(50);
  expect(items.reduce((sum, p) => sum + p.dwell, 0)).toBeCloseTo(SESSION_SEC, 9);
  const last = items[items.length - 1];
  expect(last.start + last.dwell).toBeCloseTo(SESSION_SEC, 9);
  // Safety: every page is planned for at least 2 s.
  expect(Math.min(...items.map((p) => p.dwell))).toBeGreaterThanOrEqual(2);
}

const seed = fc.integer({ min: 0, max: 0xffffffff });
const pace = fc.constantFrom<PaceId>('standard', 'measured');

describe('invariants (property-based)', () => {
  it('hold for every generated session', () => {
    fc.assert(
      fc.property(seed, pace, (s, p) => {
        expectInvariants(prepareSession({ seed: s, ...PACE_PRESETS[p], useMemory: false }));
      }),
      { numRuns: 1000 },
    );
  });

  it('hold for every session shaped by memory', () => {
    const memories = [buildMemoryFixture(), ...sandboxMemories(3)];
    fc.assert(
      fc.property(seed, pace, fc.constantFrom(...memories), (s, p, memory) => {
        expectInvariants(prepareSession({ seed: s, ...PACE_PRESETS[p], memory, useMemory: true }));
      }),
      { numRuns: 400 },
    );
  });
});
