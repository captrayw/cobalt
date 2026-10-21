# Golden files

The brief asks for proof that the TypeScript core is equivalent to the reference code: sessions for seeds 1 to 1,000 at both presets, with and without a fixed memory fixture, must match JSON exported from the reference, with numbers within 1e-9.

The reference files (`gen-core.js`, `loop.js` and `color-pitch-calm.html`) were not supplied with the brief this build started from, so the port was written from the brief's text. Its statistics match the brief's reported reference numbers (pass rates, page counts, timing and the sandbox learning effect), but exact equivalence is still unproven.

## To run the equivalence test

1. Copy `gen-core.js` and `loop.js` into `golden/reference/`.
2. Run `pnpm golden:export`. It loads the two files in an isolated context, builds the memory fixture from five sessions (seeds 1 to 5, 5 to 10 s preset, every page whose 0-based index is divisible by 7 held for 4 × its planned dwell), and writes four session files plus `memory-fixture.json` and `manifest.json` to `golden/out/`.
3. Run `pnpm test`. The `golden files exported from the reference code` tests in `packages/core/test/golden.test.ts` now run instead of being skipped.

If the reference functions take different arguments than the brief describes, adjust the adapter marked `ADAPT HERE` in `export.mjs`.

`golden/out/` is ignored by Git because the files are large (about 150 MB). `node golden/export.mjs --impl port` runs the exporter against the port itself, which only checks the exporter; the golden tests skip such files unless `GOLDEN_ALLOW_PORT=1` is set.

A small regression snapshot of the port (seeds 1 and 2) lives in `packages/core/test/__snapshots__/port-sessions.json`, so an accidental change to the generator still fails a test.
