import { describe, expect, it } from 'vitest';
import {
  generateValid,
  GROUP_CAP,
  PACE_PRESETS,
  prepareSession,
  SESSION_SEC,
  sliceForPace,
  slicedDwell,
  validate,
  type Session,
} from '../src/index.ts';
import { randomSeeds, sandboxMemories } from './helpers.ts';

const standard = (seed: number) => generateValid({ seed, ...PACE_PRESETS.standard });

/** Seconds the rest of the session would last at `pace`, from page index on. */
const projected = (s: Session, index: number, elapsed: number, pace: number) => elapsed + (s.items.length - 1 - index) * pace;

describe('slicedDwell', () => {
  it('keeps the 1 : 2 spread and puts the arc left into enough pages for the time left', () => {
    const d = slicedDwell(800, 800, 4);
    expect(d).toEqual({ minDwell: (2 / 3) * 4, maxDwell: (4 / 3) * 4 });
    const narrow = slicedDwell(600, 600, 2.5);
    expect(narrow.minDwell).toBe(2);
    expect((narrow.minDwell + narrow.maxDwell) / 2).toBeCloseTo(2.5, 12);
  });

  it('never plans pages under 2 s, however fast the pace', () => {
    expect(slicedDwell(800, 880, 0.5)).toEqual({ minDwell: 2, maxDwell: 2 });
  });
});

describe('sliceForPace', () => {
  it('keeps the plan when the pages left last long enough at the person pace', () => {
    const s = standard(1);
    expect(sliceForPace(s, { index: 10, elapsedSec: 75, watched: 10 }, { useMemory: false })).toBeNull();
  });

  it('slices the rest into shorter pages so a quick pace still fills 15 minutes', () => {
    for (const pace of [2.5, 3, 4, 5]) {
      for (const seed of randomSeeds(40, Math.round(pace * 10))) {
        const s = standard(seed);
        const index = 10;
        const elapsed = pace * 10;
        const out = sliceForPace(s, { index, elapsedSec: elapsed, watched: 10 }, { useMemory: false })!;
        expect(out, `pace ${pace} seed ${seed}`).not.toBeNull();
        // The pages already seen, and the page on screen, stay exactly as they were.
        expect(out.items.slice(0, index + 1)).toEqual(s.items.slice(0, index + 1));
        // The arc still fills 900 s of plan, ends on D3, and passes the nine checks.
        const last = out.items[out.items.length - 1];
        expect(last.start + last.dwell).toBeCloseTo(SESSION_SEC, 9);
        expect(last.midi).toBe(50);
        expect(validate(out.items, out.opts.minDwell).pass).toBe(true);
        expect(out.validation.pass).toBe(true);
        out.items.forEach((p, i) => expect(p.i).toBe(i + 1));
        for (const p of out.items.slice(index + 1)) expect(p.dwell).toBeGreaterThanOrEqual(2);
        // At the same pace, the session now lasts about 15 minutes.
        expect(projected(out, index, elapsed, pace)).toBeGreaterThan(0.95 * SESSION_SEC);
        expect(projected(out, index, elapsed, pace)).toBeLessThan(1.06 * SESSION_SEC);
      }
    }
  });

  it('at a pace of 2 s or faster, slices down to the 2 s floor', () => {
    const s = standard(7);
    const out = sliceForPace(s, { index: 10, elapsedSec: 15, watched: 10 }, { useMemory: false })!;
    expect(out.opts.minDwell).toBe(2);
    expect(out.items.length).toBeGreaterThan(400);
    expect(Math.min(...out.items.slice(11).map((p) => p.dwell))).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic, and keeps working when checked again every 10 pages', () => {
    const s = standard(11);
    const a = sliceForPace(s, { index: 10, elapsedSec: 30, watched: 10 }, { useMemory: false });
    expect(a).toEqual(sliceForPace(s, { index: 10, elapsedSec: 30, watched: 10 }, { useMemory: false }));
    let session = a!;
    // Still at 3 s per page: later checks find enough pages and keep the plan.
    for (const index of [20, 30, 40]) {
      const again = sliceForPace(session, { index, elapsedSec: index * 3, watched: index }, { useMemory: false });
      if (again) session = again;
      expect(validate(session.items, session.opts.minDwell).pass).toBe(true);
    }
    // Speeding up to 2 s per page slices again from where the person is.
    const faster = sliceForPace(session, { index: 50, elapsedSec: 150 + 10 * 2, watched: 50 }, { useMemory: false });
    if (faster) {
      expect(faster.items.slice(0, 51)).toEqual(session.items.slice(0, 51));
      expect(faster.validation.pass).toBe(true);
    }
  });

  it('brings remembered pages back only into the new pages, within the 25% group cap', () => {
    for (const memory of sandboxMemories(3)) {
      for (const seed of randomSeeds(30, 41)) {
        const s = prepareSession({ seed, ...PACE_PRESETS.standard, memory, useMemory: true });
        const out = sliceForPace(s, { index: 10, elapsedSec: 25, watched: 10 }, { memory, useMemory: true })!;
        expect(out.items.slice(0, 11)).toEqual(s.items.slice(0, 11));
        expect(out.validation.pass).toBe(true);
        expect(out.inserted).toBe(out.items.filter((p) => p.memKey).length);
        const size = new Map<number, number>(),
          fromMemory = new Map<number, number>();
        for (const p of out.items) {
          size.set(p.phase, (size.get(p.phase) ?? 0) + 1);
          if (p.memKey) fromMemory.set(p.phase, (fromMemory.get(p.phase) ?? 0) + 1);
        }
        for (const [phase, n] of fromMemory) {
          const room = Math.max(1, Math.floor(GROUP_CAP * size.get(phase)!));
          // Pages placed before the slice may already fill a small group; slicing never adds beyond the cap.
          const before = s.items.slice(0, 11).filter((p) => p.memKey && p.phase === phase).length;
          expect(n).toBeLessThanOrEqual(Math.max(room, before));
        }
      }
    }
  });

  it('leaves too short a remainder alone', () => {
    const s = standard(3);
    const index = s.items.length - 3;
    expect(sliceForPace(s, { index, elapsedSec: 100, watched: index }, { useMemory: false })).toBeNull();
  });
});
