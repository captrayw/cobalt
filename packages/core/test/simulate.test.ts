import { describe, expect, it } from 'vitest';
import { makeViewer, mulberry32, simulate, watch, generateValid, PACE_PRESETS, CAT_IDS } from '../src/index.ts';

describe('sandbox simulation', () => {
  it('learns: over 300 viewers x 10 loops, remembered pages linger at least 1.5x as often as fresh ones', () => {
    const result = simulate({ seed: 2026, viewers: 300, loops: 10 });
    expect(result.memPages).toBeGreaterThan(0);
    expect(result.memLingerRate).toBeGreaterThanOrEqual(1.5 * result.freshLingerRate);
    const [first, , , , , , , , , tenth] = result.loops;
    expect(tenth.favoriteShare).toBeGreaterThan(first.favoriteShare);
    expect(first.fromMem).toBe(0);
    expect(tenth.fromMemShare).toBeGreaterThan(0.1);
  });

  it('is deterministic for a seed', () => {
    expect(simulate({ seed: 4, viewers: 3, loops: 4 })).toEqual(simulate({ seed: 4, viewers: 3, loops: 4 }));
  });

  it('builds viewers with one favorite family and note scored 1, others 0.2 to 0.6', () => {
    const viewer = makeViewer(mulberry32(1));
    expect(viewer.cat[viewer.favoriteCat]).toBe(1);
    expect(viewer.note[viewer.favoriteMidi]).toBe(1);
    for (const id of CAT_IDS) if (id !== viewer.favoriteCat) expect(viewer.cat[id]).toBeGreaterThanOrEqual(0.2);
    for (const id of CAT_IDS) if (id !== viewer.favoriteCat) expect(viewer.cat[id]).toBeLessThan(0.6);
  });

  it('a sleep in groups 6 and 7 lasts 200 s and ends the loop', () => {
    const items = generateValid({ seed: 3, ...PACE_PRESETS.standard }).items;
    let found = false;
    for (let s = 0; s < 300 && !found; s++) {
      const records = watch(mulberry32(s), makeViewer(mulberry32(s + 1000)), items);
      const last = records[records.length - 1];
      if (last.sleep) {
        found = true;
        expect(last.dwell).toBe(200);
        expect(last.item.phase).toBeGreaterThanOrEqual(6);
        expect(records.length).toBeLessThan(items.length + 1);
        expect(records.filter((r) => r.sleep)).toHaveLength(1);
      } else {
        expect(records).toHaveLength(items.length);
      }
    }
    expect(found).toBe(true);
  });
});
