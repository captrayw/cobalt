import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyMemory, biasFrom, CARRY_SALT, generateValid, mulberry32, PACE_PRESETS, type Memory, type PaceId } from '../src/index.ts';
import { buildMemoryFixture } from './helpers.ts';

const outDir = fileURLToPath(new URL('../../../golden/out/', import.meta.url));
const manifestPath = outDir + 'manifest.json';
const manifest: { impl: string; seeds: number; files: { name: string; preset: PaceId; memory: boolean }[] } | null = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : null;
// Golden files must come from the reference code; files exported from the port only check the exporter.
const runGolden = manifest !== null && (manifest.impl === 'reference' || process.env.GOLDEN_ALLOW_PORT === '1');

/** Deep comparison with numbers within 1e-9; a missing memKey equals an undefined or null one. */
function expectClose(actual: unknown, expected: unknown, path = '$'): void {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(1e-9);
    return;
  }
  if (expected === null || typeof expected !== 'object') {
    expect(actual ?? null, path).toEqual(expected ?? null);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((e, i) => expectClose((actual as unknown[])[i], e, `${path}[${i}]`));
    return;
  }
  const a = actual as Record<string, unknown>,
    e = expected as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(e)].filter((k) => a[k] !== undefined || e[k] !== undefined));
  for (const k of keys) expectClose(a[k], e[k], `${path}.${k}`);
}

describe.skipIf(!runGolden)('golden files exported from the reference code', () => {
  const fixture: Memory = runGolden ? JSON.parse(readFileSync(outDir + 'memory-fixture.json', 'utf8')) : (null as never);

  it('the memory fixture built by the port matches the reference fixture', () => {
    // Save times depend on the clock each implementation reads, so they are not compared.
    const untimed = (m: Memory) => ({ ...m, updatedAt: 0, loops: m.loops.map((l) => ({ ...l, at: 0 })) });
    expectClose(untimed(buildMemoryFixture()), untimed(fixture));
  });

  for (const file of manifest?.files ?? []) {
    it(`reproduces ${file.name}`, () => {
      const sessions: { seed: number; tries: number; inserted: number; items: unknown[] }[] = JSON.parse(readFileSync(outDir + file.name, 'utf8'));
      const pace = PACE_PRESETS[file.preset];
      for (const golden of sessions) {
        let ours = generateValid({ seed: golden.seed, ...pace, bias: file.memory ? biasFrom(fixture) : null });
        if (file.memory) ours = applyMemory(ours, fixture, mulberry32((ours.seed ^ CARRY_SALT) >>> 0));
        expect(ours.tries, `seed ${golden.seed} tries`).toBe(golden.tries);
        expect(ours.inserted, `seed ${golden.seed} inserted`).toBe(golden.inserted);
        expectClose(ours.items, golden.items, `seed ${golden.seed}`);
      }
    });
  }
});

describe('port regression snapshot', () => {
  it('keeps generating the same sessions (seeds 1 and 2, both presets, with and without the fixture)', async () => {
    const fixture = buildMemoryFixture();
    const compact = [];
    for (const preset of ['standard', 'measured'] as const) {
      for (const memory of [null, fixture]) {
        for (const seed of [1, 2]) {
          let s = generateValid({ seed, ...PACE_PRESETS[preset], bias: biasFrom(memory) });
          if (memory) s = applyMemory(s, memory, mulberry32((s.seed ^ CARRY_SALT) >>> 0));
          compact.push({
            seed,
            preset,
            memory: memory !== null,
            tries: s.tries,
            inserted: s.inserted,
            pages: s.items.map((p) => [p.start, p.dwell, p.cat, p.L, p.C, p.h, p.hex, p.midi, p.memKey ?? null]),
          });
        }
      }
    }
    await expect(JSON.stringify(compact, null, 1)).toMatchFileSnapshot('./__snapshots__/port-sessions.json');
  });
});
