import { PACE_PRESETS, SIM } from './constants.ts';
import { breathsReached } from './linger.ts';
import { emptyMemory, learn, scoreRecords } from './loop.ts';
import { CAT_IDS, POOL_NOTES } from './model.ts';
import { mulberry32, type Rng } from './rng.ts';
import { prepareSession } from './session.ts';
import type { CatId, DwellRecord, Memory, Page } from './types.ts';

/** A sandbox viewer with one favorite family and one favorite note. */
export interface SimViewer {
  favoriteCat: CatId;
  favoriteMidi: number;
  cat: Record<CatId, number>;
  note: Record<number, number>;
}

export interface SimOptions {
  seed: number;
  viewers?: number;
  loops?: number;
  minDwell?: number;
  maxDwell?: number;
}

/** Totals for one loop number, summed over viewers. */
export interface SimLoopStats {
  loop: number;
  watched: number;
  lingers: number;
  fromMem: number;
  favorite: number;
  lingerShare: number;
  fromMemShare: number;
  favoriteShare: number;
}

export interface SimResult {
  loops: SimLoopStats[];
  /** Linger rate of pages that came from memory, and of fresh pages, over every loop. */
  memLingerRate: number;
  freshLingerRate: number;
  memPages: number;
  freshPages: number;
  /** The last viewer's memory after the final loop. */
  memory: Memory;
}

export function makeViewer(rng: Rng): SimViewer {
  const favoriteCat = CAT_IDS[Math.floor(rng() * CAT_IDS.length)];
  const favoriteMidi = POOL_NOTES[Math.floor(rng() * POOL_NOTES.length)];
  const other = () => SIM.otherBase + SIM.otherSpread * rng();
  const cat = {} as Record<CatId, number>;
  for (const id of CAT_IDS) cat[id] = id === favoriteCat ? 1 : other();
  const note: Record<number, number> = {};
  for (const m of POOL_NOTES) note[m] = m === favoriteMidi ? 1 : other();
  return { favoriteCat, favoriteMidi, cat, note };
}

/** How the viewer watches one session. A sleep in groups 6 and 7 ends the loop. */
export function watch(rng: Rng, viewer: SimViewer, items: readonly Page[]): DwellRecord[] {
  const records: DwellRecord[] = [];
  for (let k = 0; k < items.length; k++) {
    const item = items[k];
    if (item.phase >= SIM.sleepPhase && rng() < SIM.sleepChance) {
      records.push({ item, k, dwell: SIM.sleepSec, sleep: true, cycles: breathsReached(item.dwell, SIM.sleepSec, 'gradual') });
      break;
    }
    const like = SIM.familyWeight * viewer.cat[item.cat] + SIM.noteWeight * viewer.note[item.midi];
    const lingers = rng() < SIM.lingerBase + SIM.lingerScale * like ** SIM.lingerPower;
    const [base, spread] = lingers ? SIM.lingerDwell : SIM.otherDwell;
    const dwell = item.dwell * (base + spread * rng());
    records.push({ item, k, dwell, sleep: false, cycles: breathsReached(item.dwell, dwell, 'gradual') });
  }
  return records;
}

/** Sandbox simulation: simulated viewers run several loops each against fresh memory. */
export function simulate(opts: SimOptions): SimResult {
  const rng = mulberry32(opts.seed);
  const viewers = opts.viewers ?? 1,
    loopCount = opts.loops ?? 10;
  const minDwell = opts.minDwell ?? PACE_PRESETS.standard.minDwell,
    maxDwell = opts.maxDwell ?? PACE_PRESETS.standard.maxDwell;
  const totals = Array.from({ length: loopCount }, (_, i) => ({ loop: i + 1, watched: 0, lingers: 0, fromMem: 0, favorite: 0 }));
  let memPages = 0,
    memLingers = 0,
    freshPages = 0,
    freshLingers = 0;
  let memory = emptyMemory();

  for (let v = 0; v < viewers; v++) {
    const viewer = makeViewer(rng);
    memory = emptyMemory();
    for (let l = 0; l < loopCount; l++) {
      const session = prepareSession({ seed: Math.floor(rng() * 4294967296) >>> 0, minDwell, maxDwell, memory, useMemory: true });
      const scored = scoreRecords(watch(rng, viewer, session.items));
      memory = learn(memory, scored, { seed: session.seed, at: l + 1, sim: true });
      const t = totals[l];
      for (const rec of scored) {
        t.watched += 1;
        if (rec.linger) t.lingers += 1;
        if (rec.item.cat === viewer.favoriteCat) t.favorite += 1;
        if (rec.item.memKey !== undefined) {
          t.fromMem += 1;
          memPages += 1;
          if (rec.linger) memLingers += 1;
        } else {
          freshPages += 1;
          if (rec.linger) freshLingers += 1;
        }
      }
    }
  }

  const share = (x: number, of: number) => (of > 0 ? x / of : 0);
  return {
    loops: totals.map((t) => ({
      ...t,
      lingerShare: share(t.lingers, t.watched),
      fromMemShare: share(t.fromMem, t.watched),
      favoriteShare: share(t.favorite, t.watched),
    })),
    memLingerRate: share(memLingers, memPages),
    freshLingerRate: share(freshLingers, freshPages),
    memPages,
    freshPages,
    memory,
  };
}
