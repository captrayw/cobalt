import { describe, expect, it } from 'vitest';
import {
  applyMemory,
  biasFrom,
  CARRY_SALT,
  emptyMemory,
  generateValid,
  keyOf,
  learn,
  mulberry32,
  PACE_PRESETS,
  pageKey,
  prepareSession,
  validate,
  type Memory,
  type PageMemory,
  type ScoredRecord,
  type Session,
} from '../src/index.ts';
import { buildMemoryFixture, randomSeeds, recordFor, sandboxMemories } from './helpers.ts';

const session = generateValid({ seed: 77, ...PACE_PRESETS.standard });
const scored = (lingerAt: number[], sleepAt: number[] = []): ScoredRecord[] =>
  session.items.slice(0, 30).map((item, k) => ({
    ...recordFor(item, k, item.dwell, sleepAt.includes(k)),
    r: 0,
    z: 0,
    linger: lingerAt.includes(k) || sleepAt.includes(k),
  }));

function pageMemory(key: string, over: Partial<PageMemory>): PageMemory {
  return { key, cat: 'BLUE', catName: 'Blue', L: 0.66, C: 0.05, h: 250, hex: '#000000', midi: 57, phase: 6, a: 1, b: 1, shown: 1, lingers: 0, sleeps: 0, lastLoop: 1, ...over };
}

describe('learn', () => {
  it('decays every score by 15% toward its prior', () => {
    const memory: Memory = {
      ...emptyMemory(),
      pages: { x: pageMemory('x', { a: 3, b: 2 }) },
      feat: { '1|c|RED': { a: 2, b: 12 } },
    };
    const next = learn(memory, [], { seed: 1, at: 10 });
    expect(next.pages.x.a).toBeCloseTo(2.7, 12);
    expect(next.pages.x.b).toBeCloseTo(1.85, 12);
    expect(next.feat['1|c|RED'].a).toBeCloseTo(1.85, 12);
    expect(next.feat['1|c|RED'].b).toBeCloseTo(11.55, 12);
  });

  it('starts new feature keys at Beta(1, 9) and counts lingers against non-lingers', () => {
    const next = learn(emptyMemory(), scored([3]), { seed: 77, at: 5 });
    const p3 = session.items[3],
      p4 = session.items[4];
    const famKey = `${p3.phase}|c|${p3.cat}`;
    const famCount = session.items.slice(0, 30).filter((p) => p.phase === p3.phase && p.cat === p3.cat).length;
    expect(next.feat[famKey].a).toBe(2);
    expect(next.feat[famKey].b).toBe(9 + famCount - 1);
    const noteKey = `${p4.phase}|n|${p4.midi}`;
    expect(next.feat[noteKey].a + next.feat[noteKey].b).toBeGreaterThanOrEqual(11);
  });

  it('creates a page entry only on a linger, rounded and counted', () => {
    const next = learn(emptyMemory(), scored([3], [9]), { seed: 77, at: 5 });
    expect(Object.keys(next.pages)).toHaveLength(2);
    const p = session.items[3];
    const entry = next.pages[pageKey(p)];
    expect(entry).toMatchObject({ key: pageKey(p), cat: p.cat, hex: p.hex, midi: p.midi, phase: p.phase, a: 2, b: 1, shown: 1, lingers: 1, sleeps: 0, lastLoop: 1 });
    expect(entry.L).toBe(Math.round(p.L * 1e4) / 1e4);
    expect(entry.C).toBe(Math.round(p.C * 1e4) / 1e4);
    expect(entry.h).toBe(Math.round(p.h * 100) / 100);
    expect(next.pages[pageKey(session.items[9])].sleeps).toBe(1);
  });

  it('updates an existing entry, matching a remembered page by its memKey', () => {
    const p = session.items[5];
    const memory: Memory = { ...emptyMemory(), loops: [{ n: 4, seed: 1, watched: 1, lingers: 1, sleeps: 0, fromMem: 0, medDwell: 7, sim: false, at: 1 }], pages: { mem1: pageMemory('mem1', { a: 2, b: 1 }) } };
    const records = scored([]);
    records[5] = { ...records[5], item: { ...p, memKey: 'mem1' } };
    const next = learn(memory, records, { seed: 77, at: 9 });
    expect(next.pages.mem1).toMatchObject({ shown: 2, lingers: 0, lastLoop: 5 });
    expect(next.pages.mem1.a).toBeCloseTo(1.85, 12);
    expect(next.pages.mem1.b).toBeCloseTo(2, 12);
  });

  it('keeps the 80 pages with the highest mean, breaking ties by more lingers', () => {
    const pages: Record<string, PageMemory> = {};
    for (let i = 0; i < 100; i++) pages[`p${i}`] = pageMemory(`p${i}`, { a: 1 + (i % 50), b: 1, lingers: i });
    const next = learn({ ...emptyMemory(), pages }, [], { seed: 1, at: 1 });
    const kept = Object.keys(next.pages);
    expect(kept).toHaveLength(80);
    // Means repeat every 50 entries, so the 10 lowest means (i % 50 < 10) drop out at both ends...
    for (let i = 0; i < 100; i++) expect(kept.includes(`p${i}`)).toBe(i % 50 >= 10);
    // ...and a tie on the mean keeps the entry with more lingers.
    const tied: Record<string, PageMemory> = {};
    for (let i = 0; i < 81; i++) tied[`t${i}`] = pageMemory(`t${i}`, { a: 2, b: 1, lingers: i });
    expect(Object.keys(learn({ ...emptyMemory(), pages: tied }, [], { seed: 1, at: 1 }).pages)).not.toContain('t0');
  });

  it('keeps the last 30 loops and numbers the next loop from the highest stored n', () => {
    let memory = emptyMemory();
    for (let i = 0; i < 35; i++) memory = learn(memory, scored([2]), { seed: i, at: i });
    expect(memory.loops).toHaveLength(30);
    expect(memory.loops.map((l) => l.n)).toEqual(Array.from({ length: 30 }, (_, i) => i + 6));
    const shuffled = { ...memory, loops: [...memory.loops].reverse() };
    expect(learn(shuffled, [], { seed: 0, at: 0 }).loops.at(-1)!.n).toBe(36);
  });

  it('logs the loop with medDwell rounded to 0.1 s', () => {
    const next = learn(emptyMemory(), scored([1, 2], [3]), { seed: 77, at: 123 });
    const log = next.loops[0];
    expect(log).toMatchObject({ n: 1, seed: 77, watched: 30, lingers: 3, sleeps: 1, fromMem: 0, sim: false, at: 123 });
    expect(log.medDwell * 10).toBeCloseTo(Math.round(log.medDwell * 10), 9);
    expect(next.updatedAt).toBe(123);
    expect(next.v).toBe(1);
  });

  it('does not mutate the memory it learns from', () => {
    const memory = buildMemoryFixture();
    const copy = structuredClone(memory);
    learn(memory, scored([1]), { seed: 1, at: 1 });
    expect(memory).toEqual(copy);
  });
});

describe('biasFrom', () => {
  it('returns no bias without feature scores', () => {
    expect(biasFrom(emptyMemory())).toBeNull();
    expect(biasFrom(null)).toBeNull();
  });

  it('weighs each family and note against its group, clamped to 0.6 to 1.8', () => {
    const memory: Memory = { ...emptyMemory(), feat: { '1|c|RED': { a: 30, b: 1 }, '1|n|69': { a: 1, b: 9 } } };
    const bias = biasFrom(memory)!;
    expect(bias.cat[1].RED).toBe(1.8);
    // Orange and Yellow are missing (rate 0.1); mean = (0.968 + 0.1 + 0.1) / 3.
    const mean = (30 / 31 + 0.2) / 3;
    expect(bias.cat[1].ORANGE).toBeCloseTo(Math.max(0.6, 0.1 / mean), 12);
    expect(bias.cat[1].ORANGE).toBe(0.6);
    expect(bias.note[1][69]).toBeCloseTo(1, 12);
    for (const cat of ['GREEN', 'TEAL', 'BLUE'] as const) expect(bias.cat[4][cat]).toBeCloseTo(1, 12);
  });
});

describe('applyMemory', () => {
  const fixture = buildMemoryFixture();
  const carry = (s: Session, m: Memory) => applyMemory(s, m, mulberry32((s.seed ^ CARRY_SALT) >>> 0));

  it('the fixture holds remembered pages', () => {
    expect(Object.keys(fixture.pages).length).toBeGreaterThan(40);
    expect(Object.keys(fixture.pages).length).toBeLessThanOrEqual(80);
    expect(fixture.loops).toHaveLength(5);
  });

  it('is reproducible', () => {
    for (const seed of randomSeeds(20, 8)) {
      const s = generateValid({ seed, ...PACE_PRESETS.standard, bias: biasFrom(fixture) });
      expect(carry(s, fixture)).toEqual(carry(s, fixture));
    }
  });

  it('never breaks validation, and keeps timing, level, drone and fade', () => {
    let total = 0;
    for (const memory of [fixture, ...sandboxMemories(4)]) {
      for (const seed of randomSeeds(100, 9)) {
        for (const pace of Object.values(PACE_PRESETS)) {
          const before = generateValid({ seed, ...pace, bias: biasFrom(memory) });
          const after = carry(before, memory);
          expect(after.validation.pass).toBe(true);
          expect(validate(after.items, pace.minDwell).pass).toBe(true);
          expect(after.items.filter((p) => p.memKey).length).toBe(after.inserted);
          total += after.inserted;
          after.items.forEach((p, i) => {
            const b = before.items[i];
            expect([p.i, p.start, p.dwell, p.phase, p.gainDb, p.xfade, p.drone]).toEqual([b.i, b.start, b.dwell, b.phase, b.gainDb, b.xfade, b.drone]);
            if (!p.memKey) {
              expect(p).toEqual(b);
              return;
            }
            const m = memory.pages[p.memKey];
            expect(m.phase).toBe(p.phase);
            expect([p.cat, p.L, p.C, p.h, p.hex, p.midi]).toEqual([m.cat, m.L, m.C, m.h, m.hex, m.midi]);
            expect(i).toBeGreaterThan(0);
            expect(i).toBeLessThan(after.items.length - 1);
            for (const q of [after.items[i - 1], after.items[i + 1]]) {
              expect(q.cat).not.toBe(p.cat);
              expect(Math.abs(q.L - p.L)).toBeLessThanOrEqual(0.08);
              expect(Math.abs(q.midi - p.midi)).toBeLessThanOrEqual(7);
            }
          });
        }
      }
    }
    expect(total).toBeGreaterThan(100);
  });

  it('never fills more than 25% of a group, and at least allows one page', () => {
    // Thirty near-certain pages all in group 6.
    const base = generateValid({ seed: 404, ...PACE_PRESETS.standard });
    const group6 = base.items.filter((p) => p.phase === 6);
    const pages: Record<string, PageMemory> = {};
    for (let i = 0; i < 30; i++) {
      const src = group6[i % group6.length];
      const key = `#${(0x100000 + i).toString(16).toUpperCase()}-${src.midi}-6`;
      pages[key] = pageMemory(key, { cat: src.cat, catName: src.catName, L: src.L, C: src.C, h: src.h, hex: key.slice(0, 7), midi: src.midi, phase: 6, a: 60, b: 1 });
    }
    const memory = { ...emptyMemory(), pages };
    for (const seed of randomSeeds(30, 10)) {
      const s = generateValid({ seed, ...PACE_PRESETS.standard });
      const out = carry(s, memory);
      const size = s.items.filter((p) => p.phase === 6).length;
      const fromMem = out.items.filter((p) => p.memKey && p.phase === 6).length;
      expect(fromMem).toBeLessThanOrEqual(Math.max(1, Math.floor(0.25 * size)));
    }
  });

  it('does not place a page that is already in the session', () => {
    const s = generateValid({ seed: 5, ...PACE_PRESETS.standard });
    const p = s.items[10];
    const memory: Memory = { ...emptyMemory(), pages: { [pageKey(p)]: pageMemory(pageKey(p), { ...p, a: 80, b: 1 }) } };
    const out = carry(s, memory);
    expect(out.inserted).toBe(0);
    expect(out.items.map(keyOf)).toEqual(s.items.map(keyOf));
  });

  it('does not mutate the session it is given', () => {
    const s = generateValid({ seed: 6, ...PACE_PRESETS.standard });
    const copy = structuredClone(s);
    carry(s, fixture);
    expect(s).toEqual(copy);
  });

  it('prepareSession skips biasFrom and applyMemory when the switch is off', () => {
    for (const seed of randomSeeds(10, 11)) {
      const off = prepareSession({ seed, ...PACE_PRESETS.standard, memory: fixture, useMemory: false });
      expect(off).toEqual(generateValid({ seed, ...PACE_PRESETS.standard }));
      const on = prepareSession({ seed, ...PACE_PRESETS.standard, memory: fixture, useMemory: true });
      expect(on).toEqual(carry(generateValid({ seed, ...PACE_PRESETS.standard, bias: biasFrom(fixture) }), fixture));
    }
  });

  it('learned feature scores tilt new pages toward favored families, within bounds', () => {
    const memory: Memory = { ...emptyMemory(), feat: {} };
    for (let g = 1; g <= 7; g++) memory.feat[`${g}|c|BLUE`] = { a: 40, b: 10 };
    const count = (m: Memory | null) =>
      randomSeeds(200, 12).reduce((n, seed) => n + generateValid({ seed, ...PACE_PRESETS.standard, bias: biasFrom(m) }).items.filter((p) => p.cat === 'BLUE').length, 0);
    expect(count(memory)).toBeGreaterThan(count(null) * 1.1);
  });
});
