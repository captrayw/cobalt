import { A4_HZ } from './constants.ts';

export type CatId = 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'TEAL' | 'BLUE' | 'VIOLET';

export interface Family {
  id: CatId;
  name: string;
  /** OKLCH hue band, degrees. */
  band: readonly [number, number];
  /** Lightness offset from the session's base lightness. */
  dL: number;
  warm: boolean;
}

/** Hue families, ordered warm to cool so that index distance equals distance on the hue wheel. */
export const FAMILIES: readonly Family[] = [
  { id: 'RED', name: 'Red', band: [22, 32], dL: -0.02, warm: true },
  { id: 'ORANGE', name: 'Orange', band: [40, 58], dL: 0.0, warm: true },
  { id: 'YELLOW', name: 'Yellow', band: [80, 98], dL: 0.05, warm: true },
  { id: 'GREEN', name: 'Green', band: [130, 152], dL: 0.01, warm: false },
  { id: 'TEAL', name: 'Teal', band: [182, 202], dL: -0.02, warm: false },
  { id: 'BLUE', name: 'Blue', band: [240, 262], dL: -0.02, warm: false },
  { id: 'VIOLET', name: 'Violet', band: [290, 310], dL: -0.01, warm: false },
];

export const CAT_IDS: readonly CatId[] = FAMILIES.map((f) => f.id);

export const FAMILY_BY_ID = Object.fromEntries(FAMILIES.map((f) => [f.id, f])) as Readonly<Record<CatId, Family>>;

export const FAMILY_INDEX = Object.fromEntries(FAMILIES.map((f, i) => [f.id, i])) as Readonly<Record<CatId, number>>;

export interface Group {
  /** 1 to 7. */
  phase: number;
  name: string;
  fams: readonly { cat: CatId; w: number }[];
  /** Note pool, high to low (MIDI). */
  notes: readonly number[];
  /** MIDI notes sustained through the group. */
  drone: readonly number[];
  baseL: number;
}

/** The seven-group calm arc. */
export const GROUPS: readonly Group[] = [
  {
    phase: 1,
    name: 'Meet',
    fams: [
      { cat: 'RED', w: 0.3 },
      { cat: 'ORANGE', w: 0.45 },
      { cat: 'YELLOW', w: 0.25 },
    ],
    notes: [71, 69, 66],
    drone: [],
    baseL: 0.69,
  },
  {
    phase: 2,
    name: 'Lift',
    fams: [
      { cat: 'ORANGE', w: 0.3 },
      { cat: 'YELLOW', w: 0.45 },
      { cat: 'GREEN', w: 0.25 },
    ],
    notes: [69, 66, 64],
    drone: [],
    baseL: 0.7,
  },
  {
    phase: 3,
    name: 'Ground',
    fams: [
      { cat: 'YELLOW', w: 0.25 },
      { cat: 'GREEN', w: 0.45 },
      { cat: 'TEAL', w: 0.3 },
    ],
    notes: [66, 64, 62],
    drone: [50],
    baseL: 0.69,
  },
  {
    phase: 4,
    name: 'Deepen',
    fams: [
      { cat: 'GREEN', w: 0.25 },
      { cat: 'TEAL', w: 0.45 },
      { cat: 'BLUE', w: 0.3 },
    ],
    notes: [64, 62, 59],
    drone: [50],
    baseL: 0.67,
  },
  {
    phase: 5,
    name: 'Slow',
    fams: [
      { cat: 'TEAL', w: 0.3 },
      { cat: 'BLUE', w: 0.45 },
      { cat: 'VIOLET', w: 0.25 },
    ],
    notes: [62, 59, 57],
    drone: [50],
    baseL: 0.655,
  },
  {
    phase: 6,
    name: 'Release',
    fams: [
      { cat: 'TEAL', w: 0.2 },
      { cat: 'BLUE', w: 0.35 },
      { cat: 'VIOLET', w: 0.45 },
    ],
    notes: [59, 57, 54],
    drone: [50],
    baseL: 0.65,
  },
  {
    phase: 7,
    name: 'Rest',
    fams: [
      { cat: 'TEAL', w: 0.2 },
      { cat: 'BLUE', w: 0.5 },
      { cat: 'VIOLET', w: 0.3 },
    ],
    notes: [57, 54, 50],
    drone: [50, 45],
    baseL: 0.67,
  },
];

/** Every note any group can play, high to low. */
export const POOL_NOTES: readonly number[] = [...new Set(GROUPS.flatMap((g) => g.notes))].sort((a, b) => b - a);

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** Scientific pitch name, such as F♯4 for MIDI 66. */
export function noteName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + String(Math.floor(midi / 12) - 1);
}

/** Standard tuning, A4 at 440 Hz. */
export function midiToHz(midi: number): number {
  return A4_HZ * 2 ** ((midi - 69) / 12);
}

export function groupOf(phase: number): Group {
  const group = GROUPS[phase - 1];
  if (!group) throw new Error(`No group ${phase}`);
  return group;
}
