# cobalt

A cobalt app by A Color Company, [acolorcompany.com](https://acolorcompany.com). It runs at https://captrayw.github.io/cobalt/.

A phone-first web app that plays a 15-minute feed of full-screen colors and soft tones. It opens straight into the feed, and the sound starts with the first touch. Colors lose saturation and move from warm to cool, notes descend and soften, and the last page resolves to D3. Each page's note holds until the person moves on, then flows into the next. A page held past its planned time starts to breathe: its note swells once per breath, each breath a little longer, softer and more exhale-weighted. A person who scrolls quickly gets more, shorter pages, so the session still lasts about 15 minutes. At night, a swipe to the right turns the colors warm and dim, with no blue, darker page by page; a swipe to the left brings the day colors back. The app remembers the pages a person lingers on and brings some back in later sessions. Everything stays on the device.

Version 1 is an installable progressive web app (PWA): no account, no network requests, no analytics.

## Run it

Requires Node.js 22 or later and pnpm (via `corepack enable pnpm`).

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm build          # production build in apps/web/dist
pnpm preview        # serve the build at http://localhost:4173 (service worker on)
```

## Put it on a phone

The app is published with GitHub Pages. `.github/workflows/pages.yml` builds it for a folder named after the repository and deploys it on every push to `main`, at `https://<user>.github.io/<repository>/`. Set it up once:

1. Create an empty public repository on GitHub. On a free plan, GitHub Pages needs a public repository.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push: `git remote add origin https://github.com/<user>/<repository>.git`, then `git push -u origin main`. The first push opens a GitHub sign-in window.

When the **Deploy to GitHub Pages** run on the **Actions** tab turns green, open the address on the phone and add it to the home screen: **Share → Add to Home Screen** in Safari on an iPhone, or **⋮ → Install app** in Chrome on Android. After the first visit it works offline. Memory stays with that address, so keep using the same one.

Any other static host works too. Upload `apps/web/dist` from `pnpm build` to the root of a host. To serve it from a folder instead, build with `BASE_PATH=/<folder>/`, so the icons, manifest and service worker point inside that folder.

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

If the project sits in a folder that OneDrive (or another sync tool) syncs, a build can occasionally fail with `EPERM` while the sync tool holds a file in `apps/web/dist`; run it again, or keep the project outside the synced folder. Syncing the builds and traces that the browser tests write also takes CPU time, which can slow the WebKit tests enough to time out.

## Status

Milestones 1 to 5 are built, and evening mode from milestone 7. Their gates pass locally, except the parts that need the reference code or real hardware (see `docs/decisions.md`). Milestone 6 (cloud sync) and research mode wait for the owner's approval.

cobalt makes no medical or therapeutic claims.

© 2026 A Color Company. All rights reserved.
