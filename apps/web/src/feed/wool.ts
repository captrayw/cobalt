/**
 * The wool texture under the feed's colors: the website demo's impasto filter, worked out in script
 * so each page can have its own. Fractal noise stretched sideways into fibres (base frequency
 * 0.03 x 0.11 per CSS px, three octaves, as SVG's feTurbulence computes it) is lit from the upper
 * left (feDiffuseLighting: azimuth 235°, elevation 58°) and warped by the same noise
 * (feDisplacementMap, 6 CSS px), as the demo's filter does. The page color is then multiplied by
 * 1.16 x the light, so flat wool keeps about 98% of the color, creases shade it and ridges catch a
 * little light. From page to page the noise drifts from one seed toward the next, so the creases
 * shift a little with every scroll.
 */

const BSIZE = 0x100;
const BM = 0xff;
const PERLIN_N = 0x1000;
const RAND_M = 2147483647;
const RAND_A = 16807;
const RAND_Q = 127773;
const RAND_R = 2836;

export const WOOL = {
  /** Noise frequency per CSS px, across and down: long fibres lying sideways. */
  freqX: 0.03,
  freqY: 0.11,
  octaves: 3,
  /** feDiffuseLighting's surfaceScale, per CSS px. */
  relief: 1.6,
  azimuthDeg: 235,
  elevationDeg: 58,
  /** feDisplacementMap's scale in CSS px: how far the fibres wander. */
  wander: 6,
  /** The demo's arithmetic composite, 1.16 x color x light. */
  gain: 1.16,
  /** How far the noise drifts toward the next seed with each page. */
  driftPerPage: 0.25,
} as const;

/** feTurbulence's lattice for one seed: its permutation and the gradients of red, green and alpha. */
export interface Lattice {
  selector: Int32Array;
  /** Per channel (red, green, alpha), x and y of each gradient. */
  gradients: [Float64Array, Float64Array, Float64Array];
}

/** One seed's noise over a texture, 0 to 255 as a filter keeps it: red and green steer the warp, alpha is the surface. */
export interface NoiseField {
  r: Uint8ClampedArray;
  g: Uint8ClampedArray;
  a: Uint8ClampedArray;
}

function setupSeed(seed: number): number {
  let s = Math.round(seed);
  if (s <= 0) s = -(s % (RAND_M - 1)) + 1;
  if (s > RAND_M - 1) s = RAND_M - 1;
  return s;
}

function random(seed: number): number {
  const r = RAND_A * (seed % RAND_Q) - RAND_R * Math.trunc(seed / RAND_Q);
  return r <= 0 ? r + RAND_M : r;
}

/** The SVG specification's init(): gradients for the four channels in turn (blue is not kept), then the shuffle. */
export function lattice(seed: number): Lattice {
  let s = setupSeed(seed);
  const selector = new Int32Array(BSIZE + BSIZE + 2);
  const kept = [0, 1, 3];
  const gradients = kept.map(() => new Float64Array((BSIZE + BSIZE + 2) * 2)) as Lattice['gradients'];
  for (let k = 0; k < 4; k++) {
    const into = gradients[kept.indexOf(k)];
    for (let i = 0; i < BSIZE; i++) {
      selector[i] = i;
      s = random(s);
      const gx = ((s % (BSIZE + BSIZE)) - BSIZE) / BSIZE;
      s = random(s);
      const gy = ((s % (BSIZE + BSIZE)) - BSIZE) / BSIZE;
      if (into) {
        const length = Math.hypot(gx, gy) || 1;
        into[i * 2] = gx / length;
        into[i * 2 + 1] = gy / length;
      }
    }
  }
  for (let i = BSIZE - 1; i > 0; i--) {
    const k = selector[i];
    s = random(s);
    const j = s % BSIZE;
    selector[i] = selector[j];
    selector[j] = k;
  }
  for (let i = 0; i < BSIZE + 2; i++) {
    selector[BSIZE + i] = selector[i];
    for (const g of gradients) {
      g[(BSIZE + i) * 2] = g[i * 2];
      g[(BSIZE + i) * 2 + 1] = g[i * 2 + 1];
    }
  }
  return { selector, gradients };
}

function noise2(sel: Int32Array, g: Float64Array, x: number, y: number): number {
  let t = x + PERLIN_N;
  const bx0 = Math.trunc(t) & BM;
  const bx1 = (bx0 + 1) & BM;
  const rx0 = t - Math.trunc(t);
  const rx1 = rx0 - 1;
  t = y + PERLIN_N;
  const by0 = Math.trunc(t) & BM;
  const by1 = (by0 + 1) & BM;
  const ry0 = t - Math.trunc(t);
  const ry1 = ry0 - 1;
  const i = sel[bx0];
  const j = sel[bx1];
  const b00 = sel[i + by0] * 2;
  const b10 = sel[j + by0] * 2;
  const b01 = sel[i + by1] * 2;
  const b11 = sel[j + by1] * 2;
  const sx = rx0 * rx0 * (3 - 2 * rx0);
  const sy = ry0 * ry0 * (3 - 2 * ry0);
  let u = rx0 * g[b00] + ry0 * g[b00 + 1];
  let v = rx1 * g[b10] + ry0 * g[b10 + 1];
  const a = u + sx * (v - u);
  u = rx0 * g[b01] + ry1 * g[b01 + 1];
  v = rx1 * g[b11] + ry1 * g[b11 + 1];
  const b = u + sx * (v - u);
  return a + sy * (b - a);
}

/** feTurbulence type="fractalNoise" for one channel at a point in CSS px: 0 to 1. */
export function fractal(l: Lattice, channel: 0 | 1 | 2, x: number, y: number): number {
  const g = l.gradients[channel];
  let sum = 0;
  let ratio = 1;
  let vx = x * WOOL.freqX;
  let vy = y * WOOL.freqY;
  for (let octave = 0; octave < WOOL.octaves; octave++) {
    sum += noise2(l.selector, g, vx, vy) / ratio;
    vx *= 2;
    vy *= 2;
    ratio *= 2;
  }
  return Math.min(1, Math.max(0, (sum + 1) / 2));
}

/** One seed's noise over a width x height texture, `scale` texels per CSS px. */
export function noiseField(seed: number, width: number, height: number, scale: number): NoiseField {
  const l = lattice(seed);
  const size = width * height;
  const field: NoiseField = { r: new Uint8ClampedArray(size), g: new Uint8ClampedArray(size), a: new Uint8ClampedArray(size) };
  for (let y = 0; y < height; y++) {
    const cy = (y + 0.5) / scale;
    for (let x = 0; x < width; x++) {
      const cx = (x + 0.5) / scale;
      const i = y * width + x;
      field.r[i] = fractal(l, 0, cx, cy) * 255;
      field.g[i] = fractal(l, 1, cx, cy) * 255;
      field.a[i] = fractal(l, 2, cx, cy) * 255;
    }
  }
  return field;
}

/**
 * The wool between seed fields a (mix 0) and b (mix 1), as RGBA gray for mix-blend-mode: hard-light.
 * Hard-light multiplies by twice the gray up to mid-gray and screens above it, so a gray of half the
 * light factor shades exactly as the demo's 1.16 x color x light and lets the ridges brighten a little.
 * The drift keeps the noise's contrast: the two fields turn about their mean, a quarter turn in all.
 */
export function woolPixels(a: NoiseField, b: NoiseField, mix: number, width: number, height: number, scale: number): Uint8ClampedArray<ArrayBuffer> {
  const turn = (Math.min(1, Math.max(0, mix)) * Math.PI) / 2;
  // The fields hold 0 to 255; their deviations from the mean, turned by the drift.
  const ca = Math.cos(turn) / 255;
  const cb = Math.sin(turn) / 255;
  const centre = 0.5 - 127.5 * (ca + cb);

  // The drifted surface, with a border of one texel copied from the edge, so the slopes need no clamping.
  const pw = width + 2;
  const surface = new Float32Array(pw * (height + 2));
  for (let y = 0; y < height + 2; y++) {
    const row = Math.min(height - 1, Math.max(0, y - 1)) * width;
    for (let x = 0; x < pw; x++) {
      const i = row + Math.min(width - 1, Math.max(0, x - 1));
      surface[y * pw + x] = centre + a.a[i] * ca + b.a[i] * cb;
    }
  }

  const az = (WOOL.azimuthDeg * Math.PI) / 180;
  const el = (WOOL.elevationDeg * Math.PI) / 180;
  const lx = Math.cos(az) * Math.cos(el);
  const ly = Math.sin(az) * Math.cos(el);
  const lz = Math.sin(el);
  // feDiffuseLighting's Sobel slopes, per texel; the relief is per CSS px.
  const k = (WOOL.relief * scale) / 4;
  const light = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const up = y * pw;
    const mid = up + pw;
    const down = mid + pw;
    for (let x = 0; x < width; x++) {
      const nx = -k * (surface[up + x + 2] + 2 * surface[mid + x + 2] + surface[down + x + 2] - (surface[up + x] + 2 * surface[mid + x] + surface[down + x]));
      const ny = -k * (surface[down + x] + 2 * surface[down + x + 1] + surface[down + x + 2] - (surface[up + x] + 2 * surface[up + x + 1] + surface[up + x + 2]));
      const lit = (nx * lx + ny * ly + lz) / Math.sqrt(nx * nx + ny * ny + 1);
      light[y * width + x] = lit > 0 ? WOOL.gain * lit : 0;
    }
  }

  // The warp: each texel shows the light from up to half the wander away, steered by red and green.
  const reach = WOOL.wander * scale;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const dx = reach * (centre - 0.5 + a.r[i] * ca + b.r[i] * cb);
      const dy = reach * (centre - 0.5 + a.g[i] * ca + b.g[i] * cb);
      const sx = Math.min(width - 1, Math.max(0, x + dx));
      const sy = Math.min(height - 1, Math.max(0, y + dy));
      const x0 = sx | 0;
      const y0 = sy | 0;
      const x1 = x0 + 1 < width ? x0 + 1 : x0;
      const r0 = y0 * width;
      const r1 = (y0 + 1 < height ? y0 + 1 : y0) * width;
      const fx = sx - x0;
      const fy = sy - y0;
      const top = light[r0 + x0] + (light[r0 + x1] - light[r0 + x0]) * fx;
      const bottom = light[r1 + x0] + (light[r1 + x1] - light[r1 + x0]) * fx;
      const v = ((top + (bottom - top) * fy) / 2) * 255;
      const o = i * 4;
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Page index to the two seeds its noise lies between, and how far along: drift per page from `base`. */
export function woolStep(base: number, index: number): { seedA: number; seedB: number; mix: number } {
  const position = Math.max(0, index) * WOOL.driftPerPage;
  const pair = Math.floor(position);
  return { seedA: base + pair, seedB: base + pair + 1, mix: position - pair };
}
