import { CARRY_SALT, MAX_DRAWS } from './constants.ts';
import { generateValid } from './generate.ts';
import { applyMemory, biasFrom } from './loop.ts';
import { mulberry32 } from './rng.ts';
import type { Memory, Session } from './types.ts';

export interface PrepareOptions {
  seed: number;
  minDwell: number;
  maxDwell: number;
  memory?: Memory | null;
  /** The "Use what I lingered on" switch. When off, biasFrom and applyMemory are skipped. */
  useMemory: boolean;
}

/** One session from one seed: biasFrom, generateValid, then applyMemory. */
export function prepareSession(opts: PrepareOptions): Session {
  const memory = opts.useMemory ? opts.memory : null;
  const session = generateValid({ seed: opts.seed, minDwell: opts.minDwell, maxDwell: opts.maxDwell, bias: biasFrom(memory) });
  if (!memory) return session;
  return applyMemory(session, memory, mulberry32((session.seed ^ CARRY_SALT) >>> 0));
}

/**
 * A session that passes all nine checks. A failing session is never shown: after 60 draws
 * without a pass, a fresh seed is drawn instead.
 */
export function prepareValidSession(opts: Omit<PrepareOptions, 'seed'>, nextSeed: () => number): Session {
  for (let attempt = 0; attempt < MAX_DRAWS; attempt++) {
    const session = prepareSession({ ...opts, seed: nextSeed() });
    if (session.validation.pass) return session;
  }
  throw new Error('No session passed the nine checks.');
}
