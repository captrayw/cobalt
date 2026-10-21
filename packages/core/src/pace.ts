import { CARRY_SALT, MAX_DRAWS, MIN_PAGE_SEC, PACE_SLICING, SESSION_SEC } from './constants.ts';
import { continueFrom } from './generate.ts';
import { applyMemory, biasFrom } from './loop.ts';
import { mulberry32 } from './rng.ts';
import type { Memory, Session } from './types.ts';
import { validate } from './validate.ts';

/**
 * Owner change (Oct 2026): pace slicing. A session plans about 120 pages of 5 to 10 s, but a person
 * who scrolls quickly would run out of pages long before 15 minutes. Every few pages, if the pages
 * left would run out early at the person's average pace so far, the rest of the session is sliced
 * into more, shorter pages, keeping the arc, its groups and all nine checks.
 */

export interface PaceCheck {
  /** 0-based index of the page on screen; it and every page before it stay as they are. */
  index: number;
  /** Seconds spent on the session so far, hidden and paused time excluded. */
  elapsedSec: number;
  /** Pages watched so far. */
  watched: number;
}

export interface PaceOptions {
  memory?: Memory | null;
  /** The "Use what I lingered on" switch: bias and carry-over in the new pages. */
  useMemory: boolean;
}

/**
 * Dwell bounds whose mean puts `plannedLeft` seconds of the arc into enough pages to last
 * `secondsLeft` at `pace` seconds per page. The bounds keep the presets' 1 : 2 spread and never go
 * under the 2 s floor, so at a pace near or under 2 s per page the session can still end early.
 */
export function slicedDwell(plannedLeft: number, secondsLeft: number, pace: number): { minDwell: number; maxDwell: number } {
  const mean = plannedLeft / (secondsLeft / pace);
  if (mean >= 1.5 * MIN_PAGE_SEC) return { minDwell: (2 / 3) * mean, maxDwell: (4 / 3) * mean };
  if (mean > MIN_PAGE_SEC) return { minDwell: MIN_PAGE_SEC, maxDwell: 2 * mean - MIN_PAGE_SEC };
  return { minDwell: MIN_PAGE_SEC, maxDwell: MIN_PAGE_SEC };
}

/**
 * The session with its remaining pages re-sliced for the person's pace, or null when the pages left
 * already last long enough (or too little is left to slice). Deterministic for a session, a check
 * and a memory. The new pages pass the nine checks together with the pages already seen.
 */
export function sliceForPace(session: Session, check: PaceCheck, options: PaceOptions): Session | null {
  const { index, elapsedSec, watched } = check;
  const items = session.items;
  if (watched <= 0 || index < 0 || index >= items.length) return null;
  const pace = elapsedSec / watched;
  const secondsLeft = SESSION_SEC - elapsedSec;
  const pagesLeft = items.length - 1 - index;
  if (!(pace > 0) || secondsLeft <= 0 || pagesLeft < PACE_SLICING.minPagesLeft) return null;
  // Enough pages left at this pace: keep the plan.
  if (pagesLeft * pace >= PACE_SLICING.enoughShare * secondsLeft) return null;

  const current = items[index];
  const from = current.start + current.dwell;
  const plannedLeft = SESSION_SEC - from;
  if (plannedLeft < PACE_SLICING.minPagesLeft * MIN_PAGE_SEC) return null;
  const dwell = slicedDwell(plannedLeft, secondsLeft, pace);
  // Slicing only helps if the new pages are shorter than the ones they replace.
  if ((dwell.minDwell + dwell.maxDwell) / 2 >= plannedLeft / pagesLeft) return null;

  const memory = options.useMemory ? (options.memory ?? null) : null;
  const bias = biasFrom(memory);
  const cursor = { t: from, prev: current, prevPrev: index > 0 ? items[index - 1] : null, i: index + 2 };
  const kept = items.slice(0, index + 1);
  for (let k = 0; k < MAX_DRAWS; k++) {
    const seed = ((session.seed ^ Math.imul(index + 1, 0x9e3779b1)) + k) >>> 0;
    const next = [...kept, ...continueFrom(cursor, { seed, ...dwell, bias })];
    const validation = validate(next, dwell.minDwell);
    if (!validation.pass) continue;
    const sliced: Session = {
      ...session,
      opts: { minDwell: dwell.minDwell, maxDwell: dwell.maxDwell, totalSec: SESSION_SEC },
      items: next,
      validation,
    };
    return memory ? applyMemory(sliced, memory, mulberry32((seed ^ CARRY_SALT) >>> 0), index + 1) : sliced;
  }
  return null;
}
