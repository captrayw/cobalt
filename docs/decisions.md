# Decisions and deviations

What was built against the brief, what was decided by default, and every place the build departs from or interprets the brief.

## Owner decisions taken by default

The brief lists four decisions to confirm before milestone 1. Until the owner says otherwise, the build uses the brief's defaults:

| Decision | Default used |
|---|---|
| Product name and icon | "cobalt" (owner change 7; the working name was "Calm Scroll"); the A Color Company calm-arc mark as the icon (owner change 9, `apps/web/scripts/make-icons.mjs`). |
| App-store distribution | An iPhone app in a Capacitor shell (owner change 11). It builds and runs in the iPhone simulator; TestFlight and the App Store listing wait on the owner's Apple developer account. |
| Cloud sync (milestone 6) | Not built. |
| Evening mode and research mode (milestone 7) | Not built. |

## Owner changes (October 2026)

After trying version 1, the owner asked for these changes. They take precedence over the brief where the two differ.

1. **No lead-in screen.** Opening the app goes straight into the feed: a session starts as soon as storage has opened. Browsers allow sound only after a gesture, so the colors start at once and the sound starts with the first swipe, tap or key (on iPhone Safari only a tap; the iPhone app starts it at launch: owner change 13). Swipes and taps are read on `pointerup`; `touchend` and `click` try again, because iOS may only count those as the gesture that lets sound start. A quiet "Swipe up for the next page" hint shows on the first page until the first touch, and stops showing for good once the person has moved on to a next page (owner change 10). The memory switch moved to Settings and applies from the next session (pace and rhythm moved there too, until owner change 4 removed them). "Done" on the summary leads to a quiet Done screen with "Start a session", Memory, Settings and About.
2. **The voice holds.** Each page's note sounds steadily for as long as the person stays, and crossfades into the next page's note over the page's color crossfade (`xfade`), instead of the brief's single tone per page. This replaces the 0.25 s release of departure 2 below (`VOICE_RELEASE_TC` is gone): with one held voice, quick swipes cannot stack tones. A lingering breath is a swell on the held note, peaking at the brief's breath level and settling 10 dB below it (`VOICE.breathDepthDb`), never to silence. The 3-minute Rest still fades to silence, as a safeguard for sleep. When sound starts late (the first touch, or a resume), the voice comes in over 1 s (`VOICE.resumeFadeSec`).
3. **Pace slicing.** Every 10 pages (`PACE_SLICING.checkEvery`), if the pages left would run out before 15 minutes at the person's average pace so far, the rest of the session is drawn again from the page on screen, with shorter pages (`sliceForPace` in `packages/core/src/pace.ts`):
   - The pages seen and the page on screen stay as they are.
   - The new pages' mean dwell puts the arc that is left into enough pages to last the time that is left at that pace. The dwell bounds keep the presets' 1 : 2 spread and never go under 2 s.
   - The new plan keeps the arc, ends on D3, and passes the nine checks together with the pages seen. Up to 60 draws are tried; if none passes, the plan stays as it was.
   - Remembered pages are placed only among the new pages, within the same group caps.
   - The check is deterministic and runs while the browser is idle after the page change, so it never slows a swipe.

   It does nothing when the pages left already last at least 95% of the time left (`enoughShare`), or when slicing would not make pages shorter. Because no page goes under 2 s (the brief's no-flashing rule), a session ends before 15 minutes at a pace near or under 2 s per page. Scenarios 1 to 3 press ↓ every 2 to 4.5 s, so they now run with slicing in effect, and they still pass.
4. **No pace or linger rhythm settings.** Every session uses the 5 to 10 s pace and the gradual rhythm. The core keeps the 12 to 24 s pace and the "2, 5, 9 s" rhythm, so the developer screen and the reducer's scenario 5 test still cover them, but the app no longer offers them. Rows an older version stored for them are skipped, and older export files still import without them. Scenario 5 now runs only as that unit test.
5. **No disclaimer.** The "relaxation aid" line is gone from the Done screen, About and the page description. The app still makes no medical or therapeutic claims.
6. **About names the maker.** It reads "a cobalt app by" above the A Color Company logo, links to acolorcompany.com and ends with "© 2026 A Color Company. All rights reserved.", over a cobalt glow that breathes once every 10 s and holds still under reduced motion. The logo follows the brand guide: the calm-arc bar (the seven arc colors, coral to blue-grey, with the website's impasto texture) beside the wordmark in Bricolage Grotesque 800 at −0.02em, sized in proportion to the website header's 28 × 11 px bar and 17 px type, with the displacement scaled to about 6 per 30 px of bar height. The research summary and source list that About held are no longer in the app; they remain in the brief.
7. **The app is named cobalt.** The home-screen name, the browser tab, the install manifest, the app's messages and the export file name (`cobalt-2026-10-21.json`) all say cobalt. Three things keep the old name on purpose: the database on the device (`calm-scroll`), because a new name would open an empty one and leave stored memory behind; the export format tag, so every export reads back; and the code's package names. The GitHub repository was renamed too, so the app moved to https://captrayw.github.io/cobalt/ (and then to cobalt.acolorcompany.com, owner change 12); the old address no longer works, and an installed copy has to be added again from the new one. An iPhone keeps the name an icon was added with, so the new name shows once the app is added to the home screen again.
8. **The website's design, and a new Settings screen.** The owner's design recommendations were taken in for the settings that exist; recommendations about settings the app does not have were left out, as the owner asked.
   - *Fonts:* Bricolage Grotesque 700 for titles and card headings, Instrument Sans for text, Space Mono for values, self-hosted like the fonts before. Four sizes: 28, 18, 17 and 14 px.
   - *Color:* the website's plain warm canvas and solid cards, no textures, and one cadmium accent for switches that are on, selected options and the primary button. In the light theme the accent is #C4361F rather than the website's #E0402A, which reaches only 3.7 : 1 as text on the canvas and 4.3 : 1 under white text; the dark theme keeps the website's #FF6A4D. Each card heading has a pigment marker.
   - *Settings:* one column of cards in the recommended order (Preview, Sound, Screen and color, Learning and memory, Bedtime, then Reset), each row a label with one line of help on the left and its control on the right. The preview shows a session's first page with the page-details setting applied and plays its note at the set volume; the volume slider plays the note as it moves. "What it learned" shows the remembered pages' colors and opens Memory. Reset memory sits last and asks for confirmation.
   - *Controls:* platform-style switches, segmented choices, a light haptic tap where the phone supports it, and the primary button in the website's outlined style with a 2 px offset shadow. Motion stays at short fades and follows the Motion setting.
   - *Left out, because the app has no such setting:* session length, pace, the warm opening stage, linger breathing on or off, a test-sound setting, haptic pulses per breath, dimming while lingering, an evening palette, a color-vision setting, the rest timer, what sound does at rest, privacy and account, "Delete data", and switching to dark mode in the evening by itself (the System theme follows the phone, which many phones switch at night).
9. **The icon is the calm-arc mark.** As the brand guide suggests for an app icon: the mark alone, no text, on the website's warm canvas, with clear space on every side at least the bar's height. The bar carries the impasto texture, scaled with it (the header bar's noise grown with the bar, displacement about 6 per 30 px of bar height). The favicon is the flat version, the same gradient as a rounded square with no texture. Chromium, already installed for the tests, renders the icons, so the texture matches the website. An iPhone keeps the icon an app was added with, so the new one shows once cobalt is added to the home screen again.
10. **Day and night.** Night colors for the feed: milestone 7's Evening mode, built at the owner's request.
    - *Colors:* the prototype's Sequence B, evening ambient lighting (found in the website's color-calm page): warm white, amber, soft rose, pale gold, dim sage, very warm white and a deep red night-light, one per group, at intensities 1.00, 0.70, 0.55, 0.40, 0.25, 0.15 and 0.05. Pages in a group shift by up to 6° of hue, following where their day color sits in its family.
    - *Dimming:* applied to the light itself (linear RGB), along one curve through the groups' intensities that never rises. Where a group's color would be brighter than the group before (pale gold after soft rose), it is held to the earlier level. The brief's checks hold: no blue or cyan (no hue from 160° to 300°), no page brighter than the one before, and the sound is the same as by day, so its checks are the session's own.
    - *Ink:* text turns light on dark night pages. In the middle of the curve, where neither ink reaches 4.5 : 1, black or white is used (at least 4.58 : 1).
    - *Switching:* in a session, a swipe mostly sideways of more than 50 px switches colors, right for night and left for day; the right and left arrow keys do the same. Faint chevrons halfway down each edge, like the Next arrow at the bottom, show the way and switch colors when tapped. The arrows are hints: the side arrows fade out once day and night have been switched, and the down arrow once the person has moved on to a next page, when the "Swipe up for the next page" text on the first page also stops showing. They stay out of sight in later sessions (two flags kept with the settings, not shown in Settings); the arrows remain buttons for screen readers, and show again when reached from the keyboard. A notice, "Night mode" or "Day mode", fades in and out over 1.6 s. The choice is kept as a setting (Settings, Screen and color, Night mode) for later sessions.
    - *Records:* each watched page notes whether it was shown at night, so the summary shows the colors that were seen. Learning still uses the pages as planned: their families and notes.
    - *Done screen:* a "Day and night" card explains both modes with their arcs, and Start a session sits at the bottom of the screen. The arc strip that was there is gone, since the card shows both arcs.
    - Research mode, the other half of milestone 7, is not built.
11. **iPhone app for the App Store.** The owner asked to put cobalt on the App Store. The same web app, built with base '/', runs in a native shell (Capacitor 8 with Swift Package Manager, `apps/web/ios`, bundle ID `com.acolorcompany.cobalt`). Its files are inside the app, so it works offline from the first launch and needs no service worker; updates come through the App Store.
    - *Scope:* iPhone only, iOS 17 or later (for the CSS and the audio session the web app uses), portrait, with the status bar hidden. The launch screen is the app's own background, light or dark, with no logo splash. The icon is the calm-arc mark at 1024 px, opaque, from `make-icons.mjs`.
    - *Native touches:* a small plugin (`ios/App/App/Cobalt.swift`) does what an app's web view cannot. While pages show, it keeps the screen on (the web's wake lock is not dependable there) and gives the bottom edge's first swipe to the feed, so a swipe up from the very bottom turns the page instead of leaving the app. The home indicator fades until the screen is touched (Capacitor's SystemBars, which also keeps the status bar hidden). It taps through the Taptic Engine where the web app would vibrate, which iPhones ignore on the web, and it offers the memory export through the share sheet (Save to Files), since the web view cannot download. Links such as acolorcompany.com open in Safari.
    - *Build and upload:* `.github/workflows/ios.yml` builds on GitHub's macOS runners, so no Mac is needed. It opens the app in the largest iPhone simulator, checks that the web app started and its storage opened, and takes screenshots, which it pushes to the `ios-ci` branch. Run by hand, it archives unsigned, signs on export with Apple's cloud-managed distribution certificate using an App Store Connect API key from the repository's secrets, and uploads to TestFlight. `docs/app-store.md` has the owner's steps and the listing.
    - *Name:* the App Store already has an app called "Cobalt", and store names are unique, so the listing needs a longer name such as "cobalt: calm color". The name under the icon stays "cobalt".
12. **The app's own address.** The owner asked for an address with the project's name instead of their GitHub username, so the app lives at https://cobalt.acolorcompany.com/. A CNAME record at the domain's DNS (Wix) points `cobalt` to `captrayw.github.io`, the repository's Pages settings carry the custom domain, and `pages.yml` reads the site's address from those settings (`actions/configure-pages`), so it builds for the root of the domain. GitHub forwards the old address to the new one. Memory stays with the address it was made at, so a copy added to the home screen from the old address has to be added again from the new one, and starts with no memory. The App Store listing's support and privacy pages are now at cobalt.acolorcompany.com.
13. **Sound at launch in the iPhone app, and "Tap for sound" on the web.** On the owner's iPhone, the website stayed silent until a tap. WebKit lets a page start sound only from a touch that does not move, so a swipe up does not count ([WebKit bug 248265](https://bugs.webkit.org/show_bug.cgi?id=248265), open since 2022), and no page can change that. The iPhone app's web view has no such rule (Capacitor sets `mediaTypesRequiringUserActionForPlayback` to none), so the app now opens its first session as if from a tap, and the sound starts at launch. On the web, until sound has played, a quiet "Tap for sound" shows in the middle of the page, like "Tap to resume", clear of the page details and the swipe-up hint. It stays past silent swipes, and never shows when a session started from a tap ("Start a session") or where the browser has no Web Audio. For the simulator run, the iPhone app logs `cobalt: sound at launch` with the audio state 3 s after it is ready.
14. **Page details on by default.** The owner asked for each page's note and color name to show from the start, so the Page details setting is now on by default. Settings are stored one at a time, and only once changed, so every copy where the switch was never touched, installed ones included, shows the details once it has this version; someone who turned them off keeps that choice.

## Milestone gates

| Milestone | Gate | Status |
|---|---|---|
| 1 Core | Golden-file, color, determinism, validity, uniqueness, invariant, scoring, memory, learning-effect and linger tests | All pass except golden files, which need the reference code (below). |
| 2 Audio | Audio render tests; listening check on an iPhone and an Android phone | Render tests pass. The listening check needs hardware and is not done. |
| 3 Feed | Scenarios 1, 2 and 5 to 9 in Chromium and WebKit | Pass. Scenario 5 runs as a unit test since owner change 4 removed the rhythm choice. Playwright's WebKit on Windows has no Web Audio, so there the feed runs on the silent engine; sound in Safari is left to the phone check. |
| 4 Learning in the app | Scenarios 3, 4 and 10 to 12; an exported file imports back unchanged | Pass. |
| 5 PWA release | Scenario 13; installs and runs offline; axe finds no serious issues; performance budgets | Pass in headless browsers; not yet installed on a physical phone. |

## Departures from the brief

1. **No reference code.** `gen-core.js`, `loop.js` and `color-pitch-calm.html` were not supplied, so the core was ported from the brief's text, and the golden-file equivalence test is skipped until they are added (`golden/README.md`). The port reproduces the brief's reported reference statistics:

   | Measure | Brief | Port |
   |---|---|---|
   | 5 to 10 s preset | always passes on the first draw; 111 to 128 pages, median 120; about 0.3 ms | passes; 112 to 127 pages, median 120; 0.31 ms. About 3 seeds in 100,000 need a second draw (pitchFalls between groups 1 and 2), consistent with none in the brief's 5,000. |
   | 12 to 24 s preset | 99% on the first draw, never more than two; 46 to 56 pages, median 50 | 99.0%; 46 to 55 pages, median 50. Two failed draws in a row happen about once in 10,000 seeds (one seed in the 10,000-seed test needs a third draw), consistent with none in the brief's 5,000. |
   | Sandbox, 300 viewers × 10 loops | remembered 15.8% vs fresh 8.5%; 18.9% from memory by loop 10; favorite family 13.9% to 17.1% | 15.3% vs 8.6%; 18.9%; 13.8% to 17.2% |

2. **Fading the previous page's tones on a page change** (`VOICE_RELEASE_TC`, 0.25 s). Not in the brief. Without it, quick swipes stack long tones and can sound louder than the first page, which the loudness rule forbids. *Superseded by owner change 2: one held voice crossfades from page to page.*

3. **A hidden page stops sounding after 3 minutes.** The brief keeps breaths and sound going while the page is hidden and keeps hidden time out of the idle clock, so a phone switched off mid-linger (or a background tab) would breathe and drone all night. After 3 minutes hidden, the master fades out (8 s time constant) and the breaths wait; when the page returns, sound comes back and the next breath follows 0.4 s later. This is not Rest: scenario 8 still holds (no rest, hidden time out of the dwell).

4. **Rest suspends the audio context** once the master has faded (8 time constants, 64 s), to save battery overnight. A tap, key or swipe resumes it.

5. **Audio after an interruption.** On an interruption the master fades too, so nothing hums under "Tap to resume" if the system brings audio back by itself; resuming restores it. Once the context has run, no voice is scheduled while it is stopped (its clock is frozen, so queued tones would all start at once later). A context that is not running in Showing or Lingering always leads to Paused, including after waking from Rest or a resume that fails or hangs for 2 s.

6. **The AudioEngine interface gained members** the feed and preview need: `voice` and `breath` (the held voice, owner change 2), `setVolume`, `releaseVoices`, `fadeDrones`, `sleep`, `state`, `onStateChange`, and an optional `closeAfterSec` on `close()`. The held voice, its breaths and the drones are scheduled only while the context runs; `tone` stays for the developer preview.

7. **New constants** in `packages/core/src/constants.ts` for values the brief leaves open: `VOICE` and `PACE_SLICING` (owner changes 2 and 3), `VOLUME_TC`, `FADE_TCS`, `DRONE_FADE_TCS`, `MIN_PAGE_SEC` (now enforced: a pace that could plan a page under 2 s is refused), `CHECKPOINT_EVERY`, `MEMORY_HEX_TOLERANCE`, `RETENTION` (50 sessions, 5 snapshots, 64 KB), and `FEED_UI` (controls stay bright 2.5 s after a touch, pointer moves count as activity every 250 ms, a tap moves under 10 px, a resume times out after 2 s, a refused wake lock is retried after 10 s).

8. **Remembered pages must still fit the arc to return** (`canReturn`): family and note in their group, hue in the family's band, lightness 0.60 to 0.80, chroma at most 0.12, a usable score, and a hex that matches. Pages the app stores always pass, so sessions are unchanged; an edited import cannot bring back an over-saturated or too-dark page.

9. **Audio jump test.** The brief's page tone and linger breath stay under 0.01 per sample. The loudest possible first tone (B4 at 0 dB) is a clean sine whose own slope is 0.0114 per sample at 48 kHz, so that case is checked against its slope with headroom instead.

10. **Performance** is measured in headless Chromium with the CPU slowed 4× (a Chromium performance trace is attached to each run), not on a physical mid-range Android phone. Generation peaks near 15 to 17 ms (budget 50). Page changes take about 7 to 8 ms (median), and nine in ten stay under 13 ms (budget 16), so the test asserts the 90th percentile rather than the single worst sample. Across 7 runs of 20 page changes, single samples reached 16 to 40 ms a few times and once 100 ms; the trace shows that change spent its time in the key handler's synchronous work (reducer, controller, audio scheduling), most likely engine warm-up or garbage collection, and it did not recur. The first change after loading is 15 to 40 ms while the engine warms up. The crossfade drops no frames. Starting a session takes longer (about 85 ms of main-thread work at full speed in the trace), mostly creating the AudioContext; it happens once, on the first touch in the feed.

## Hardening from two independent reviews

A compliance review (every rule in the brief) and a runtime bug hunt read the whole codebase. Items 3 to 5 and 8 above came from them, as did these:

- **App updates never interrupt a session.** A new version waits, and is applied (with a reload) only between sessions while the app is in the background, or when every window closes.
- **Saving on unload.** Memory and the session are written in one explicitly committed transaction, so the save can finish while the page unloads. On `pagehide` a checkpoint with the page on screen is written first.
- **Checkpoints** every 10 pages hold the finished pages only (the page just shown has no time yet); a checkpoint on hide or unload also records the page on screen so far. An open checkpoint carries its own time, so a recovered session is dated when it ran.
- **No double learning.** A checkpoint never reopens a finished session; a session still running in another tab (held by a Web Lock) is not recovered; an import leaves out open sessions; if a save fails, the app's memory goes back to what is stored.
- **Storage** reopens its connection if the browser drops it, keeps unreadable memory as a snapshot before replacing it, and Memory screen actions report failures plainly and cannot run twice at once.
- **Screen readers** hear "Resting" and "Paused" through a live region that is always present; the Done screen moves focus to its heading like the other screens.
- **Smaller fixes:** a swipe may start on the Next button; a refused wake lock is retried after a pause rather than on every input; settings changed in the first moments after launch are kept; the storage warning clears after the next good save; the Paused hint sits on the same 0.84 scrim as Rest; the hairline sits above the iPhone home indicator; the QA hook is exposed only in development or tests.

## Interpretations of open points

- A page's group, session progress and level come from its planned start time.
- The last page's note is fixed (D3), so it consumes no random draw.
- A typed seed is trimmed first; digits only are taken modulo 2^32 with exact integer arithmetic.
- "The first event in a gesture with a normalized deltaY above 12 px" means the first event in the gesture that exceeds 12 px.
- Carry-over: every remembered page gets its uniform draw before the room and presence checks; "interior pages" are pages with both neighbors (not the first or last page of the session); normal draws for the gamma sampler use Box-Muller.
- The sandbox draws, per page: the sleep chance (groups 6 and 7) first, then the linger draw, then the dwell.
- "End" in "presses End or Esc" is read as the End control, as the Inputs section says ("Esc or the End control"); the End key counts as activity.
- A page that becomes hidden while Resting keeps counting toward its dwell, since the person may be asleep with the screen off.
- With the "Use what I lingered on" switch off, sessions skip biasFrom and applyMemory but still learn.
- On the Summary screen, "Start next session" and "Done" are equal buttons.
- Reduced motion stops everything that slides and switches colors instantly; opacity fades (the dim layer, text fading in) stay, since they do not move.
- The End and Next controls are faint until touched, as the brief asks, so at rest they sit below the 3:1 contrast WCAG asks of controls; they brighten on touch, hover and focus, and every action has a key (↓, Esc) and a gesture.
- Memory over 64 KB is reported but still saved; the caps (80 pages, 30 loops) keep it near 25 KB.

## Not done

- Golden-file equivalence against the reference code (needs the reference files).
- The listening check on one iPhone and one Android phone, and the loudness calibration (`docs/calibration.md`).
- Installing on a physical phone, and a performance trace on a real mid-range Android device.
- Milestone 6, and research mode from milestone 7, pending the owner's approval. (Evening mode is built: owner change 10.)
