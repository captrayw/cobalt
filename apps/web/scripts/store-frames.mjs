/**
 * The App Store frames: each of the app's screens in an iPhone 17 Pro Max, under a caption, with
 * callouts that point at what the screen shows and touch points that show the gestures. Laid out
 * in points on the 440 x 956 frame; store-screenshots.mjs renders them at 3x. The callouts are
 * stickers in the app's own style: a cream card, an ink outline and a small offset shadow.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fonts = join(here, '../node_modules/@fontsource');

const INK = '#121014';
const PAPER = '#fffcf6';
const NIGHT_INK = '#f6f1e7';

/** The phone: its left and top edge, its width, and the metal band and black border inside it. */
const PHONE = { x: 48, y: 206, w: 344, band: 3, bezel: 6 };
const EDGE = PHONE.band + PHONE.bezel;
/** Points on the frame per point on the phone's 440-point-wide screen. */
const SCALE = (PHONE.w - 2 * EDGE) / 440;
const SCREEN_H = 956 * SCALE;
const PHONE_H = SCREEN_H + 2 * EDGE;
/** The display's corner radius, 62 points on the phone. */
const RADIUS = 62 * SCALE + EDGE;

/** A point on the phone's screen, in frame points. */
const at = (x, y) => [PHONE.x + EDGE + x * SCALE, PHONE.y + EDGE + y * SCALE];
/** The middle of a measured element, or a point on one of its edges. */
const mid = (r, dx = 0.5, dy = 0.5) => at(r.x + r.w * dx, r.y + r.h * dy);

const ICONS = {
  up: '<path d="M9 14.5V4M4.5 8.5 9 4l4.5 4.5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
  moon: '<path d="M14.6 11.4A6.4 6.4 0 0 1 6.6 3.4a6.4 6.4 0 1 0 8 8z" fill="currentColor"/>',
  sun: '<circle cx="9" cy="9" r="3.2" fill="currentColor"/><path d="M9 1.8v2M9 14.2v2M1.8 9h2M14.2 9h2M3.9 3.9l1.4 1.4M12.7 12.7l1.4 1.4M3.9 14.1l1.4-1.4M12.7 5.3l1.4-1.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  note: '<path d="M7.2 13.6V4.2l7-1.6v9" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linejoin="round"/><circle cx="5.2" cy="13.6" r="2.3" fill="currentColor"/><circle cx="12.2" cy="11.6" r="2.3" fill="currentColor"/>',
  breathe: '<circle cx="9" cy="9" r="2.6" fill="currentColor"/><circle cx="9" cy="9" r="6.3" stroke="currentColor" stroke-width="1.6" fill="none" opacity=".65"/>',
  heart: '<path d="M9 15.2s-6-3.5-6-7.6a3.2 3.2 0 0 1 6-1.6 3.2 3.2 0 0 1 6 1.6c0 4.1-6 7.6-6 7.6z" fill="currentColor"/>',
  repeat: '<path d="M3.8 8.2A5.2 5.2 0 0 1 12.7 5l1.5 1.4M14.2 2.6v3.8h-3.8M14.2 9.8A5.2 5.2 0 0 1 5.3 13l-1.5-1.4M3.8 15.4v-3.8h3.8" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  sparkle: '<path d="M9 1.8l1.7 5.5 5.5 1.7-5.5 1.7L9 16.2l-1.7-5.5L1.8 9l5.5-1.7z" fill="currentColor"/>',
  phone: '<rect x="4.8" y="1.8" width="8.4" height="14.4" rx="2.2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M9 11.4V6M6.8 8.2 9 6l2.2 2.2" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
};
const icon = (name) => `<span class="ic"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">${ICONS[name]}</svg></span>`;

/**
 * A sticker. `x` or `right` and `y` place it on the frame; `w` lets its text wrap; `r` tilts it.
 * `k` is the small mono line above the text.
 */
function sticker({ x, right, y, w, r = 0, ic, k, t, body = '', mini = false }) {
  const place = `${x !== undefined ? `left:${x}px;` : ''}${right !== undefined ? `right:${right}px;` : ''}top:${y}px;`;
  const width = w ? `width:${w}px;white-space:normal;` : '';
  return `<div class="st${mini ? ' mini' : ''}" style="${place}${width}--r:${r}deg">${ic ? icon(ic) : ''}<span class="tx">${
    k ? `<span class="k">${k}</span>` : ''
  }${t ? `<span class="t">${t}</span>` : ''}${body}</span></div>`;
}

/** A line from a sticker to what it names, ending in a dot. Points are [x, y]; one bend at most. */
function leader(from, to, bend = [0, 0]) {
  const c = [(from[0] + to[0]) / 2 + bend[0], (from[1] + to[1]) / 2 + bend[1]];
  return `<path d="M${from} Q${c} ${to}" stroke="${INK}" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    <circle cx="${to[0]}" cy="${to[1]}" r="4.2" fill="${INK}" stroke="${PAPER}" stroke-width="2"/>`;
}

/** A fingertip on the screen and the fading streak of its swipe, from `from` to `to`. */
function touch(from, to) {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  return `<div class="trail" style="left:${x0}px;top:${y0 - 22}px;width:${len}px;transform:rotate(${angle}deg)"></div>
    <div class="touch" style="left:${x1}px;top:${y1}px"></div>`;
}

/** A marker stroke over words on the screen. */
const highlight = (rects) =>
  rects
    .map((r) => {
      const [x, y] = at(r.x - 3, r.y + 1);
      return `<div class="marker" style="left:${x}px;top:${y}px;width:${(r.w + 6) * SCALE}px;height:${(r.h - 1) * SCALE}px"></div>`;
    })
    .join('');

const swatches = (hexes) => `<span class="sw">${hexes.map((h) => `<i style="background:${h}"></i>`).join('')}</span>`;

/** A note from each of a session's seven groups, from A4 down to the low D3 it ends on, as a falling line. */
function fallingNotes() {
  const midi = [69, 66, 64, 62, 59, 57, 50];
  const w = 196;
  const h = 54;
  const pts = midi.map((m, i) => [10 + (i * (w - 20)) / (midi.length - 1), 6 + ((69 - m) / 19) * (h - 12)]);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return `<svg class="notes" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <path d="${path}" stroke="${INK}" stroke-width="1.6" fill="none" stroke-dasharray="2 4" stroke-linecap="round"/>
    ${pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === pts.length - 1 ? 5 : 3.4}" fill="${i === pts.length - 1 ? '#c4361f' : INK}"/>`).join('')}
    <text x="${pts[0][0]}" y="${pts[0][1] + 18}" text-anchor="middle">A4</text>
    <text x="${pts[6][0] - 14}" y="${pts[6][1] + 4}" text-anchor="end">low D3</text>
  </svg>`;
}

const receiptRow = ([label, value], cls = '') => `<span class="row${cls}"><span>${label}</span><b></b><span>${value}</span></span>`;
const receipt = (rows, total) => `<span class="rc">${rows.map((row) => receiptRow(row)).join('')}${receiptRow(total, ' total')}</span>`;

/**
 * The frames, in the order the App Store shows them. The background runs from warm to cool, as a
 * session does, with night in between. `screen` names a screen taken by store-screenshots.mjs.
 */
export const FRAMES = [
  {
    file: '1-scroll',
    screen: 'open',
    bg: (m) => m.open.page.hex,
    title: 'doomscrolling but make it calm',
    sub: 'no ads. no account. no notifications.',
    draw: () => ({
      over: touch(at(220, 580), at(220, 390)),
      stickers: [
        sticker({ x: 16, y: 300, w: 214, r: -3, ic: 'note', k: 'every page', t: 'one full-screen color + its own soft note' }),
        sticker({ right: 12, y: 690, r: 2.5, ic: 'sparkle', k: 'the longer you scroll', t: 'the calmer it gets' }),
      ],
    }),
  },
  {
    file: '2-tutorial',
    screen: 'controls',
    bg: (m) => m.controls.page.hex,
    title: 'the whole tutorial',
    sub: '(pay attention, it’s very hard)',
    draw: (m) => {
      const r = m.controls.rects;
      const end = mid(r.end);
      const night = mid(r.night);
      const day = mid(r.day);
      const next = mid(r.next);
      return {
        lines: [
          leader([266, 278], [end[0] - 12, end[1]], [0, -10]),
          leader([night[0] - 6, 526], [night[0], night[1] - 14], [-10, 0]),
          leader([day[0] + 8, 614], [day[0], day[1] + 14], [-10, 0]),
          leader([268, 884], [next[0] + 16, next[1]], [0, 8]),
        ],
        stickers: [
          sticker({ x: 66, y: 254, r: -2, ic: 'close', k: 'tap ×', t: 'end + see your session' }),
          sticker({ right: 14, y: 474, r: 2, ic: 'moon', k: 'swipe right', t: 'night colors' }),
          sticker({ x: 14, y: 612, r: -2, ic: 'sun', k: 'swipe left', t: 'day colors' }),
          sticker({ x: 112, y: 386, r: 1.5, ic: 'breathe', k: 'or just stay', t: 'it starts to breathe' }),
          sticker({ x: 268, y: 858, r: -1.5, ic: 'up', k: 'swipe up', t: 'next page' }),
        ],
      };
    },
  },
  {
    file: '3-night',
    screen: 'night',
    night: true,
    bg: () => '#16110d',
    glow: 'rgb(90 113 58 / 0.5)',
    title: 'late night? swipe right.',
    sub: 'warm, dim pages with no blue.',
    draw: (m) => ({
      over: touch(at(130, 540), at(320, 540)),
      stickers: [
        sticker({ x: 14, y: 656, r: -2.5, k: 'the night palette', t: 'a little darker every page', body: swatches(m.palettes.night) }),
        sticker({ right: 12, y: 416, r: 2.5, ic: 'sun', k: 'swipe left', t: 'back to day' }),
      ],
    }),
  },
  {
    file: '4-notes',
    screen: 'teal',
    bg: (m) => m.teal.page.hex,
    title: 'every color has its own note',
    sub: 'and the sound glides from one to the next. no clicks, no jumps.',
    draw: (m) => {
      const r = m.teal.rects;
      return {
        lines: [leader([150, 752], mid(r.note, -0.35, 0.5), [6, 10]), leader([296, 872], mid(r.name, 1.4, 0.5), [-6, 10])],
        stickers: [
          sticker({ x: 76, y: 330, r: -2, k: 'as you scroll', t: 'the notes slide lower + softer, then land on a low D', w: 224, body: fallingNotes() }),
          sticker({ x: 22, y: 730, r: -3, mini: true, ic: 'note', t: 'its note' }),
          sticker({ x: 296, y: 852, r: 2.5, mini: true, t: 'its color' }),
        ],
      };
    },
  },
  {
    file: '5-faves',
    screen: 'summary',
    bg: (m) => m.palettes.day[4],
    title: 'it remembers your faves',
    sub: 'stay on a page and cobalt brings some back next time.',
    draw: (m) => {
      const tiles = m.summary.rects.tiles;
      const [tx, ty] = at(tiles.x + tiles.w, tiles.y);
      return {
        stickers: [
          sticker({ x: tx - 92, y: ty - 20, r: 7, mini: true, ic: 'heart', t: 'your faves' }),
          sticker({ x: 34, y: 700, r: -2.5, ic: 'repeat', k: 'next session', t: 'some of them come back' }),
        ],
      };
    },
  },
  {
    file: '6-data',
    screen: 'memory',
    bg: (m) => m.palettes.day[5],
    title: 'your data stays on your phone',
    sub: 'period. no sign-in, no tracking, works offline.',
    draw: (m) => ({
      under: highlight(m.memory.stays),
      stickers: [
        sticker({
          x: 50,
          y: 568,
          r: -1.5,
          k: 'the receipt',
          body:
            receipt(
              [
                ['ads', '0'],
                ['accounts', '0'],
                ['notifications', '0'],
                ['streaks', '0'],
                ['trackers', '0'],
                ['network requests', '0'],
              ],
              ['data collected', 'none'],
            ) + `<span class="foot">${icon('phone')}<span><span class="k">new phone?</span><span class="t">export one file, import it there. done.</span></span></span>`,
        }),
      ],
    }),
  },
];

const fontFace = (family, pkg, weight) =>
  `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url(data:font/woff2;base64,${readFileSync(
    join(fonts, pkg, 'files', `${pkg}-latin-${weight}-normal.woff2`),
  ).toString('base64')}) format('woff2'); }`;

let fontCss;

/** The whole page for one frame. `screens` is the folder of screens and their measurements. */
export function frameHtml(frame, meta, screens) {
  fontCss ??= [
    fontFace('Bricolage Grotesque', 'bricolage-grotesque', 800),
    fontFace('Instrument Sans', 'instrument-sans', 500),
    fontFace('Instrument Sans', 'instrument-sans', 600),
    fontFace('Space Mono', 'space-mono', 400),
    fontFace('Space Mono', 'space-mono', 700),
  ].join('\n');
  const shot = readFileSync(join(screens, `${frame.screen}.png`)).toString('base64');
  const drawn = frame.draw(meta);
  const fg = frame.night ? NIGHT_INK : INK;
  const bg = frame.bg(meta);
  const [ix, iy] = [PHONE.w / 2, EDGE + 14 * SCALE];

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  position: relative; width: 440px; height: 956px; overflow: hidden; color: ${fg};
  background: ${
    frame.night
      ? `radial-gradient(70% 46% at 50% 64%, ${frame.glow}, transparent 72%), ${bg}`
      : `linear-gradient(180deg, color-mix(in oklab, ${bg} 62%, white) 0%, color-mix(in oklab, ${bg} 88%, white) 34%, ${bg} 78%)`
  };
  font-family: 'Instrument Sans', sans-serif; -webkit-font-smoothing: antialiased;
}
.head {
  position: absolute; left: 20px; right: 20px; top: 0; height: ${PHONE.y}px; padding-top: 4px;
  display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;
}
.head h1 { margin: 0; font: 800 41px/0.98 'Bricolage Grotesque', sans-serif; letter-spacing: -0.035em; text-wrap: balance; }
.head p { margin: 12px 0 0; max-width: 350px; font: 500 16px/1.3 'Instrument Sans', sans-serif; opacity: 0.84; text-wrap: balance; }

.phone {
  position: absolute; left: ${PHONE.x}px; top: ${PHONE.y}px; width: ${PHONE.w}px; height: ${PHONE_H}px; border-radius: ${RADIUS}px;
  background: linear-gradient(135deg, #64636a 0%, #2d2c31 18%, #1b1a1e 50%, #2d2c31 82%, #5e5d63 100%);
  box-shadow: 0 0 0 0.6px rgb(0 0 0 / 0.6), 0 34px 60px -22px rgb(0 0 0 / ${frame.night ? 0.8 : 0.45}), 0 14px 28px -12px rgb(0 0 0 / 0.3);
}
.phone::after { content: ''; position: absolute; inset: 0.8px; border-radius: ${RADIUS - 0.8}px; box-shadow: inset 0 0 0 0.9px rgb(255 255 255 / 0.18); pointer-events: none; }
.bezel { position: absolute; inset: ${PHONE.band}px; border-radius: ${RADIUS - PHONE.band}px; background: #050506; }
.screen { position: absolute; inset: ${EDGE}px; border-radius: ${RADIUS - EDGE}px; overflow: hidden; background: #000; }
.screen img { display: block; width: 100%; height: 100%; }
.island { position: absolute; left: ${ix - (125 * SCALE) / 2}px; top: ${iy}px; width: ${125 * SCALE}px; height: ${36 * SCALE}px; border-radius: 999px; background: #000; }
.key { position: absolute; width: 3px; border-radius: 1.5px; background: linear-gradient(90deg, #3c3b41, #57565c); }
.key.l { left: -2.4px; } .key.r { right: -2.4px; background: linear-gradient(90deg, #57565c, #3c3b41); }

.marker { position: absolute; background: #ffd23f; mix-blend-mode: multiply; border-radius: 2px; transform: rotate(-0.6deg); opacity: 0.85; }
svg.lines { position: absolute; inset: 0; width: 440px; height: 956px; overflow: visible; }

.trail {
  position: absolute; height: 44px; transform-origin: 0 50%;
  background: linear-gradient(90deg, rgb(255 255 255 / 0), rgb(255 255 255 / 0.5));
  clip-path: polygon(0 40%, 100% 4%, 100% 96%, 0 60%);
}
.touch {
  position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
  background: #fffdf8;
  box-shadow: 0 0 0 7px rgb(255 255 255 / 0.3), 0 10px 22px rgb(0 0 0 / 0.22);
}

.st {
  position: absolute; display: flex; align-items: center; gap: 10px; padding: 9px 14px 10px 10px;
  background: ${PAPER}; color: ${INK}; border: 1.5px solid ${INK}; border-radius: 16px; box-shadow: 3px 3px 0 ${INK};
  transform: rotate(var(--r)); white-space: nowrap;
}
.st:not(:has(.ic)) { padding-left: 14px; }
.st .ic { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: ${INK}; color: ${PAPER}; }
.st .tx { display: flex; flex-direction: column; min-width: 0; }
.st .k { font: 700 10px/1.15 'Space Mono', monospace; letter-spacing: 0.1em; text-transform: uppercase; color: #6b6470; margin-bottom: 3px; }
.st .t { font: 600 15px/1.2 'Instrument Sans', sans-serif; letter-spacing: -0.005em; }
.st.mini { padding: 6px 12px 7px 7px; border-radius: 999px; gap: 7px; }
.st.mini:not(:has(.ic)) { padding-left: 12px; }
.st.mini .ic { width: 24px; height: 24px; }
.st.mini .ic svg { width: 14px; height: 14px; }
.st.mini .t { font-size: 14px; }
.sw { display: flex; gap: 4px; margin-top: 8px; }
.sw i { width: 24px; height: 30px; border-radius: 6px; box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12); }
svg.notes { display: block; margin-top: 6px; overflow: visible; }
svg.notes text { font: 700 10px 'Space Mono', monospace; fill: #6b6470; }
.rc { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; width: 300px; font: 400 14px/1.35 'Space Mono', monospace; }
.rc .row { display: flex; align-items: baseline; gap: 6px; }
.rc .row b { flex: 1; border-bottom: 1.5px dotted rgb(18 16 20 / 0.45); transform: translateY(-3px); }
.rc .row span:last-child { font-weight: 700; color: #c4361f; }
.rc .total { margin-top: 5px; padding-top: 9px; border-top: 1.5px dashed rgb(18 16 20 / 0.55); font-weight: 700; }
.st .foot { display: flex; align-items: center; gap: 10px; margin-top: 18px; padding: 15px 0 4px; border-top: 1.5px solid rgb(18 16 20 / 0.14); white-space: normal; }
.st .foot > span:last-child { display: flex; flex-direction: column; }
</style></head><body>
<div class="head"><h1>${frame.title}</h1><p>${frame.sub}</p></div>
<div class="phone">
  <span class="key l" style="top:${PHONE_H * 0.19}px;height:${PHONE_H * 0.045}px"></span>
  <span class="key l" style="top:${PHONE_H * 0.265}px;height:${PHONE_H * 0.085}px"></span>
  <span class="key l" style="top:${PHONE_H * 0.365}px;height:${PHONE_H * 0.085}px"></span>
  <span class="key r" style="top:${PHONE_H * 0.28}px;height:${PHONE_H * 0.13}px"></span>
  <span class="key r" style="top:${PHONE_H * 0.58}px;height:${PHONE_H * 0.075}px;opacity:.7"></span>
  <div class="bezel"></div>
  <div class="screen"><img src="data:image/png;base64,${shot}" alt=""></div>
  <div class="island"></div>
</div>
${drawn.under ?? ''}
${drawn.over ?? ''}
<svg class="lines" viewBox="0 0 440 956">${(drawn.lines ?? []).join('')}</svg>
${(drawn.stickers ?? []).join('')}
</body></html>`;
}
