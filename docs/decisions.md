# Decisions and deviations

What was built against the brief, what was decided by default, and every place the build departs from or interprets the brief.

## Owner decisions taken by default

The brief lists four decisions to confirm before milestone 1. Until the owner says otherwise, the build uses the brief's defaults:

| Decision | Default used |
|---|---|
| Product name and icon | "Calm Scroll"; an icon drawn from the arc itself (`apps/web/scripts/make-icons.mjs`). |
| App-store distribution | Not in version 1: no Capacitor shell. |
| Cloud sync (milestone 6) | Not built. |
| Evening mode and research mode (milestone 7) | Not built. |

## Milestone gates

| Milestone | Gate | Status |
|---|---|---|
| 1 Core | Golden-file, color, determinism, validity, uniqueness, invariant, scoring, memory, learning-effect and linger tests | All pass except golden files, which need the reference code (below). |
| 2 Audio | Audio render tests; listening check on an iPhone and an Android phone | Render tests pass. The listening check needs hardware and is not done. |
| 3 Feed | Scenarios 1, 2 and 5 to 9 in Chromium and WebKit | Pass. |
| 4 Learning in the app | Scenarios 3, 4 and 10 to 12; an exported file imports back unchanged | Pass. |
| 5 PWA release | Scenario 13; installs and runs offline; axe finds no serious issues; performance budgets | Pass in headless browsers; not yet installed on a physical phone. |

## Departures from the brief

1. **No reference code.** `gen-core.js`, `loop.js` and `color-pitch-calm.html` were not supplied, so the core was ported from the brief's text, and the golden-file equivalence test is skipped until they are added (`golden/README.md`). The port reproduces the brief's reported reference statistics:

   | Measure | Brief | Port |
   |---|---|---|
   | 5 to 10 s preset | always passes on the first draw; 111 to 128 pages, median 120; about 0.3 ms | passes; 112 to 127 pages, median 120; 0.31 ms. About 3 seeds in 100,000 need a second draw (pitchFalls between groups 1 and 2), consistent with none in the brief's 5,000. |
   | 12 to 24 s preset | 99% on the first draw, never more than two; 46 to 56 pages, median 50 | 99.0%, never more than two; 46 to 55 pages, median 50 |
   | Sandbox, 300 viewers × 10 loops | remembered 15.8% vs fresh 8.5%; 18.9% from memory by loop 10; favorite family 13.9% to 17.1% | 15.3% vs 8.6%; 18.9%; 13.8% to 17.2% |

2. **Fading the previous page's tones on a page change** (`VOICE_RELEASE_TC`, 0.25 s). Not in the brief. Without it, quick swipes stack long tones and can sound louder than the first page, which the loudness rule forbids.

3. **The AudioEngine interface gained members** the feed and preview need: `setVolume`, `releaseVoices`, `fadeDrones`, `state`, `onStateChange`, and an optional `closeAfterSec` on `close()`.

4. **New constants** in `packages/core/src/constants.ts` for values the brief leaves implicit: `VOICE_RELEASE_TC`, `VOLUME_TC` (0.05 s volume ramps), `FADE_TCS` (a fading voice stops after 8 time constants), `DRONE_FADE_TCS` (preview waits 5 drone time constants before stopping), `MIN_PAGE_SEC` and `CHECKPOINT_EVERY`.

5. **Audio jump test.** The brief's page tone and linger breath stay under 0.01 per sample. The loudest possible first tone (B4 at 0 dB) is a clean sine whose own slope is 0.0114 per sample at 48 kHz, so that case is checked against its slope with headroom instead.

6. **Performance** was measured in headless Chromium with the CPU slowed 4×, not with a trace on a real mid-range Android phone. Generation peaks near 21 ms (budget 50), later page changes take 4 to 12 ms (budget 16), and the crossfade drops no frames. The first page change after loading can take about 16 ms while the JavaScript engine warms up.

## Interpretations of open points

- A page's group, session progress and level come from its planned start time.
- The last page's note is fixed (D3), so it consumes no random draw.
- A typed seed is trimmed first; digits only are taken modulo 2^32 with exact integer arithmetic.
- "The first event in a gesture with a normalized deltaY above 12 px" means the first event in the gesture that exceeds 12 px.
- Carry-over: every remembered page gets its uniform draw before the room and presence checks; "interior pages" are pages with both neighbors (not the first or last page of the session); normal draws for the gamma sampler use Box-Muller.
- The sandbox draws, per page: the sleep chance (groups 6 and 7) first, then the linger draw, then the dwell.
- An audio interruption moves the feed to Paused only after the context had been running, and is ignored while Resting (the sound is already fading). A tap resumes.
- A page that becomes hidden while Resting keeps counting toward its dwell, since the person may be asleep with the screen off.
- Checkpoints include the page on screen so far, so an app closed mid-page still records it at the next launch.
- With the "Use what I lingered on" switch off, sessions skip biasFrom and applyMemory but still learn.
- On the Summary screen, "Start next session" and "Done" are equal buttons.

## Not done

- Golden-file equivalence against the reference code (needs the reference files).
- The listening check on one iPhone and one Android phone, and the loudness calibration (`docs/calibration.md`).
- Installing on a physical phone.
- Milestones 6 and 7, pending the owner's approval.
