import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  EVENING,
  eveningArc,
  eveningColor,
  eveningLuminance,
  generateValid,
  hexToLinear,
  isBlueOrCyan,
  LIGHT_PAGE_INK,
  MIN_INK_CONTRAST,
  PACE_PRESETS,
  PAGE_INK,
  readableInk,
  sliceForPace,
  validateEvening,
} from '../src/index.ts';
import { randomSeeds } from './helpers.ts';

describe('Evening mode', () => {
  it("uses the prototype's Sequence B: seven warm colors at falling intensity", () => {
    expect(EVENING.map((s) => s.hex)).toEqual(['#FFD6A5', '#FFAC2E', '#FF8C80', '#F4D35E', '#ACD472', '#FFB46B', '#E5382E']);
    expect(EVENING.map((s) => s.intensity)).toEqual([1, 0.7, 0.55, 0.4, 0.25, 0.15, 0.05]);
  });

  it('dims along one curve that never rises, from warm white to a deep red night-light', () => {
    let last = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= 900; i++) {
      const y = eveningLuminance(i / 900);
      expect(y).toBeLessThanOrEqual(last * (1 + 1e-12));
      last = y;
    }
    expect(eveningLuminance(1) / eveningLuminance(0)).toBeLessThan(0.06);
    // Pale gold is held to soft rose's level rather than brighten, so two groups can share a level.
    const arc = eveningArc();
    expect(arc.map((c) => c.name)).toEqual(EVENING.map((s) => s.name));
    arc.forEach((c, i) => i > 0 && expect(c.Y).toBeLessThanOrEqual(arc[i - 1].Y * (1 + 1e-9)));
    expect(arc[6].Y).toBeLessThan(arc[0].Y / 15);
  });

  it('passes its own checks for every page of many sessions, at both paces', () => {
    for (const seed of randomSeeds(150, 0xe7e)) {
      for (const pace of [PACE_PRESETS.standard, PACE_PRESETS.measured]) {
        const session = generateValid({ seed, ...pace });
        expect(validateEvening(session.items)).toEqual({ noBlueOrCyan: true, neverBrighter: true, pass: true });
        for (const p of session.items) {
          const c = eveningColor(p);
          // Dimming only ever takes light away, so every color stays inside sRGB.
          expect(hexToLinear(c.hex).every((v) => v >= 0 && v <= 1)).toBe(true);
          expect(isBlueOrCyan(c.h)).toBe(false);
        }
      }
    }
  });

  it('still passes after a session is re-sliced for a quick pace', () => {
    const session = generateValid({ seed: 41, ...PACE_PRESETS.standard });
    const sliced = sliceForPace(session, { index: 10, elapsedSec: 25, watched: 10 }, { useMemory: false });
    expect(sliced).not.toBeNull();
    expect(validateEvening(sliced!.items).pass).toBe(true);
  });

  it('varies a little within a group, following the day color, and is deterministic', () => {
    const session = generateValid({ seed: 9, ...PACE_PRESETS.standard });
    const firstGroup = session.items.filter((p) => p.phase === 1).map((p) => eveningColor(p).hex);
    expect(new Set(firstGroup).size).toBeGreaterThan(1);
    expect(session.items.map((p) => eveningColor(p).hex)).toEqual(session.items.map((p) => eveningColor(p).hex));
  });

  it('leaves the sound alone: the session it colors is the same session', () => {
    const session = generateValid({ seed: 77, ...PACE_PRESETS.standard });
    const before = JSON.stringify(session);
    session.items.forEach((p) => eveningColor(p));
    expect(JSON.stringify(session)).toBe(before);
  });

  it('gives text a readable ink on every page, by day and by night: dark at the start, light at the end', () => {
    let lowest = Number.POSITIVE_INFINITY;
    const inks = new Set<string>();
    for (const seed of randomSeeds(60, 0x1c4)) {
      for (const p of generateValid({ seed, ...PACE_PRESETS.standard }).items) {
        for (const hex of [p.hex, eveningColor(p).hex]) {
          const ink = readableInk(hex);
          inks.add(ink);
          lowest = Math.min(lowest, contrastRatio(hex, ink));
        }
      }
    }
    expect(lowest).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
    expect(inks).toContain(PAGE_INK);
    expect(inks).toContain(LIGHT_PAGE_INK);
  });

  it('keeps the usual page ink on every day page', () => {
    for (const p of generateValid({ seed: 12, ...PACE_PRESETS.standard }).items) expect(readableInk(p.hex)).toBe(PAGE_INK);
  });
});
