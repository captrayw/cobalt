/** Lifecycle of the engine's AudioContext. "idle" means no context has been created yet. */
export type EngineState = 'idle' | 'running' | 'suspended' | 'interrupted' | 'closed';

/**
 * The sound engine behind the feed and the preview. Times are AudioContext seconds, so tests can
 * render offline and a native client can swap the implementation.
 */
export interface AudioEngine {
  /** Create or resume the context. Call inside the first tap or key press. */
  unlock(): Promise<boolean>;
  /** One voice: a sine at hz plus its second harmonic, with an inhale-weighted envelope. */
  tone(hz: number, at: number, dur: number, gainDb: number, inhale: number): void;
  /** Sustain these MIDI notes as drones at the page level; new drones fade in over 3 s. */
  drones(midis: readonly number[], gainDb: number, at: number): void;
  /** Master gain target (0.9 normal, 0.0001 silent). Cancels scheduled master automation first. */
  setMaster(target: number, timeConstant: number): void;
  /** AudioContext.currentTime, or 0 before unlock. */
  now(): number;
  /**
   * Fade the master to silence with this time constant (default 0.08 s), then close the context
   * closeAfterSec later (default 0.5 s; the preview uses 0.06 s and 0.45 s).
   */
  close(fadeSec?: number, closeAfterSec?: number): Promise<void>;

  // Additions to the brief's interface, used by the feed and the developer preview.
  /** User volume from -30 to 0 dB. It can never boost. */
  setVolume(db: number): void;
  /** Fade every sounding tone (not the drones) with this time constant, as on a page change. */
  releaseVoices(timeConstant: number): void;
  /** Fade the drones out with this time constant, as at the end of a preview. */
  fadeDrones(timeConstant: number): void;
  readonly state: EngineState;
  /** Called whenever the context state changes; returns an unsubscribe function. */
  onStateChange(listener: (state: EngineState) => void): () => void;
}
