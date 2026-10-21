import type { DwellRecord, LingerMode, Session } from '@calm/core';

export type FeedStatus = 'idle' | 'showing' | 'lingering' | 'resting' | 'paused' | 'ended';

/** The single pending timer: the planned dwell, the end of a breath, or the short pause after waking. */
export interface FeedTimer {
  kind: 'dwell' | 'breath' | 'wake';
  /** Due time, ms on the performance clock. */
  at: number;
}

export interface BreathLog {
  k: number;
  /** ms on the performance clock. */
  start: number;
  /** Planned length, ms. */
  dur: number;
}

export interface FeedState {
  status: FeedStatus;
  session: Session;
  mode: LingerMode;
  /** 0-based index of the page on screen. */
  index: number;
  /** When the current page was shown, ms. */
  t0: number;
  /** The idle clock: last input, ms. Shifted forward by hidden spans. */
  lastActivity: number;
  /** Hidden and paused time already closed on the current page, ms. */
  hiddenMs: number;
  /** Start of the open hidden or paused span, or null. */
  excludedSince: number | null;
  hidden: boolean;
  /**
   * The page has been hidden for 3 minutes or more while lingering: the sound has faded and the
   * breaths wait for the page to return. Not Rest: hidden time still stays out of the dwell.
   */
  muted: boolean;
  /** Current breath number, 0 before the first. */
  breath: number;
  breaths: BreathLog[];
  /** The current page is logged as possible sleep. */
  sleep: boolean;
  /** Time of the last accepted page advance, ms. */
  lastAdvance: number;
  records: DwellRecord[];
  startedAt: number;
  endedAt: number | null;
  timer: FeedTimer | null;
}

export type FeedEvent =
  /** gesture: started by a tap or key press, so audio can unlock now; otherwise at the first touch. */
  | { type: 'start'; at: number; gesture: boolean }
  /** The rest of the session re-sliced for the person's pace, from the page at `index` on. */
  | { type: 'replan'; at: number; index: number; session: Session }
  | { type: 'timer'; kind: FeedTimer['kind']; at: number }
  | { type: 'next'; at: number }
  /** gesture: a tap or key press, which may resume audio. */
  | { type: 'activity'; at: number; gesture: boolean }
  | { type: 'interrupted'; at: number }
  | { type: 'hidden'; at: number }
  | { type: 'visible'; at: number }
  | { type: 'end'; at: number };

/** Side effects for the controller. Sound is scheduled 30 ms ahead on the audio clock. */
export type FeedEffect =
  | { type: 'unlockAudio' }
  | { type: 'resumeAudio' }
  /** The page's held voice, crossfading from the previous one over `fade` seconds. */
  | { type: 'voice'; hz: number; gainDb: number; fade: number }
  /** One breath on the held voice: a swell to peakDb, then down to troughDb, over `cycle` seconds. */
  | { type: 'breath'; cycle: number; inhale: number; peakDb: number; troughDb: number }
  | { type: 'drones'; midis: number[]; gainDb: number }
  | { type: 'master'; target: number; tc: number }
  /** Save an in-progress copy; `current` also records the page on screen so far. */
  | { type: 'checkpoint'; current: boolean }
  /** See whether the rest of the session should be re-sliced for the person's pace. */
  | { type: 'checkPace' }
  | { type: 'finish' };

export interface FeedStep {
  state: FeedState;
  effects: FeedEffect[];
}
