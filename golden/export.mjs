#!/usr/bin/env node
/**
 * Exports golden sessions for the equivalence tests in packages/core/test/golden.test.ts.
 *
 *   node golden/export.mjs                 run the reference code in golden/reference/ (the default)
 *   node golden/export.mjs --impl port     run this repository's TypeScript port instead (self-check only)
 *   GOLDEN_SEEDS=50 node golden/export.mjs export fewer seeds while trying it out
 *
 * For seeds 1 to 1,000 at both presets, once with empty memory and once with the memory fixture
 * (applied through biasFrom and applyMemory), it writes { seed, preset, tries, inserted, items }
 * per session to golden/out/, plus memory-fixture.json and manifest.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const refDir = join(here, 'reference');
const outDir = join(here, 'out');
const PRESETS = { standard: { minDwell: 5, maxDwell: 10 }, measured: { minDwell: 12, maxDwell: 24 } };
const SEEDS = Number(process.env.GOLDEN_SEEDS ?? 1000);
const CARRY_SALT = 0x9e3779b9;
const impl = process.argv.includes('--impl') ? process.argv[process.argv.indexOf('--impl') + 1] : 'reference';

const clone = (x) => (x === undefined ? x : structuredClone(x));

/**
 * Loads gen-core.js and loop.js as browser scripts in an isolated context and returns their
 * CalmGen and CalmLoop objects, whether they are declared as globals, on window, or on module.exports.
 */
function loadReference() {
  const files = ['gen-core.js', 'loop.js'];
  for (const f of files) {
    if (!existsSync(join(refDir, f))) {
      console.error(`Missing golden/reference/${f}. Copy the reference files supplied with the brief there first.`);
      process.exit(1);
    }
  }
  const module = { exports: {} };
  const sandbox = { console, Math, JSON, performance: globalThis.performance, crypto: globalThis.crypto, module, exports: module.exports };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of files) vm.runInContext(readFileSync(join(refDir, f), 'utf8'), sandbox, { filename: f });
  const pick = (name) =>
    vm.runInContext(`typeof ${name} !== 'undefined' ? ${name} : undefined`, sandbox) ?? sandbox[name] ?? module.exports[name];
  const CalmGen = pick('CalmGen');
  const CalmLoop = pick('CalmLoop');
  if (!CalmGen || !CalmLoop) throw new Error('Could not find CalmGen and CalmLoop in the reference files.');

  // ADAPT HERE if the reference signatures differ. The reference mutates the inputs of scoreRecords,
  // learn and applyMemory, so each call works on a copy and returns the result or the mutated copy.
  const mulberry32 = CalmGen.mulberry32 ?? CalmLoop.mulberry32;
  return {
    generateValid: (opts) => CalmGen.generateValid(clone(opts)),
    biasFrom: (memory) => CalmLoop.biasFrom(clone(memory)),
    applyMemory: (session, memory, seed) => {
      const copy = clone(session);
      const out = CalmLoop.applyMemory(copy, clone(memory), mulberry32((seed ^ CARRY_SALT) >>> 0));
      return out ?? copy;
    },
    scoreRecords: (records) => {
      const copy = clone(records);
      return CalmLoop.scoreRecords(copy) ?? copy;
    },
    learn: (memory, records, meta) => {
      const copy = clone(memory);
      return CalmLoop.learn(copy, clone(records), meta) ?? copy;
    },
    emptyMemory: () => (CalmLoop.emptyMemory ? CalmLoop.emptyMemory() : { v: 1, updatedAt: 0, loops: [], pages: {}, feat: {} }),
  };
}

async function loadPort() {
  const core = await import(pathToFileURL(join(here, '../packages/core/src/index.ts')).href);
  return {
    generateValid: core.generateValid,
    biasFrom: core.biasFrom,
    applyMemory: (session, memory, seed) => core.applyMemory(session, memory, core.mulberry32((seed ^ CARRY_SALT) >>> 0)),
    scoreRecords: core.scoreRecords,
    learn: core.learn,
    emptyMemory: core.emptyMemory,
  };
}

const api = impl === 'port' ? await loadPort() : loadReference();

// The memory fixture: five sessions (seeds 1 to 5, 5 to 10 s preset), holding each page whose
// 0-based index is divisible by 7 for 4 x its planned dwell and every other page for its planned dwell.
let fixture = api.emptyMemory();
for (let seed = 1; seed <= 5; seed++) {
  const session = api.generateValid({ seed, ...PRESETS.standard });
  const records = session.items.map((item, k) => ({ item, k, dwell: k % 7 === 0 ? 4 * item.dwell : item.dwell, sleep: false, cycles: 0 }));
  fixture = api.learn(fixture, api.scoreRecords(records), { seed: session.seed, at: seed });
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'memory-fixture.json'), JSON.stringify(fixture, null, 1));

const files = [];
for (const [preset, pace] of Object.entries(PRESETS)) {
  for (const withMemory of [false, true]) {
    const sessions = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const bias = withMemory ? api.biasFrom(fixture) : null;
      let session = api.generateValid({ seed, ...pace, bias });
      if (withMemory) session = api.applyMemory(session, fixture, session.seed);
      sessions.push({ seed, preset, tries: session.tries, inserted: session.inserted ?? 0, items: session.items });
    }
    const name = `sessions-${preset}-${withMemory ? 'fixture' : 'empty'}.json`;
    writeFileSync(join(outDir, name), JSON.stringify(sessions));
    files.push({ name, preset, memory: withMemory, count: sessions.length });
    console.log(`wrote golden/out/${name} (${sessions.length} sessions)`);
  }
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ impl, seeds: SEEDS, files }, null, 1));
console.log(`done: impl=${impl}`);
