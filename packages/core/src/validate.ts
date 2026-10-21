import { oklchToLinear, inGamut, okDist } from './color.ts';
import { GROUP_COUNT, LIGHTNESS, MELODY } from './constants.ts';
import { FAMILY_BY_ID } from './model.ts';
import type { CheckId, Page, Validation } from './types.ts';

/** Strictly falling from each group to the next. NaN (an empty group) fails. */
const fallsStrictly = (xs: readonly number[]): boolean => xs.every((x, g) => g === 0 || x < xs[g - 1]);

/** The nine calm checks. */
export function validate(items: readonly Page[], minDwell: number): Validation {
  const n = items.length;
  const count = new Array<number>(GROUP_COUNT).fill(0);
  const sumC = new Array<number>(GROUP_COUNT).fill(0);
  const sumWarm = new Array<number>(GROUP_COUNT).fill(0);
  const sumMidi = new Array<number>(GROUP_COUNT).fill(0);
  let repeats = 0,
    maxDL = 0,
    maxDE = 0,
    maxLeap = 0,
    shortest = Infinity,
    gamut = true;

  items.forEach((p, i) => {
    const g = p.phase - 1;
    count[g] += 1;
    sumC[g] += p.C;
    sumWarm[g] += FAMILY_BY_ID[p.cat].warm ? 1 : 0;
    sumMidi[g] += p.midi;
    if (!inGamut(oklchToLinear(p.L, p.C, p.h))) gamut = false;
    if (i < n - 1) shortest = Math.min(shortest, p.dwell);
    if (i > 0) {
      const q = items[i - 1];
      if (q.cat === p.cat) repeats += 1;
      maxDL = Math.max(maxDL, Math.abs(p.L - q.L));
      maxDE = Math.max(maxDE, okDist(q, p));
      maxLeap = Math.max(maxLeap, Math.abs(p.midi - q.midi));
    }
  });

  const mean = (sums: number[]) => sums.map((s, g) => (count[g] > 0 ? s / count[g] : NaN));
  const chroma = mean(sumC),
    warm = mean(sumWarm),
    pitch = mean(sumMidi);

  const checks: Record<CheckId, boolean> = {
    noRepeat: repeats === 0,
    chromaFalls: fallsStrictly(chroma),
    warmToCool: warm.every((x, g) => g === 0 || x <= warm[g - 1]) && warm[0] === 1 && warm[GROUP_COUNT - 1] === 0,
    pitchFalls: fallsStrictly(pitch),
    smoothLight: maxDL <= LIGHTNESS.checkStep,
    inGamut: gamut,
    slowChanges: shortest >= minDwell,
    smallLeaps: maxLeap <= MELODY.maxLeap,
    endsOnTonic: n > 0 && items[n - 1].midi === MELODY.tonic,
  };

  return {
    checks,
    pass: Object.values(checks).every(Boolean),
    stats: {
      n,
      repeats,
      chroma,
      warm,
      pitch,
      maxDL,
      maxDE,
      maxLeap,
      minDwell: Number.isFinite(shortest) ? shortest : n > 0 ? items[0].dwell : 0,
    },
  };
}
