import {
  DECAY,
  FEATURE_MULTIPLIER,
  GROUP_CAP,
  GROUP_COUNT,
  LIGHTNESS,
  MELODY,
  MEMORY_CAPS,
  PRIORS,
  SCORING,
} from './constants.ts';
import { GROUPS, midiToHz, noteName } from './model.ts';
import type { Rng } from './rng.ts';
import type { Bias, DwellRecord, FeatureScore, LoopLog, Memory, Page, PageMemory, ScoredRecord, Session } from './types.ts';
import { validate } from './validate.ts';

/** The learning loop. Every function is deterministic and does no I/O; inputs are never mutated. */

export const emptyMemory = (): Memory => ({ v: 1, updatedAt: 0, loops: [], pages: {}, feat: {} });

/** Memory key of a fresh page. */
export const pageKey = (p: Pick<Page, 'hex' | 'midi' | 'phase'>): string => `${p.hex}-${p.midi}-${p.phase}`;

/** Memory key of any page in a session: its memKey when it came from memory. */
export const keyOf = (p: Page): string => p.memKey ?? pageKey(p);

export const familyFeature = (phase: number, cat: string): string => `${phase}|c|${cat}`;
export const noteFeature = (phase: number, midi: number): string => `${phase}|n|${midi}`;

const round = (x: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  const m = n >> 1;
  return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Mean of a Beta score: the chance a remembered page returns. */
export const scoreMean = (s: FeatureScore): number => s.a / (s.a + s.b);

/**
 * Marks each record as a linger or not, comparing every page with its neighbors on a log scale,
 * so the natural slowdown late in a calm session does not count as a preference.
 */
export function scoreRecords(records: readonly DwellRecord[]): ScoredRecord[] {
  const n = records.length;
  if (n < SCORING.shortSession) {
    return records.map((rec) => ({
      ...rec,
      r: null,
      z: null,
      linger: rec.sleep || rec.dwell > SCORING.shortRatio * rec.item.dwell,
    }));
  }
  const x = records.map((rec) => Math.log(Math.max(SCORING.dwellFloor, rec.dwell)));
  const r = x.map((xi, i) => {
    const neighbors: number[] = [];
    const lo = Math.max(0, i - SCORING.neighbors),
      hi = Math.min(n - 1, i + SCORING.neighbors);
    for (let j = lo; j <= hi; j++) if (j !== i) neighbors.push(x[j]);
    return xi - median(neighbors);
  });
  const m = median(r);
  const s = Math.max(SCORING.madScale * median(r.map((v) => Math.abs(v - m))), SCORING.madFloor);
  return records.map((rec, i) => {
    const z = (r[i] - m) / s;
    return { ...rec, r: r[i], z, linger: rec.sleep || (z >= SCORING.z && Math.exp(r[i]) >= SCORING.ratio) };
  });
}

export interface LearnMeta {
  /** Seed of the session that was watched. */
  seed: number;
  /** Epoch ms of this save; becomes updatedAt and the loop's timestamp. */
  at: number;
  sim?: boolean;
}

const decayToward = (x: number, prior: number): number => prior + (x - prior) * DECAY;

/** Updates memory from one scored session: decay, feature scores, page scores, caps and the loop log. */
export function learn(memory: Memory, records: readonly ScoredRecord[], meta: LearnMeta): Memory {
  const pages: Record<string, PageMemory> = {};
  for (const [key, p] of Object.entries(memory.pages)) {
    pages[key] = { ...p, a: decayToward(p.a, PRIORS.page.a), b: decayToward(p.b, PRIORS.page.b) };
  }
  const feat: Record<string, FeatureScore> = {};
  for (const [key, f] of Object.entries(memory.feat)) {
    feat[key] = { a: decayToward(f.a, PRIORS.feature.a), b: decayToward(f.b, PRIORS.feature.b) };
  }
  const n = memory.loops.reduce((hi, l) => Math.max(hi, l.n), 0) + 1;

  for (const rec of records) {
    const it = rec.item;
    for (const key of [familyFeature(it.phase, it.cat), noteFeature(it.phase, it.midi)]) {
      const f = (feat[key] ??= { a: PRIORS.feature.a, b: PRIORS.feature.b });
      if (rec.linger) f.a += 1;
      else f.b += 1;
    }

    const key = keyOf(it);
    let entry = pages[key];
    if (!entry && rec.linger) {
      entry = pages[key] = {
        key,
        cat: it.cat,
        catName: it.catName,
        L: round(it.L, 4),
        C: round(it.C, 4),
        h: round(it.h, 2),
        hex: it.hex,
        midi: it.midi,
        phase: it.phase,
        a: PRIORS.page.a,
        b: PRIORS.page.b,
        shown: 0,
        lingers: 0,
        sleeps: 0,
        lastLoop: n,
      };
    }
    if (entry) {
      entry.shown += 1;
      entry.lastLoop = n;
      if (rec.linger) {
        entry.a += 1;
        entry.lingers += 1;
        if (rec.sleep) entry.sleeps += 1;
      } else {
        entry.b += 1;
      }
    }
  }

  // Keep the 80 entries with the highest mean, breaking ties by more lingers.
  const keys = Object.keys(pages);
  if (keys.length > MEMORY_CAPS.pages) {
    const ranked = [...keys].sort((x, y) => scoreMean(pages[y]) - scoreMean(pages[x]) || pages[y].lingers - pages[x].lingers);
    for (const key of ranked.slice(MEMORY_CAPS.pages)) delete pages[key];
  }

  const log: LoopLog = {
    n,
    seed: meta.seed,
    watched: records.length,
    lingers: records.filter((r) => r.linger).length,
    sleeps: records.filter((r) => r.sleep).length,
    fromMem: records.filter((r) => r.item.memKey !== undefined).length,
    medDwell: records.length > 0 ? round(median(records.map((r) => r.dwell)), 1) : 0,
    sim: meta.sim ?? false,
    at: meta.at,
  };
  return { v: 1, updatedAt: meta.at, loops: [...memory.loops, log].slice(-MEMORY_CAPS.loops), pages, feat };
}

const clampMultiplier = (x: number): number => Math.min(FEATURE_MULTIPLIER.max, Math.max(FEATURE_MULTIPLIER.min, x));

/**
 * Feature emphasis: each family's (or note's) linger rate relative to the mean of its group's three,
 * clamped to 0.6 to 1.8. With no feature scores, there is no bias.
 */
export function biasFrom(memory: Memory | null | undefined): Bias | null {
  if (!memory || Object.keys(memory.feat).length === 0) return null;
  const rate = (key: string): number => {
    const f = memory.feat[key];
    return f ? scoreMean(f) : FEATURE_MULTIPLIER.missingRate;
  };
  const bias: Bias = { cat: {}, note: {} };
  for (const g of GROUPS) {
    const famRates = g.fams.map((f) => rate(familyFeature(g.phase, f.cat)));
    const famMean = famRates.reduce((s, x) => s + x, 0) / famRates.length;
    const cats: Bias['cat'][number] = {};
    g.fams.forEach((f, i) => (cats[f.cat] = clampMultiplier(famRates[i] / famMean)));
    bias.cat[g.phase] = cats;

    const noteRates = g.notes.map((m) => rate(noteFeature(g.phase, m)));
    const noteMean = noteRates.reduce((s, x) => s + x, 0) / noteRates.length;
    const notes: Bias['note'][number] = {};
    g.notes.forEach((m, i) => (notes[m] = clampMultiplier(noteRates[i] / noteMean)));
    bias.note[g.phase] = notes;
  }
  return bias;
}

/** Standard normal draw (Box-Muller). */
function normal(rng: Rng): number {
  const u = 1 - rng(),
    v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape, 1) draw by the Marsaglia and Tsang method. */
export function gammaSample(rng: Rng, shape: number): number {
  if (shape < 1) return gammaSample(rng, shape + 1) * (1 - rng()) ** (1 / shape);
  const d = shape - 1 / 3,
    c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Beta(a, b) draw from two gamma draws. */
export function betaSample(rng: Rng, a: number, b: number): number {
  const x = gammaSample(rng, a),
    y = gammaSample(rng, b);
  return x / (x + y);
}

/**
 * Carry-over: remembered pages return by Thompson sampling, inside their original group and never
 * above 25% of a group. Each insert is revalidated and undone when any check fails.
 * Pass a PRNG seeded from the session seed XOR CARRY_SALT.
 */
export function applyMemory(session: Session, memory: Memory | null | undefined, rng: Rng): Session {
  const remembered = memory ? Object.values(memory.pages) : [];
  if (remembered.length === 0) return { ...session, items: session.items.map((p) => ({ ...p })), inserted: 0 };

  const items = session.items.map((p) => ({ ...p }));
  const drawn = remembered.map((p) => ({ p, theta: betaSample(rng, p.a, p.b) }));
  drawn.sort((x, y) => y.theta - x.theta);

  const groupSize = new Array<number>(GROUP_COUNT + 1).fill(0);
  for (const it of items) groupSize[it.phase] += 1;
  const used = new Array<number>(GROUP_COUNT + 1).fill(0);
  const present = new Set(items.map(keyOf));
  let validation = session.validation;
  let inserted = 0;

  for (const { p, theta } of drawn) {
    if (rng() > theta) continue;
    const room = Math.max(1, Math.floor(GROUP_CAP * groupSize[p.phase]));
    if (used[p.phase] >= room || present.has(p.key)) continue;

    // Interior pages of the same group, not already from memory, whose two neighbors each differ in
    // family and lie within 0.08 of its lightness and 7 semitones of its note.
    const slots: number[] = [];
    for (let i = 1; i < items.length - 1; i++) {
      const s = items[i];
      if (s.phase !== p.phase || s.memKey !== undefined) continue;
      const fits = (q: Page) =>
        q.cat !== p.cat && Math.abs(q.L - p.L) <= LIGHTNESS.checkStep && Math.abs(q.midi - p.midi) <= MELODY.maxLeap;
      if (fits(items[i - 1]) && fits(items[i + 1])) slots.push(i);
    }
    if (slots.length === 0) continue;

    const i = slots[Math.floor(rng() * slots.length)];
    const before = items[i];
    items[i] = {
      ...before,
      cat: p.cat,
      catName: p.catName,
      L: p.L,
      C: p.C,
      h: p.h,
      hex: p.hex,
      midi: p.midi,
      note: noteName(p.midi),
      hz: midiToHz(p.midi),
      memKey: p.key,
    };
    const check = validate(items, session.opts.minDwell);
    if (!check.pass) {
      items[i] = before;
      continue;
    }
    validation = check;
    inserted += 1;
    used[p.phase] += 1;
    present.delete(keyOf(before));
    present.add(p.key);
  }
  return { ...session, items, inserted, validation };
}
