import { breathsReached, generateValid, mulberry32, PACE_PRESETS } from '@calm/core';
import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { createRepo, type CalmRepo } from './repo';
import type { SessionDoc, SessionRecordDoc, SessionStatus } from './types';
import { ulid } from './ulid';

/** Test helpers. Tests also import 'fake-indexeddb/auto' so idb can recognise the fake IndexedDB classes. */

let databases = 0;

/** A repository on its own in-memory IndexedDB, plus what is needed to reopen it. */
export function freshRepo(): { repo: CalmRepo; factory: IDBFactory; name: string } {
  const factory = new FakeIDBFactory();
  const name = `calm-scroll-test-${++databases}`;
  return { repo: createRepo(name, factory), factory, name };
}

export const T0 = 1_760_000_000_000;

export interface SessionDocOptions {
  seed?: number;
  startedAt?: number;
  /** Pages watched. */
  watched?: number;
  /** Hold every nth page (0-based index divisible by n) for 4 x its planned dwell. */
  lingerEvery?: number;
  status?: SessionStatus;
}

/** An unscored session document, as the feed would checkpoint it. */
export function makeSessionDoc(options: SessionDocOptions = {}): SessionDoc {
  const { seed = 1, startedAt = T0, watched = 30, lingerEvery = 0, status = 'open' } = options;
  const session = generateValid({ seed, ...PACE_PRESETS.standard });
  const records: SessionRecordDoc[] = session.items.slice(0, watched).map((item, index) => {
    const dwell = lingerEvery > 0 && index % lingerEvery === 0 ? 4 * item.dwell : item.dwell;
    return { index, planned: item.dwell, dwell, sleep: false, breaths: breathsReached(item.dwell, dwell, 'gradual'), z: null, linger: false, item };
  });
  return {
    v: 1,
    id: ulid(startedAt, mulberry32(seed)),
    seed: session.seed,
    pace: 'standard',
    minDwell: PACE_PRESETS.standard.minDwell,
    maxDwell: PACE_PRESETS.standard.maxDwell,
    lingerMode: 'gradual',
    useMemory: true,
    inserted: session.inserted,
    pages: session.items.length,
    startedAt,
    endedAt: null,
    status,
    records,
    totals: null,
  };
}
