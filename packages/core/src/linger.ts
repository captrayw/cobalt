import { LINGER, type LingerMode } from './constants.ts';

/**
 * Length of linger breath k (from 1), in seconds. start is the page's planned dwell.
 * "gradual" starts at the page's own cycle and stretches each breath about 6%, toward 6 and then
 * 5 breaths per minute; "user" is the 2, 5, 9 s comparison mode.
 */
export function lingerCycle(start: number, k: number, mode: LingerMode): number {
  if (mode === 'user') return LINGER.userCycles[Math.min(k, 3) - 1];
  let c = Math.max(LINGER.startMin, Math.min(LINGER.startMax, start));
  for (let i = 0; i < k; i++) {
    c = c < LINGER.growthCap ? Math.min(LINGER.growthCap, c * LINGER.growth) : Math.min(LINGER.cap, c * LINGER.slowGrowth);
  }
  return c;
}

/** Share of a breath spent rising; the rest is the exhale. */
export const inhaleShare = (k: number, mode: LingerMode): number =>
  mode === 'user' ? LINGER.inhaleStart : Math.max(LINGER.inhaleFloor, LINGER.inhaleStart - LINGER.inhaleStep * k);

/** Level of breath k: 1 dB softer per breath, at most 12 dB below the page. */
export const lingerLevelDb = (pageDb: number, k: number): number => pageDb - Math.min(LINGER.levelFloorDb, LINGER.levelStepDb * k);

/** Opacity of the black dim layer during breath k (faded in over 3 s). */
export const dimOpacity = (k: number): number => Math.min(LINGER.dimMax, LINGER.dimStep * k);

/** The last breath reached when a page planned for `planned` seconds is held for `dwell` seconds. */
export function breathsReached(planned: number, dwell: number, mode: LingerMode): number {
  let k = 0,
    t = planned;
  while (t < dwell) {
    k += 1;
    t += lingerCycle(planned, k, mode);
  }
  return k;
}
