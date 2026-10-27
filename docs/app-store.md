# Putting cobalt on the App Store

cobalt's iPhone app is built: the app runs in a native iPhone shell (`apps/web/ios`). GitHub builds it on its Mac computers, so no Mac is needed. What is left needs your Apple account: steps 1 to 6 below set it up once, step 7 is a check on your own iPhone, and steps 8 and 9 send cobalt to Apple's review.

Costs: the Apple Developer Program is US$99 a year. GitHub's Mac builds are free for a public repository such as this one.

## 1. Join the Apple Developer Program

Start at [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll). You need an Apple ID with two-factor authentication. Apple may ask you to finish in the Apple Developer app on your iPhone, with a photo ID.

Choose how to enroll before you start:

- **As an individual:** the App Store shows your own legal name as the seller. This is the quicker route; approval often takes a day or two.
- **As an organization:** the App Store shows "A Color Company". This needs a registered business, a D-U-N-S number for it (free from Dun & Bradstreet, and it can take a week or more), a business website, and the authority to sign for the business.

If you will offer cobalt in the European Union, App Store Connect later asks whether you are a trader under the EU's Digital Services Act. A trader's address, phone number and email are shown on the EU App Store.

## 2. Register the app's ID

On [developer.apple.com/account](https://developer.apple.com/account), open **Certificates, IDs & Profiles → Identifiers**, click **+**, choose **App IDs** and then **App**. Enter:

- **Description:** cobalt
- **Bundle ID:** Explicit, `com.acolorcompany.cobalt`

Tick no capabilities, then **Continue → Register**.

## 3. Create the app in App Store Connect

On [appstoreconnect.apple.com](https://appstoreconnect.apple.com), open **Apps**, click **+** and choose **New App**:

- **Platforms:** iOS
- **Name:** cobalt by a color company. Every name on the App Store must be unique, and "Cobalt" is taken. The name under the icon on the phone stays "cobalt".
- **Primary language:** English (U.S.)
- **Bundle ID:** com.acolorcompany.cobalt
- **SKU:** cobalt-ios
- **User access:** Full Access

## 4. Make an App Store Connect key for GitHub

GitHub uses this key to sign the app and upload it.

1. In App Store Connect, open **Users and Access → Integrations → App Store Connect API**. The first time, the Account Holder clicks **Request Access**.
2. Under **Team Keys**, click **+** (Generate API Key). Name it **GitHub** and give it **Admin** access, which Apple's cloud signing needs.
3. Click **Download** next to the new key. The `.p8` file can be downloaded only once.
4. Note the **Key ID** (in the key's row) and the **Issuer ID** (above the list of keys).
5. Find your **Team ID** on [developer.apple.com/account](https://developer.apple.com/account), under **Membership details**.

## 5. Add four secrets to GitHub

On GitHub, open the repository's [**Settings → Secrets and variables → Actions**](https://github.com/captrayw/cobalt/settings/secrets/actions) and click **New repository secret** for each:

| Name | Value |
|---|---|
| `APPLE_TEAM_ID` | your Team ID |
| `ASC_KEY_ID` | the Key ID |
| `ASC_ISSUER_ID` | the Issuer ID |
| `ASC_PRIVATE_KEY` | everything in the `.p8` file: open it in Notepad and copy all of it, the BEGIN and END lines included |

GitHub never shows a secret again, it only lets you replace it. Keep the `.p8` file somewhere safe, and remove it from your Downloads folder.

## 6. Upload a build to TestFlight

On GitHub, open **Actions → iOS** and click **Run workflow**. Keep **Use workflow from** on `main`, tick **Upload to TestFlight**, and click **Run workflow**. It takes about 15 minutes. If a secret is missing, the run stops at once and names it.

App Store Connect then takes a few minutes to process the build. In App Store Connect, open the app, go to **TestFlight → Internal Testing**, create a group with **+**, and add yourself. On your iPhone, install **TestFlight** from the App Store and open the invitation. Every run uploads a new build, numbered by the run.

## 7. Check it on your iPhone

These parts can only be tried on a real iPhone:

- Sound starts as the app opens, and plays with the silent switch on.
- The screen stays on while pages show. On the rest screen it may sleep.
- A swipe up that starts at the very bottom edge turns the page. A second swipe there goes home.
- A swipe right brings night colors and a swipe left brings day; each side arrow fades after its first use.
- Switches in Settings give a light tap.
- **Memory → Export** opens the share sheet, and **Save to Files** keeps the file. **Import** reads it back.
- **About → acolorcompany.com** opens in Safari.

## 8. Fill in the listing

In App Store Connect, open the app. The left side has **App Information**, **Pricing and Availability**, **App Privacy** and the version, **1.0 Prepare for Submission**. The text below is ready to paste; change anything you like.

The text is lowercase and playful on purpose. Keep other apps' names, such as TikTok, out of every field: Apple's guideline 2.3.7 bars them from the subtitle and keywords.

**Name** (30 characters at most): cobalt by a color company

**Subtitle** (30): doomscrolling but make it calm

**Promotional text** (170; it can be changed at any time without a new review):

> for when your brain has 47 tabs open: swipe through full-screen color and soft sound. no ads, no account, no notifications.

**Description** (copy it from the box, so the line breaks stay):

```text
your thumb wants to scroll. your brain wants a break. cobalt gives you both.

it scrolls like the feeds you already know, except every page is one full-screen color with its own soft note, and the vibe gets calmer the longer you scroll. no ads. no account. no notifications. nothing to set up. you open it and it just starts.

how it works (pay attention, it's very hard)
swipe up for the next page. stay on one and it starts to breathe, each breath a little longer and softer. that's it. that's the whole tutorial.

not just vibes: actual research
every choice in cobalt comes from a color company's evidence-graded research into color, sound and how people respond to them: what studies of color and feeling show, how color and pitch connect, and which sounds actually calm people down. we kept what the evidence supports and skipped what it doesn't, like the "healing frequency" stuff.

so as you scroll, the colors soften and drift from warm to cool, the notes slide lower and quieter, and the pages slow into a breathing rhythm before landing on a low D. every color has its own note, and the sound glides from one to the next with no clicks or jumps.

night mode that gets it
late at night? swipe right: warm, dim pages with no blue, a little darker with every page. swipe left for day.

it remembers your faves
cobalt notices the pages you linger on and brings some of them back next time. see what it remembers, or wipe it, whenever you want.

your data stays on your phone. period.
no account, no sign-in, no tracking. what cobalt learns lives on your iPhone and never gets sent anywhere: the app makes zero network requests and works offline. new phone? export one file, import it there, done.

the research lives at acolorcompany.com. cobalt is a calm little app, not a medical one, and it makes no medical or therapeutic claims.
```

**Keywords** (100 characters, commas, no spaces; words in the name and subtitle need not be repeated):

```
scroll,swipe,feed,chill,vibes,aesthetic,cozy,ad-free,relax,unwind,soothing,sound,breathing,bedtime
```

**Screenshots:** the six JPEGs in [`docs/app-store/screenshots`](app-store/screenshots) are 1320 × 2868, the 6.9-inch iPhone size. Each puts a real screen of the app in an iPhone, under a caption, with callouts that point at what the screen shows. In App Store Connect, open **Distribution → Asset Library**, click **+**, choose **Previews and Screenshots** and the 6.9-inch iPhone size, and add them in order; App Store Connect scales them for smaller iPhones.

| # | Caption | The screen |
|---|---|---|
| 1 | doomscrolling but make it calm | a session's first page, with a swipe up |
| 2 | the whole tutorial | the first page, with each control labeled |
| 3 | late night? swipe right. | a night page, with the night palette |
| 4 | every color has its own note | a teal page's note and color, and the notes falling to a low D |
| 5 | it remembers your faves | a session's summary and the pages lingered on |
| 6 | your data stays on your phone | Memory, with "the receipt": no ads, accounts, notifications, streaks, trackers or network requests |

| Field | Value |
|---|---|
| Support URL | https://cobalt.acolorcompany.com/support.html (help, and info@acolorcompany.com for questions) |
| Marketing URL (optional) | https://acolorcompany.com/demo/ (the app's page on the website; the App Store links it as the developer's website) |
| Privacy Policy URL (App Information) | https://cobalt.acolorcompany.com/privacy.html |
| Copyright | 2026 A Color Company |
| Category (App Information) | Lifestyle |
| Content rights | No, it does not contain, show or access third-party content |
| Age rating | answer None or No to every question: 4+ |
| Price | Free |
| App Privacy | **Get Started → No, we do not collect data from this app** ("Data Not Collected") |
| Encryption | nothing to answer: the app declares that it uses no non-exempt encryption |

**App Review Information:** no sign-in is needed. Add a contact name, a phone number and your own work email for Apple's reviewer (they are not shown on the App Store; the public pages keep info@acolorcompany.com), and these notes:

> cobalt needs no account and has no sign-in. It opens straight into a session of full-screen colors and soft tones. Swipe up, or tap the arrow at the bottom, for the next page. Swipe right for night colors and left for day. The × at the top right ends the session and shows its summary. Sound starts as the app opens, so please turn the volume up. From Done for now, Memory shows what the app has learned and can export it through the share sheet. Everything is stored on the device; the app makes no network requests.

## 9. Submit for review

On the version page, under **Build**, choose the build from TestFlight. Click **Add for Review**, then **Submit to App Review**. Review usually takes a day or two, and Apple emails the result.

If Apple answers that cobalt is a website in an app (guideline 4.2, minimum functionality), reply in the message that comes with the decision: cobalt is not a website. Its colors and sound are generated on the device, it works offline from the first launch, and it uses the phone itself: the screen stays on during a session, the bottom edge's swipe stays in the feed, the Taptic Engine taps, and exports go through the share sheet.

## Updating the app later

Every push to `main` also republishes the support and privacy pages at cobalt.acolorcompany.com. For the App Store, raise the version in Xcode's project file (`MARKETING_VERSION` in `apps/web/ios/App/App.xcodeproj/project.pbxproj`, from 1.0 to 1.1), push, and run **Actions → iOS** with **Upload to TestFlight**. Then, in App Store Connect, add the new version with **+**, choose its build, say what changed, and submit it.

## How it works

- **The shell:** Capacitor 8 wraps the production web build, made with base `/` and copied into `apps/web/ios/App/App/public` by `pnpm --filter @calm/web ios:build`. The iPhone app needs no service worker. `capacitor.config.ts` holds the app's ID and name.
- **Native code:** `apps/web/ios/App/App/Cobalt.swift` holds the view controller and cobalt's plugin. The web side, `apps/web/src/platform/native.ts`, loads Capacitor only inside the app.
- **The workflow:** `.github/workflows/ios.yml` runs on every change to the app. It builds for the simulator, opens the app in the largest iPhone simulator in light and dark appearance, checks the log for the app's ready line and for errors, takes screenshots, and pushes them with the log to the `ios-ci` branch. Run by hand with **Upload to TestFlight**, it archives without signing, then signs during export with Apple's cloud-managed distribution certificate and uploads, so no certificate or profile is kept anywhere.
- **Screenshots:** `pnpm --filter @calm/web build && node apps/web/scripts/store-screenshots.mjs` takes the app's screens again from the production build in WebKit, with the iPhone's safe areas and fixed session seeds, and frames them. The captions, callouts and colors are in `apps/web/scripts/store-frames.mjs`; with `--frames`, the script only redraws the frames from the screens it took last time.
