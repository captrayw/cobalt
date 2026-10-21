# Calm Scroll

A phone-first web app that plays a 15-minute feed of full-screen colors and soft tones. Colors lose saturation and move from warm to cool, notes descend and soften, and the last page resolves to D3. A page held past its planned time starts to breathe: its note repeats once per breath, each breath a little longer, softer and more exhale-weighted. The app remembers the pages a person lingers on and brings some back in later sessions. Everything stays on the device.

Version 1 is an installable progressive web app (PWA): no account, no network requests, no analytics.

## Run it

Requires Node.js 22 or later and pnpm (via `corepack enable pnpm`).

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm build          # production build in apps/web/dist
pnpm preview        # serve the build at http://localhost:4173 (service worker on)
```

To use it on a phone, serve `apps/web/dist` over HTTPS (any static host works), open it, then use **Add to Home Screen** (iOS Safari) or **Install app** (Android Chrome). After the first visit it works offline.

## Repository

| Path | What it holds |
|---|---|
| `packages/core` | Pure TypeScript rules with no DOM, audio or storage: `constants.ts` (every tunable value), `rng.ts`, `color.ts`, `model.ts`, `generate.ts`, `validate.ts` (the nine checks), `linger.ts`, `loop.ts` (scoring, learning, carry-over), `session.ts`, `simulate.ts`. It runs unchanged in Node, the browser and tests. |
| `packages/audio` | The `AudioEngine` interface, its Web Audio implementation, a silent fallback, and the developer preview player. |
| `apps/web` | The React app: `src/feed` (pure reducer, controller, gestures, crossfade), `src/screens`, `src/storage` (IndexedDB, zod schemas, migrations, export and import), `e2e` (Playwright). |
| `golden` | The exporter for golden-file equivalence tests against the reference code (see `golden/README.md`). |
| `docs` | Decisions and deviations, and the loudness calibration record. |

The hidden developer screen is at `#/dev`: generate a session by seed, read the nine checks and the full sequence, and listen at 1× or 10×.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test           # core and app unit tests (Vitest), incl. property tests (fast-check)
pnpm test:audio     # offline audio renders in Chromium (Vitest browser mode)
pnpm e2e            # Playwright: feed scenarios in Chromium and WebKit, axe, offline, budgets
pnpm verify         # all of the above, as CI runs them
```

Install Playwright's browsers once with `pnpm --filter @calm/web exec playwright install chromium webkit`.

## Status

Milestones 1 to 5 are built. Their gates pass locally, except the parts that need the reference code or real hardware (see `docs/decisions.md`). Milestones 6 (cloud sync) and 7 (evening and research modes) wait for the owner's approval.

Calm Scroll is a relaxation aid. It makes no medical or therapeutic claims.
