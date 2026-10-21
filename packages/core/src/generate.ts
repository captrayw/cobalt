import { fitChroma, hueDistance, oklchToHex } from './color.ts';
import {
  ADJACENCY,
  CHROMA,
  CROSSFADE,
  GROUP_COUNT,
  GROUP_SEC,
  LEVEL_END_DB,
  LIGHTNESS,
  MAX_DRAWS,
  MELODY,
  NOTE_CHOICE,
  SESSION_SEC,
  TWO_BACK_DAMPING,
} from './constants.ts';
import { FAMILY_BY_ID, FAMILY_INDEX, GROUPS, midiToHz, noteName } from './model.ts';
import { mulberry32, type Rng } from './rng.ts';
import type { Bias, CatId, Page, Session } from './types.ts';
import { validate } from './validate.ts';

export interface GenerateOptions {
  seed: number;
  minDwell: number;
  maxDwell: number;
  /** Learned family and note multipliers from biasFrom, or none. */
  bias?: Bias | null;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Base lightness at session progress tn: linear between group base values placed at group centers. */
export function baseL(tn: number): number {
  const x = GROUP_COUNT * tn - 0.5;
  if (x <= 0) return GROUPS[0].baseL;
  if (x >= GROUP_COUNT - 1) return GROUPS[GROUP_COUNT - 1].baseL;
  const i = Math.floor(x);
  return GROUPS[i].baseL + (GROUPS[i + 1].baseL - GROUPS[i].baseL) * (x - i);
}

/** Draw an index in proportion to its weight. The caller guarantees a positive total. */
function drawIndex(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let x = rng() * total,
    last = -1;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue;
    last = i;
    x -= weights[i];
    if (x < 0) return i;
  }
  return last;
}

/** The pool note nearest to prev, breaking a tie toward the higher note. */
function nearestNote(pool: readonly number[], prev: number): number {
  let best = pool[0];
  for (const m of pool) {
    const d = Math.abs(m - prev),
      bestD = Math.abs(best - prev);
    if (d < bestD || (d === bestD && m > best)) best = m;
  }
  return best;
}

/**
 * One draw of a session. Random draws per page, in this order: dwell, hue family, hue 1, hue 2,
 * lightness jitter, chroma jitter, note. Golden-file tests depend on that order.
 */
export function generate(opts: GenerateOptions): Page[] {
  const { minDwell, maxDwell, bias } = opts;
  const rng = mulberry32(opts.seed);
  const items: Page[] = [];
  let t = 0;
  let prev: Page | null = null;
  let catTwoBack: CatId | null = null;
  let midiTwoBack: number | null = null;

  for (;;) {
    // Timing: a page absorbs the remainder when less than half of minDwell would be left after it.
    let dwell = minDwell + (maxDwell - minDwell) * rng();
    const last = SESSION_SEC - (t + dwell) < minDwell / 2;
    if (last) dwell = SESSION_SEC - t;
    const tn = t / SESSION_SEC;
    const gi = Math.min(GROUP_COUNT - 1, Math.floor(t / GROUP_SEC));
    const group = GROUPS[gi];
    const groupProgress = (t - gi * GROUP_SEC) / GROUP_SEC;

    // Hue family: group weight x adjacency x learned multiplier, then x 0.7 for the family two pages back.
    const famWeights = group.fams.map(({ cat, w }) => {
      let weight = w;
      if (prev) weight *= ADJACENCY[Math.min(3, Math.abs(FAMILY_INDEX[cat] - FAMILY_INDEX[prev.cat]))];
      weight *= bias?.cat[group.phase]?.[cat] ?? 1;
      if (cat === catTwoBack) weight *= TWO_BACK_DAMPING;
      return weight;
    });
    const cat = group.fams[drawIndex(rng, famWeights)].cat;
    const family = FAMILY_BY_ID[cat];

    // Hue: two uniform draws in the band; keep the one closer to the previous hue (hue 1 on a tie).
    const [lo, hi] = family.band;
    const h1 = lo + (hi - lo) * rng();
    const h2 = lo + (hi - lo) * rng();
    const h = prev && hueDistance(h2, prev.h) < hueDistance(h1, prev.h) ? h2 : h1;

    // Lightness
    const base = baseL(tn);
    let L = base + family.dL + (-LIGHTNESS.jitter + 2 * LIGHTNESS.jitter * rng());
    L = clamp(L, LIGHTNESS.min, LIGHTNESS.max);
    if (prev) L = clamp(L, prev.L - LIGHTNESS.stepLimit, prev.L + LIGHTNESS.stepLimit);

    // Chroma
    let C = CHROMA.start + (CHROMA.end - CHROMA.start) * tn + (-CHROMA.jitter + 2 * CHROMA.jitter * rng());
    C = fitChroma(L, Math.max(CHROMA.floor, C), h);

    // Note: a lighter page takes a higher note, and notes drift down through each group.
    let midi: number;
    if (last) {
      midi = MELODY.tonic;
      if (prev && Math.abs(midi - prev.midi) > MELODY.maxLeap) midi = nearestNote(group.notes, prev.midi);
    } else {
      const z = (L - base) / NOTE_CHOICE.congruenceUnit;
      const congruence = z > NOTE_CHOICE.congruenceThreshold ? 0 : z < -NOTE_CHOICE.congruenceThreshold ? 2 : 1;
      const target = congruence + NOTE_CHOICE.drift * (groupProgress - 0.5);
      const noteWeights = group.notes.map((m, i) => {
        if (prev && Math.abs(m - prev.midi) > MELODY.maxLeap) return 0;
        if (prev && prev.midi === m && midiTwoBack === m) return 0;
        const gauss = Math.exp(-((i - target) ** 2) / (2 * NOTE_CHOICE.width ** 2));
        return gauss * (bias?.note[group.phase]?.[m] ?? 1);
      });
      const total = noteWeights.reduce((s, w) => s + w, 0);
      midi = total > 0 ? group.notes[drawIndex(rng, noteWeights)] : nearestNote(group.notes, prev ? prev.midi : group.notes[0]);
    }

    const page: Page = {
      i: items.length + 1,
      start: t,
      dwell,
      phase: group.phase,
      phaseName: group.name,
      cat,
      catName: family.name,
      L,
      C,
      h,
      hex: oklchToHex(L, C, h),
      midi,
      note: noteName(midi),
      hz: midiToHz(midi),
      drone: [...group.drone],
      gainDb: LEVEL_END_DB * tn + 0, // + 0 turns -0 into 0 on the first page
      xfade: Math.min(CROSSFADE.max, CROSSFADE.share * dwell),
    };
    items.push(page);
    if (last) return items;

    catTwoBack = prev ? prev.cat : null;
    midiTwoBack = prev ? prev.midi : null;
    prev = page;
    t += dwell;
  }
}

/**
 * Tries the seed, then seed + 1 and so on, up to 60 draws, and returns the first session that passes
 * all nine checks, or else the 60th draw with validation.pass set to false.
 */
export function generateValid(opts: GenerateOptions): Session {
  let session: Session | null = null;
  for (let k = 0; k < MAX_DRAWS; k++) {
    const seed = (opts.seed + k) >>> 0;
    const items = generate({ ...opts, seed });
    session = {
      seed,
      opts: { minDwell: opts.minDwell, maxDwell: opts.maxDwell, totalSec: SESSION_SEC },
      items,
      tries: k + 1,
      inserted: 0,
      validation: validate(items, opts.minDwell),
    };
    if (session.validation.pass) break;
  }
  return session as Session;
}
