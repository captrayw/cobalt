import type { CatId } from './model.ts';

export type { CatId };

export interface Page {
  /** 1-based position. */
  i: number;
  /** Planned start, seconds. */
  start: number;
  /** Planned dwell, seconds. */
  dwell: number;
  /** Group 1 to 7. */
  phase: number;
  phaseName: string;
  cat: CatId;
  catName: string;
  /** OKLCH. */
  L: number;
  C: number;
  h: number;
  /** sRGB, uppercase #RRGGBB. */
  hex: string;
  midi: number;
  note: string;
  hz: number;
  /** MIDI notes sustained in this group. */
  drone: number[];
  /** 0 down to -14. */
  gainDb: number;
  /** Color crossfade, seconds. */
  xfade: number;
  /** Present when the page came from memory. */
  memKey?: string;
}

export const CHECK_IDS = [
  'noRepeat',
  'chromaFalls',
  'warmToCool',
  'pitchFalls',
  'smoothLight',
  'inGamut',
  'slowChanges',
  'smallLeaps',
  'endsOnTonic',
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

export interface ValidationStats {
  n: number;
  repeats: number;
  /** Mean chroma per group. */
  chroma: number[];
  /** Warm share per group. */
  warm: number[];
  /** Mean MIDI pitch per group. */
  pitch: number[];
  maxDL: number;
  maxDE: number;
  maxLeap: number;
  /** Shortest planned dwell, last page excluded. */
  minDwell: number;
}

export interface Validation {
  checks: Record<CheckId, boolean>;
  pass: boolean;
  stats: ValidationStats;
}

export interface SessionOpts {
  minDwell: number;
  maxDwell: number;
  totalSec: 900;
}

export interface Session {
  /** Seed of the accepted draw. */
  seed: number;
  opts: SessionOpts;
  items: Page[];
  /** Draws needed to pass. */
  tries: number;
  /** Pages placed from memory. */
  inserted: number;
  validation: Validation;
}

/** Learned multipliers, by group (phase) then family or MIDI note. */
export interface Bias {
  cat: Record<number, Partial<Record<CatId, number>>>;
  note: Record<number, Record<number, number>>;
}

/** One watched page. k is the 0-based page index and cycles the last breath reached. */
export interface DwellRecord {
  item: Page;
  k: number;
  dwell: number;
  sleep: boolean;
  cycles: number;
}

export interface ScoredRecord extends DwellRecord {
  /** Log-dwell residual against the neighbors' median; null under the short-session rule. */
  r: number | null;
  /** Robust z-score of r; null under the short-session rule. */
  z: number | null;
  linger: boolean;
}

export interface PageMemory {
  key: string;
  cat: CatId;
  catName: string;
  L: number;
  C: number;
  h: number;
  hex: string;
  midi: number;
  phase: number;
  /** Beta score: lingers against non-lingers. */
  a: number;
  b: number;
  shown: number;
  lingers: number;
  sleeps: number;
  lastLoop: number;
}

/** One session (a "loop") in the learning history. */
export interface LoopLog {
  n: number;
  seed: number;
  watched: number;
  lingers: number;
  sleeps: number;
  fromMem: number;
  medDwell: number;
  sim: boolean;
  at: number;
}

export interface FeatureScore {
  a: number;
  b: number;
}

/** Memory document, schema version 1. */
export interface Memory {
  v: 1;
  /** Epoch ms of the last save. */
  updatedAt: number;
  /** Most recent 30. */
  loops: LoopLog[];
  /** At most 80; key = `${hex}-${midi}-${phase}`. */
  pages: Record<string, PageMemory>;
  /** Keys `${phase}|c|${cat}` and `${phase}|n|${midi}`. */
  feat: Record<string, FeatureScore>;
}
