import { DRONE_LEVELS, TONE } from '@calm/core';

/** A tone's envelope. Times are seconds after the tone's start time. */
export interface ToneEnvelope {
  /** Peak voice gain: 0.16 x 10^(gainDb / 20). */
  peak: number;
  /** Rise to the peak (the inhale). */
  attack: number;
  /** Nominal fall after the peak (the exhale). */
  release: number;
  /** When the exponential release ramp reaches 0.0001: 0.25 s after attack + release. */
  rampEnd: number;
  /** When both oscillators stop: 0.3 s after attack + release. */
  stopAt: number;
}

export const dbToGain = (db: number): number => 10 ** (db / 20);

/** Envelope of one tone voice lasting dur seconds, with this inhale share. */
export function toneEnvelope(dur: number, gainDb: number, inhale: number): ToneEnvelope {
  const attack = Math.max(TONE.attackFloor, dur * inhale);
  const release = Math.max(TONE.releaseFloor, dur * (1 - inhale));
  return {
    peak: TONE.peak * dbToGain(gainDb),
    attack,
    release,
    rampEnd: attack + release + TONE.rampTail,
    stopAt: attack + release + TONE.stopTail,
  };
}

/** Drone level at this page level: D3 at 0.045 and A2 at 0.03, times 10^(gainDb / 20); 0 for any other note. */
export function droneLevel(midi: number, gainDb: number): number {
  return (DRONE_LEVELS[midi] ?? 0) * dbToGain(gainDb);
}
