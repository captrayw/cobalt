import { describe, expect, it } from 'vitest';
import { CHECK_IDS, generateValid, PACE_PRESETS, validate, type CheckId, type Page } from '../src/index.ts';

const base = generateValid({ seed: 2026, ...PACE_PRESETS.standard });
const minDwell = PACE_PRESETS.standard.minDwell;

/** Copy the session's pages, apply a change, and return the checks that fail. */
function failingAfter(change: (items: Page[]) => void): CheckId[] {
  const items = base.items.map((p) => ({ ...p }));
  change(items);
  const { checks } = validate(items, minDwell);
  return CHECK_IDS.filter((id) => !checks[id]);
}

const firstOfGroup = (items: Page[], phase: number) => items.findIndex((p) => p.phase === phase);

describe('the nine checks', () => {
  it('pass on a generated session and report its stats', () => {
    expect(base.validation.pass).toBe(true);
    const { stats } = base.validation;
    expect(stats.n).toBe(base.items.length);
    expect(stats.repeats).toBe(0);
    expect(stats.chroma).toHaveLength(7);
    expect(stats.warm[0]).toBe(1);
    expect(stats.warm[6]).toBe(0);
    expect(stats.maxDL).toBeLessThanOrEqual(0.06 + 1e-12);
    expect(stats.maxLeap).toBeLessThanOrEqual(7);
    expect(stats.minDwell).toBeGreaterThanOrEqual(5);
    expect(stats.maxDE).toBeGreaterThan(0);
  });

  it('noRepeat fails when two consecutive pages share a family', () => {
    expect(
      failingAfter((items) => {
        items[11] = { ...items[11], cat: items[10].cat };
      }),
    ).toContain('noRepeat');
  });

  it('chromaFalls fails when a group is as saturated as the one before', () => {
    expect(
      failingAfter((items) => {
        for (const p of items) if (p.phase === 4) p.C = 0.2;
      }),
    ).toContain('chromaFalls');
  });

  it('warmToCool fails when warm share rises, or group 1 is not all warm, or group 7 is not all cool', () => {
    expect(
      failingAfter((items) => {
        items[firstOfGroup(items, 1) + 1].cat = 'GREEN';
      }),
    ).toContain('warmToCool');
    expect(
      failingAfter((items) => {
        items[firstOfGroup(items, 7) + 1].cat = 'ORANGE';
      }),
    ).toContain('warmToCool');
    expect(
      failingAfter((items) => {
        for (const p of items) if (p.phase === 2) p.cat = 'GREEN';
        for (const p of items) if (p.phase === 3) p.cat = 'YELLOW';
      }),
    ).toContain('warmToCool');
  });

  it('pitchFalls fails when a group is not lower than the one before', () => {
    expect(
      failingAfter((items) => {
        for (const p of items) if (p.phase === 5) p.midi = 71;
      }),
    ).toContain('pitchFalls');
  });

  it('smoothLight fails on a lightness step above 0.08', () => {
    expect(
      failingAfter((items) => {
        items[20].L = items[19].L + 0.081;
      }),
    ).toContain('smoothLight');
    expect(
      failingAfter((items) => {
        for (const p of items) p.L = 0.625;
        items[20].L = 0.6875;
      }),
    ).not.toContain('smoothLight');
  });

  it('inGamut fails for a color outside sRGB', () => {
    expect(
      failingAfter((items) => {
        items[30].C = 0.4;
      }),
    ).toContain('inGamut');
  });

  it('slowChanges fails when a page other than the last is shorter than minDwell', () => {
    expect(
      failingAfter((items) => {
        items[5].dwell = 4.99;
      }),
    ).toContain('slowChanges');
    expect(
      failingAfter((items) => {
        items[items.length - 1].dwell = 2.5;
      }),
    ).not.toContain('slowChanges');
  });

  it('smallLeaps fails on a melodic leap above 7 semitones', () => {
    expect(
      failingAfter((items) => {
        items[40].midi = items[39].midi + 8;
      }),
    ).toContain('smallLeaps');
  });

  it('endsOnTonic fails unless the last note is D3', () => {
    expect(
      failingAfter((items) => {
        items[items.length - 1].midi = 54;
      }),
    ).toContain('endsOnTonic');
  });
});
