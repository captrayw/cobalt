import { baseL, CHROMA, FAMILY_BY_ID, fitChroma, GROUPS, oklchToHex } from '@calm/core';

/** One color per group at its center: the group's main family, lightness and chroma. */
export const ARC = GROUPS.map((g) => {
  const tn = (g.phase - 0.5) / GROUPS.length;
  const main = [...g.fams].sort((a, b) => b.w - a.w)[0].cat;
  const [lo, hi] = FAMILY_BY_ID[main].band;
  const h = (lo + hi) / 2,
    L = baseL(tn);
  return { name: g.name, hex: oklchToHex(L, fitChroma(L, CHROMA.start + (CHROMA.end - CHROMA.start) * tn, h), h) };
});
