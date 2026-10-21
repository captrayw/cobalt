import {
  breathsReached,
  emptyMemory,
  generateValid,
  learn,
  mulberry32,
  PACE_PRESETS,
  scoreRecords,
  simulate,
  type DwellRecord,
  type Memory,
  type Page,
} from '../src/index.ts';

/** n pseudo-random 32-bit seeds. */
export function randomSeeds(n: number, salt: number): number[] {
  const rng = mulberry32(salt);
  return Array.from({ length: n }, () => Math.floor(rng() * 4294967296) >>> 0);
}

/** A record for page k held for `dwell` seconds. */
export function recordFor(item: Page, k: number, dwell: number, sleep = false): DwellRecord {
  return { item, k, dwell, sleep, cycles: breathsReached(item.dwell, dwell, 'gradual') };
}

/**
 * The golden memory fixture from the brief: five sessions (seeds 1 to 5, 5 to 10 s preset) passed
 * through scoreRecords and learn, holding each page whose 0-based index is divisible by 7 for
 * 4 x its planned dwell and every other page for exactly its planned dwell.
 */
export function buildMemoryFixture(): Memory {
  let memory = emptyMemory();
  for (let seed = 1; seed <= 5; seed++) {
    const session = generateValid({ seed, ...PACE_PRESETS.standard });
    const records = session.items.map((item, k) => recordFor(item, k, k % 7 === 0 ? 4 * item.dwell : item.dwell));
    memory = learn(memory, scoreRecords(records), { seed: session.seed, at: seed });
  }
  return memory;
}

/** Memories learned by sandbox viewers: realistic, varied inputs for carry-over tests. */
export function sandboxMemories(count: number): Memory[] {
  return Array.from({ length: count }, (_, i) => simulate({ seed: 500 + i, viewers: 1, loops: 6 }).memory);
}
