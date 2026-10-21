import { emptyMemory, learn, scoreRecords } from '@calm/core';
import { describe, expect, it } from 'vitest';
import { finalizeSession } from './finalize';
import { makeSessionDoc, T0 } from './testing';

describe('finalizeSession', () => {
  it('matches scoreRecords then learn on the same records', () => {
    const doc = makeSessionDoc({ lingerEvery: 7 });
    const prior = finalizeSession(emptyMemory(), makeSessionDoc({ seed: 8, lingerEvery: 5 }), T0 - 1, 'done').memory;
    const { memory, doc: out } = finalizeSession(prior, doc, T0, 'done');

    const scored = scoreRecords(doc.records.map((r) => ({ item: r.item, k: r.index, dwell: r.dwell, sleep: r.sleep, cycles: r.breaths })));
    expect(memory).toEqual(learn(prior, scored, { seed: doc.seed, at: T0 }));
    expect(out.records.map((r) => [r.z, r.linger])).toEqual(scored.map((r) => [r.z, r.linger]));
    // Only the pages held for 4 x their planned dwell can linger.
    const lingered = out.records.filter((r) => r.linger).map((r) => r.index);
    expect(lingered.length).toBeGreaterThanOrEqual(3);
    expect(lingered.every((k) => k % 7 === 0)).toBe(true);
    expect(prior).toEqual(finalizeSession(emptyMemory(), makeSessionDoc({ seed: 8, lingerEvery: 5 }), T0 - 1, 'done').memory);
  });

  it('fills totals, status and the end time', () => {
    const doc = makeSessionDoc({ lingerEvery: 7, watched: 12 });
    doc.records[3] = { ...doc.records[3], sleep: true, dwell: 200 };
    doc.records[5] = { ...doc.records[5], item: { ...doc.records[5].item, memKey: 'K' } };
    const { doc: out } = finalizeSession(emptyMemory(), doc, T0 + 5, 'done');
    expect(out.status).toBe('done');
    expect(out.endedAt).toBe(T0 + 5);
    expect(out.totals).toEqual({
      watched: 12,
      lingers: out.records.filter((r) => r.linger).length,
      sleeps: 1,
      fromMem: 1,
      seconds: doc.records.reduce((s, r) => s + r.dwell, 0),
    });
    expect(out.records[3].linger).toBe(true);
    // An end time that is already set is kept.
    expect(finalizeSession(emptyMemory(), { ...doc, endedAt: T0 + 1 }, T0 + 5, 'partial').doc).toMatchObject({ endedAt: T0 + 1, status: 'partial' });
  });

  it('closes a session with no records without changing memory', () => {
    const prior = finalizeSession(emptyMemory(), makeSessionDoc({ lingerEvery: 7 }), T0, 'done').memory;
    const { memory, doc } = finalizeSession(prior, makeSessionDoc({ watched: 0 }), T0 + 1, 'partial');
    expect(memory).toBe(prior);
    expect(doc.totals).toEqual({ watched: 0, lingers: 0, sleeps: 0, fromMem: 0, seconds: 0 });
  });

  it('does not mutate its inputs', () => {
    const doc = makeSessionDoc({ lingerEvery: 7 });
    const memory = emptyMemory();
    const copies = structuredClone({ doc, memory });
    finalizeSession(memory, doc, T0, 'done');
    expect({ doc, memory }).toEqual(copies);
  });
});
