import type { LingerMode, Memory, PaceId, Page } from '@calm/core';

export type ThemeSetting = 'system' | 'dark' | 'light';
/** Reduced-motion override: follow the system, always reduce, or always allow motion. */
export type MotionSetting = 'system' | 'reduce' | 'allow';

/**
 * Owner change (Oct 2026): pace and linger rhythm are no longer settings. Every session uses the
 * 5 to 10 s pace and the gradual rhythm; rows an older version stored for them are ignored.
 */
export interface Settings {
  /** The "Use what I lingered on" switch. */
  useMemory: boolean;
  /** User volume, -30 to 0 dB. */
  volumeDb: number;
  /** Show the note and color name on each page. Owner change (Oct 2026): on by default. */
  pageDetails: boolean;
  /** Owner change (Oct 2026): the feed's night colors (Evening mode). Swiping sideways in a session switches it. */
  night: boolean;
  reducedMotion: MotionSetting;
  theme: ThemeSetting;
  /**
   * Owner change (Oct 2026): the feed's arrows are hints. Once the person has moved on to a next
   * page, the down arrow stays out of sight; once they have switched day and night, so do the side
   * arrows. Kept here so the hints do not come back each session; not shown in Settings.
   */
  learnedNext: boolean;
  learnedSideways: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  useMemory: true,
  volumeDb: 0,
  pageDetails: true,
  night: false,
  reducedMotion: 'system',
  theme: 'system',
  learnedNext: false,
  learnedSideways: false,
};

/** One watched page in a stored session. */
export interface SessionRecordDoc {
  /** 0-based page index. */
  index: number;
  /** Planned dwell, seconds. */
  planned: number;
  /** Measured dwell, seconds, with hidden and paused time removed. */
  dwell: number;
  sleep: boolean;
  /** The last breath reached. */
  breaths: number;
  /** Robust z-score from scoreRecords; null before scoring or under the short-session rule. */
  z: number | null;
  linger: boolean;
  /** The page as shown, so an unfinished checkpoint can still be scored and learned. */
  item: Page;
  /** Shown in night colors. Missing in sessions from before night colors existed. */
  night?: boolean;
}

export type SessionStatus = 'open' | 'done' | 'partial';

export interface SessionTotals {
  watched: number;
  lingers: number;
  sleeps: number;
  fromMem: number;
  /** Total measured time, seconds. */
  seconds: number;
}

/** A session in the sessions store, keyed by its ULID. */
export interface SessionDoc {
  v: 1;
  id: string;
  seed: number;
  pace: PaceId;
  minDwell: number;
  maxDwell: number;
  lingerMode: LingerMode;
  useMemory: boolean;
  /** Pages placed from memory. */
  inserted: number;
  /** Pages planned in the session. */
  pages: number;
  /** Epoch ms. */
  startedAt: number;
  endedAt: number | null;
  /** open: checkpointed while running; done: ended normally; partial: recovered at the next launch. */
  status: SessionStatus;
  records: SessionRecordDoc[];
  /** Set once the session is scored. */
  totals: SessionTotals | null;
}

export type SnapshotReason = 'import' | 'reset' | 'migration';

/** A memory copy taken before an import, a reset or a migration, keyed by its timestamp. */
export interface SnapshotDoc {
  v: 1;
  at: number;
  reason: SnapshotReason;
  memory: Memory;
  /** The stored document exactly as it was, when it was in an older format or unreadable. */
  raw?: unknown;
}

/** The single JSON file written by export and read by import. */
export interface ExportFile {
  app: 'calm-scroll';
  /** Schema version of the stored data. */
  schema: 1;
  exportedAt: number;
  memory: Memory;
  sessions: SessionDoc[];
  settings: Settings;
}
