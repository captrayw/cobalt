import { contrastRatio, fitChroma, hexToOklch, oklchToHex, oklchToLinear, type Lch } from './color.ts';
import { EVENING, EVENING_TUNING, GROUP_COUNT, LIGHT_PAGE_INK, MIN_INK_CONTRAST, PAGE_INK, SESSION_SEC } from './constants.ts';
import { FAMILY_BY_ID } from './model.ts';
import type { Page } from './types.ts';

/**
 * Owner change (Oct 2026): night colors for the feed (Evening mode). Each page shows its group's
 * evening color, shifted a few degrees by where its day color sits in its family, and dimmed to one
 * luminance curve for the whole session. The curve never rises, so no page is brighter than the one
 * before it. Dimming scales the light itself (linear RGB), which keeps the hue and scales OKLab
 * lightness and chroma by its cube root. Pure and deterministic, like the rest of the core.
 */

export interface EveningColor extends Lch {
  hex: string;
  /** The color's name, shown with page details. */
  name: string;
  /** Relative luminance, 0 to 1. */
  Y: number;
}

const luminance = ([r, g, b]: readonly number[]): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Signed hue difference a − b, in (−180, 180]. */
function hueDelta(a: number, b: number): number {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

/** A group's evening color with its hue shifted by `shift` (−1 to 1 of the spread), before dimming. */
function shiftedStep(group: number, shift: number): Lch & { y: number } {
  const base = hexToOklch(EVENING[group].hex);
  const h = (base.h + EVENING_TUNING.hueSpreadDeg * shift + 360) % 360;
  const C = fitChroma(base.L, base.C, h);
  return { L: base.L, C, h, y: luminance(oklchToLinear(base.L, C, h)) };
}

/**
 * Each group's target luminance: its color at the prototype's intensity, measured at its darkest
 * hue shift (so dimming never has to brighten a color), and never above the group before.
 */
const GROUP_Y: readonly number[] = (() => {
  let floor = Number.POSITIVE_INFINITY;
  return EVENING.map((step, g) => {
    let darkest = Number.POSITIVE_INFINITY;
    for (let s = -1; s <= 1.0001; s += 1 / 12) darkest = Math.min(darkest, shiftedStep(g, s).y);
    floor = Math.min(floor, darkest * step.intensity);
    return floor;
  });
})();

/** Target luminance at session progress `tn` (0 to 1): geometric steps between group centers, never rising. */
export function eveningLuminance(tn: number): number {
  const x = Math.min(1, Math.max(0, tn)) * GROUP_COUNT - 0.5;
  if (x <= 0) return GROUP_Y[0];
  if (x >= GROUP_COUNT - 1) return GROUP_Y[GROUP_COUNT - 1];
  const g = Math.floor(x),
    f = x - g;
  return GROUP_Y[g] ** (1 - f) * GROUP_Y[g + 1] ** f;
}

/** A page's night color. Pages without a family (the previews) take the group color unshifted. */
export function eveningColor(page: Pick<Page, 'phase' | 'start'> & Partial<Pick<Page, 'cat' | 'h'>>): EveningColor {
  const group = Math.min(GROUP_COUNT, Math.max(1, page.phase)) - 1;
  let shift = 0;
  const band = page.cat ? FAMILY_BY_ID[page.cat]?.band : undefined;
  if (band && page.h !== undefined) {
    const half = (band[1] - band[0]) / 2;
    if (half > 0) shift = Math.min(1, Math.max(-1, hueDelta(page.h, band[0] + half) / half));
  }
  const step = shiftedStep(group, shift);
  const k = eveningLuminance(page.start / SESSION_SEC) / step.y;
  const s = Math.cbrt(k);
  const L = step.L * s,
    C = step.C * s;
  return { L, C, h: step.h, hex: oklchToHex(L, C, step.h), name: EVENING[group].name, Y: step.y * k };
}

/** The night arc at a glance: each group's color at its center, for previews. */
export const eveningArc = (): EveningColor[] =>
  EVENING.map((_, g) => eveningColor({ phase: g + 1, start: ((g + 0.5) / GROUP_COUNT) * SESSION_SEC }));

/**
 * Text color for a page: the usual page ink where it keeps MIN_INK_CONTRAST, else the light ink.
 * In the middle of the night curve neither reaches 4.5 : 1, but black or white always does (at
 * least 4.58 : 1), so the better of those two is used there.
 */
export function readableInk(hex: string): string {
  if (contrastRatio(hex, PAGE_INK) >= MIN_INK_CONTRAST) return PAGE_INK;
  if (contrastRatio(hex, LIGHT_PAGE_INK) >= MIN_INK_CONTRAST) return LIGHT_PAGE_INK;
  return contrastRatio(hex, '#000000') >= contrastRatio(hex, '#FFFFFF') ? '#000000' : '#FFFFFF';
}

/** True when a hue falls in the blue-and-cyan range night colors leave out. */
export const isBlueOrCyan = (h: number): boolean => h >= EVENING_TUNING.blueCyanDeg[0] && h <= EVENING_TUNING.blueCyanDeg[1];

export interface EveningCheck {
  /** No page's night color is blue or cyan. */
  noBlueOrCyan: boolean;
  /** No page is brighter than the page before it. */
  neverBrighter: boolean;
  pass: boolean;
}

/** Evening mode's own checks, over a session's pages in order. Its sound is checked by `validate`. */
export function validateEvening(items: readonly Page[]): EveningCheck {
  const colors = items.map(eveningColor);
  const noBlueOrCyan = colors.every((c) => !isBlueOrCyan(c.h));
  const neverBrighter = colors.every((c, i) => i === 0 || c.Y <= colors[i - 1].Y * (1 + 1e-9));
  return { noBlueOrCyan, neverBrighter, pass: noBlueOrCyan && neverBrighter };
}
