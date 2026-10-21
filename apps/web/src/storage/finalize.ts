import { learn, scoreRecords, type DwellRecord, type Memory } from '@calm/core';
import type { SessionDoc } from './types';

/**
 * Scores a session's records and learns from them: the core's scoreRecords, then learn.
 * Returns the new memory and the session with each record's z and linger, its totals, status and end time.
 * A session with no records changes nothing in memory; it is only closed.
 */
export function finalizeSession(
  memory: Memory,
  doc: SessionDoc,
  at: number,
  status: 'done' | 'partial',
): { memory: Memory; doc: SessionDoc } {
  const records: DwellRecord[] = doc.records.map((rec) => ({ item: rec.item, k: rec.index, dwell: rec.dwell, sleep: rec.sleep, cycles: rec.breaths }));
  const scored = scoreRecords(records);
  const next = records.length > 0 ? learn(memory, scored, { seed: doc.seed, at }) : memory;
  const out = doc.records.map((rec, i) => ({ ...rec, z: scored[i].z, linger: scored[i].linger }));
  return {
    memory: next,
    doc: {
      ...doc,
      records: out,
      totals: {
        watched: out.length,
        lingers: out.filter((r) => r.linger).length,
        sleeps: out.filter((r) => r.sleep).length,
        fromMem: out.filter((r) => r.item.memKey !== undefined).length,
        seconds: out.reduce((sum, r) => sum + r.dwell, 0),
      },
      status,
      endedAt: doc.endedAt ?? at,
    },
  };
}
