/**
 * Every tunable value in Calm Scroll, with the defaults from the build brief.
 * Do not change a value here without the owner's approval; propose each change with its evidence.
 */

// Session shape
export const SESSION_SEC = 900;
export const GROUP_COUNT = 7;
export const GROUP_SEC = SESSION_SEC / GROUP_COUNT;
export const MAX_DRAWS = 60;

// Pace presets, seconds per page. "standard" is the default assumption; "measured" follows
// measured viewing (about 35 to 60 videos per 15 minutes).
export type PaceId = 'standard' | 'measured';
export const PACE_PRESETS: Readonly<Record<PaceId, { readonly minDwell: number; readonly maxDwell: number }>> = {
  standard: { minDwell: 5, maxDwell: 10 },
  measured: { minDwell: 12, maxDwell: 24 },
};
export const DEFAULT_PACE: PaceId = 'standard';

// Color path
export const CHROMA = { start: 0.115, end: 0.035, jitter: 0.005, floor: 0.02, max: 0.12 } as const;
export const LIGHTNESS = { min: 0.6, max: 0.8, jitter: 0.01, stepLimit: 0.06, checkStep: 0.08 } as const;
/** Family adjacency weight by index distance from the previous family: 0, 1, 2, 3 or more. */
export const ADJACENCY = [0, 1.0, 0.45, 0.2] as const;
export const TWO_BACK_DAMPING = 0.7;

// Notes
export const NOTE_CHOICE = { width: 0.55, drift: 0.6, congruenceUnit: 0.03, congruenceThreshold: 0.5 } as const;
export const MELODY = { maxLeap: 7, tonic: 50 } as const;
export const A4_HZ = 440;

// Level and fade
export const LEVEL_END_DB = -14;
export const CROSSFADE = { max: 1.5, share: 0.2 } as const;

// Audio
export const TONE = {
  peak: 0.16,
  harmonic: 0.1,
  attackFloor: 0.04,
  releaseFloor: 0.08,
  rampTail: 0.25,
  stopTail: 0.3,
  pageInhale: 0.4,
  floor: 0.0001,
} as const;
export const MASTER = { normal: 0.9, silent: 0.0001 } as const;
export const USER_VOLUME_DB = { min: -30, max: 0, default: 0 } as const;
export const LOWPASS = { hz: 2400, q: 0.4 } as const;
/** Drone level at 0 dB, by MIDI note: D3 from group 3 on, A2 in group 7. */
export const DRONE_LEVELS: Readonly<Record<number, number>> = { 50: 0.045, 45: 0.03 };
export const DRONE_FADE = { inSec: 3, rampSec: 0.2, previewEndTc: 0.6 } as const;
export const SCHEDULE = {
  offset: 0.03,
  previewStartDelay: 0.15,
  previewTick: 0.12,
  previewLookahead: 0.7,
  previewMinLead: 0.02,
} as const;
export const MASTER_TC = { page: 0.2, rest: 8, wake: 0.5, end: 0.08, previewStop: 0.06 } as const;
/**
 * Addition to the brief: on a page change, tones still sounding from the previous page fade with
 * this time constant, so quick swipes never stack voices above the first page's level.
 */
export const VOICE_RELEASE_TC = 0.25;
/** Time constant for user volume changes, so a volume change is never abrupt. */
export const VOLUME_TC = 0.05;
/** A fading voice or drone stops after this many time constants (about -70 dB). */
export const FADE_TCS = 8;
/** At the end of a preview, the drones fade for this many time constants before the stop. */
export const DRONE_FADE_TCS = 5;
export const CLOSE_AFTER_SEC = { end: 0.5, preview: 0.45 } as const;

// Linger rhythm
export type LingerMode = 'gradual' | 'user';
export const LINGER = {
  startMin: 4,
  startMax: 10,
  growth: 1.06,
  growthCap: 10,
  slowGrowth: 1.03,
  cap: 12,
  inhaleStart: 0.4,
  inhaleStep: 0.0125,
  inhaleFloor: 0.3,
  levelStepDb: 1,
  levelFloorDb: 12,
  dimStep: 0.02,
  dimMax: 0.28,
  dimFadeSec: 3,
  userCycles: [2, 5, 9],
} as const;

// Feed
export const REST = { idleSec: 180, wakeBreathDelaySec: 0.4 } as const;
export const INPUT = {
  swipePx: 40,
  wheelPx: 12,
  wheelGapMs: 250,
  advanceGapMs: 400,
  wheelLineScale: 16,
  wheelPageScale: 400,
} as const;
/** Safety floor: every page is planned for at least this long in any mode. */
export const MIN_PAGE_SEC = 2;
export const CHECKPOINT_EVERY = 10;
/**
 * Feed details the brief leaves open: how long the faint End and Next controls stay bright after a
 * touch, how often pointer moves count as activity, how far a press may move and still be a tap,
 * how long an audio resume may take before the feed shows "Tap to resume", and how long to wait
 * before asking again for a wake lock the browser refused.
 */
export const FEED_UI = {
  controlsAwakeMs: 2500,
  moveActivityEveryMs: 250,
  tapSlopPx: 10,
  resumeTimeoutMs: 2000,
  wakeLockRetryMs: 10_000,
} as const;

// Scoring
export const SCORING = {
  z: 2.0,
  ratio: 1.5,
  neighbors: 8,
  madScale: 1.4826,
  madFloor: 0.12,
  dwellFloor: 0.5,
  shortSession: 6,
  shortRatio: 2,
} as const;

// Memory
export const DECAY = 0.85;
export const PRIORS = { page: { a: 1, b: 1 }, feature: { a: 1, b: 9 } } as const;
export const FEATURE_MULTIPLIER = { min: 0.6, max: 1.8, missingRate: 0.1 } as const;
export const GROUP_CAP = 0.25;
export const MEMORY_CAPS = { pages: 80, loops: 30 } as const;
export const CARRY_SALT = 0x9e3779b9;
/**
 * Addition: a remembered page's stored hex may differ from its rounded OKLCH values by at most this
 * many 8-bit steps per channel (rounding moves it by 1 at most); beyond that it does not return.
 */
export const MEMORY_HEX_TOLERANCE = 2;

// Storage retention (apps/web)
export const RETENTION = { sessions: 50, snapshots: 5, memoryBytes: 64 * 1024 } as const;

// Sandbox viewer
export const SIM = {
  otherBase: 0.2,
  otherSpread: 0.4,
  familyWeight: 0.6,
  noteWeight: 0.4,
  lingerBase: 0.03,
  lingerScale: 0.55,
  lingerPower: 4,
  lingerDwell: [2.5, 3],
  otherDwell: [0.7, 0.6],
  sleepPhase: 6,
  sleepChance: 0.01,
  sleepSec: 200,
} as const;

// Display
export const PAGE_INK = '#0B0E14';
export const MIN_INK_CONTRAST = 4.5;
