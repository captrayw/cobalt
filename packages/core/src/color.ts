/** Color math. Every color decision is made in OKLCH; sRGB is only for display. */

export type Rgb = [number, number, number];
export type Lab = [number, number, number];

export interface Lch {
  L: number;
  C: number;
  h: number;
}

const GAMUT_EPS = 1e-4;

/** OKLCH to linear sRGB, through OKLab. */
export function oklchToLinear(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180,
    a = C * Math.cos(h),
    b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3,
    m = m_ ** 3,
    s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Inside sRGB: every linear channel within -0.0001 to 1.0001. */
export const inGamut = (rgb: readonly number[]): boolean => rgb.every((v) => v >= -GAMUT_EPS && v <= 1 + GAMUT_EPS);

/** Linear to sRGB transfer, clamped to 0..1. */
export const encode = (x: number): number => {
  x = Math.min(1, Math.max(0, x));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
};

/** sRGB to linear transfer. */
export const decode = (x: number): number => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);

/** Largest in-gamut chroma at this lightness and hue: 24 bisection steps. */
export function fitChroma(L: number, C: number, h: number): number {
  if (inGamut(oklchToLinear(L, C, h))) return C;
  let lo = 0,
    hi = C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear(L, mid, h))) lo = mid;
    else hi = mid;
  }
  return lo;
}

const hex2 = (v: number): string => Math.round(encode(v) * 255).toString(16).padStart(2, '0').toUpperCase();

/** Uppercase #RRGGBB for linear sRGB channels. */
export const linearToHex = (rgb: readonly number[]): string => '#' + rgb.map(hex2).join('');

/** Uppercase #RRGGBB for an OKLCH color. */
export const oklchToHex = (L: number, C: number, h: number): string => linearToHex(oklchToLinear(L, C, h));

/** 8-bit sRGB channels of #RRGGBB. */
export function hexToRgb8(hex: string): Rgb {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a #RRGGBB color: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

export const hexToLinear = (hex: string): Rgb => hexToRgb8(hex).map((v) => decode(v / 255)) as Rgb;

/** Linear sRGB to OKLab. */
export function linearToOklab([r, g, b]: readonly number[]): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklchToOklab(L: number, C: number, hDeg: number): Lab {
  const h = (hDeg * Math.PI) / 180;
  return [L, C * Math.cos(h), C * Math.sin(h)];
}

/** The inverse path: #RRGGBB to OKLCH, hue in degrees from 0 up to 360. */
export function hexToOklch(hex: string): Lch {
  const [L, a, b] = linearToOklab(hexToLinear(hex));
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

/** Euclidean distance in OKLab. */
export function okDist(p: Lch, q: Lch): number {
  const [L1, a1, b1] = oklchToOklab(p.L, p.C, p.h);
  const [L2, a2, b2] = oklchToOklab(q.L, q.C, q.h);
  return Math.hypot(L1 - L2, a1 - a2, b1 - b2);
}

/** WCAG relative luminance of #RRGGBB. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToLinear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #RRGGBB colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a),
    lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Distance around the hue wheel, 0 to 180 degrees. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Interpolate L, C and the shorter hue arc. t runs from 0 (from) to 1 (to). */
export function mixOklch(from: Lch, to: Lch, t: number): Lch {
  const u = Math.min(1, Math.max(0, t));
  let dh = (to.h - from.h) % 360;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  let h = from.h + dh * u;
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;
  return { L: from.L + (to.L - from.L) * u, C: from.C + (to.C - from.C) * u, h };
}
