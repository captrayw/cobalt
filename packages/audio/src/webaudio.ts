import {
  CLOSE_AFTER_SEC,
  DRONE_FADE,
  FADE_TCS,
  LOWPASS,
  MASTER,
  MASTER_TC,
  midiToHz,
  SCHEDULE,
  TONE,
  USER_VOLUME_DB,
  VOLUME_TC,
} from '@calm/core';
import type { AudioEngine, EngineState } from './engine.ts';
import { dbToGain, droneLevel, toneEnvelope } from './envelope.ts';
import { TrackedParam } from './param.ts';

export interface WebAudioEngineOptions {
  /** Render into this context instead of creating one in unlock(); tests pass an OfflineAudioContext. */
  context?: BaseAudioContext;
  /** User volume, -30 to 0 dB. */
  volumeDb?: number;
}

/** The fixed part of the signal graph: voices and drones -> user -> master -> low-pass -> destination. */
export interface EngineNodes {
  user: GainNode;
  master: GainNode;
  filter: BiquadFilterNode;
}

interface Voice {
  oscillators: OscillatorNode[];
  gain: TrackedParam;
  startAt: number;
  stopAt: number;
}

interface Drone {
  oscillator: OscillatorNode;
  gain: TrackedParam;
  startAt: number;
}

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };
type LegacyWindow = typeof globalThis & { webkitAudioContext?: typeof AudioContext };

const clampVolumeDb = (db: number): number =>
  Number.isFinite(db) ? Math.min(USER_VOLUME_DB.max, Math.max(USER_VOLUME_DB.min, db)) : USER_VOLUME_DB.default;

const isOffline = (ctx: BaseAudioContext): boolean => typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;

function stateOf(ctx: BaseAudioContext | null): EngineState {
  if (!ctx) return 'idle';
  const state: string = ctx.state;
  return state === 'running' || state === 'closed' || state === 'interrupted' ? state : 'suspended';
}

function stopQuietly(node: AudioScheduledSourceNode, when: number): void {
  try {
    node.stop(when);
  } catch {
    // Already stopped: nothing left to do.
  }
}

/**
 * Web Audio implementation: every sound is synthesized live and scheduled on the AudioContext
 * clock, 30 ms after currentTime. Every gain change is a ramp, so page changes stay click-free.
 */
export class WebAudioEngine implements AudioEngine {
  private ctx: BaseAudioContext | null = null;
  private graph: EngineNodes | null = null;
  private user: TrackedParam | null = null;
  private master: TrackedParam | null = null;
  private volume: number;
  private readonly voices = new Set<Voice>();
  private readonly droneVoices = new Map<number, Drone>();
  private readonly listeners = new Set<(state: EngineState) => void>();
  private closing: Promise<void> | null = null;
  /** The context has run at least once. */
  private ran = false;

  constructor(options: WebAudioEngineOptions = {}) {
    this.volume = clampVolumeDb(options.volumeDb ?? USER_VOLUME_DB.default);
    if (options.context) this.attach(options.context);
  }

  get state(): EngineState {
    return stateOf(this.ctx);
  }

  /** The fixed nodes, for tests and analysis; null before unlock. */
  get nodes(): EngineNodes | null {
    return this.graph;
  }

  get context(): BaseAudioContext | null {
    return this.ctx;
  }

  get volumeDb(): number {
    return this.volume;
  }

  private attach(ctx: BaseAudioContext): void {
    const user = ctx.createGain();
    const master = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = LOWPASS.hz;
    filter.Q.value = LOWPASS.q;
    user.connect(master).connect(filter).connect(ctx.destination);
    this.user = new TrackedParam(user.gain, dbToGain(this.volume));
    this.master = new TrackedParam(master.gain, MASTER.normal);
    this.graph = { user, master, filter };
    this.ctx = ctx;
    ctx.addEventListener('statechange', () => {
      const state = stateOf(ctx);
      if (state === 'running') this.ran = true;
      for (const listener of this.listeners) listener(state);
    });
  }

  /** Creates or resumes the context. Everything before the first await runs inside the user gesture. */
  async unlock(): Promise<boolean> {
    if (!this.ctx) {
      // iOS 17+: keep Web Audio audible with the ringer switch off. Set before the first sound.
      const session = typeof navigator === 'undefined' ? undefined : (navigator as AudioSessionNavigator).audioSession;
      if (session) {
        try {
          session.type = 'playback';
        } catch {
          // Older engines reject the setting; sound still plays with the ringer on.
        }
      }
      const Ctor = globalThis.AudioContext ?? (globalThis as LegacyWindow).webkitAudioContext;
      if (!Ctor) return false;
      this.attach(new Ctor());
    }
    const ctx = this.ctx as BaseAudioContext;
    if (isOffline(ctx)) return true;
    if (ctx.state === 'closed') return false;
    if (ctx.state !== 'running') {
      try {
        await (ctx as AudioContext).resume();
      } catch {
        return false;
      }
    }
    return stateOf(ctx) === 'running';
  }

  now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private live(): { ctx: BaseAudioContext; graph: EngineNodes } | null {
    if (!this.ctx || !this.graph || this.ctx.state === 'closed' || this.closing) return null;
    return { ctx: this.ctx, graph: this.graph };
  }

  /**
   * Voices are scheduled before the context first runs (the first page tone waits for the unlock),
   * but not once a running context has stopped: its clock is frozen, so every tone queued then
   * would start at the same moment when it resumes.
   */
  private canVoice(ctx: BaseAudioContext): boolean {
    // An offline render suspends itself on purpose, to let callers schedule mid-render.
    if (isOffline(ctx)) return true;
    if (ctx.state === 'running') this.ran = true;
    return !this.ran || ctx.state === 'running';
  }

  tone(hz: number, at: number, dur: number, gainDb: number, inhale: number): void {
    const live = this.live();
    if (!live || !this.canVoice(live.ctx)) return;
    const { ctx, graph } = live;
    const env = toneEnvelope(dur, gainDb, inhale);
    const voiceGain = ctx.createGain();
    const gain = new TrackedParam(voiceGain.gain, TONE.floor);
    gain.setValueAtTime(TONE.floor, at);
    gain.exponentialRampToValueAtTime(Math.max(TONE.floor, env.peak), at + env.attack);
    gain.exponentialRampToValueAtTime(TONE.floor, at + env.rampEnd);

    const fundamental = ctx.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.value = hz;
    const overtone = ctx.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.value = 2 * hz;
    const overtoneGain = ctx.createGain();
    overtoneGain.gain.value = TONE.harmonic;
    fundamental.connect(voiceGain);
    overtone.connect(overtoneGain).connect(voiceGain);
    voiceGain.connect(graph.user);

    const voice: Voice = { oscillators: [fundamental, overtone], gain, startAt: at, stopAt: at + env.stopAt };
    for (const osc of voice.oscillators) {
      osc.start(at);
      osc.stop(voice.stopAt);
    }
    this.voices.add(voice);
    fundamental.onended = () => {
      this.voices.delete(voice);
      voiceGain.disconnect();
      overtoneGain.disconnect();
    };
  }

  drones(midis: readonly number[], gainDb: number, at: number): void {
    const live = this.live();
    if (!live || !this.canVoice(live.ctx)) return;
    const { ctx, graph } = live;
    const wanted = new Map<number, number>();
    for (const midi of midis) {
      const level = droneLevel(midi, gainDb);
      if (level > 0) wanted.set(midi, level);
    }
    for (const [midi, level] of wanted) {
      const drone = this.droneVoices.get(midi);
      if (!drone) {
        // A new drone fades in exponentially over 3 s from 0.0001.
        const droneGain = ctx.createGain();
        const gain = new TrackedParam(droneGain.gain, TONE.floor);
        gain.setValueAtTime(TONE.floor, at);
        gain.exponentialRampToValueAtTime(level, at + DRONE_FADE.inSec);
        const oscillator = ctx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = midiToHz(midi);
        oscillator.connect(droneGain).connect(graph.user);
        oscillator.start(at);
        oscillator.onended = () => droneGain.disconnect();
        this.droneVoices.set(midi, { oscillator, gain, startAt: at });
      } else if (drone.startAt >= at) {
        // Not sounding yet: keep the fade-in, aimed at the new level.
        drone.gain.hold(drone.startAt, ctx.currentTime);
        drone.gain.exponentialRampToValueAtTime(level, drone.startAt + DRONE_FADE.inSec);
      } else {
        // On later pages, ramp linearly to the new level over 0.2 s.
        drone.gain.hold(at, ctx.currentTime);
        drone.gain.linearRampToValueAtTime(level, at + DRONE_FADE.rampSec);
      }
    }
    for (const [midi, drone] of this.droneVoices) {
      if (!wanted.has(midi)) this.retireDrone(midi, drone, at, DRONE_FADE.rampSec);
    }
  }

  private retireDrone(midi: number, drone: Drone, at: number, timeConstant: number): void {
    this.droneVoices.delete(midi);
    if (drone.startAt >= at) {
      stopQuietly(drone.oscillator, drone.startAt);
      return;
    }
    drone.gain.hold(at, this.now());
    drone.gain.setTargetAtTime(TONE.floor, at, timeConstant);
    stopQuietly(drone.oscillator, at + FADE_TCS * timeConstant);
  }

  setMaster(target: number, timeConstant: number): void {
    const live = this.live();
    if (!live || !this.master) return;
    const now = live.ctx.currentTime;
    const at = now + SCHEDULE.offset;
    this.master.hold(at, now);
    this.master.setTargetAtTime(Math.max(0, target), at, timeConstant);
  }

  setVolume(db: number): void {
    this.volume = clampVolumeDb(db);
    const live = this.live();
    if (!live || !this.user) return;
    const now = live.ctx.currentTime;
    const at = now + SCHEDULE.offset;
    this.user.hold(at, now);
    this.user.setTargetAtTime(dbToGain(this.volume), at, VOLUME_TC);
  }

  releaseVoices(timeConstant: number): void {
    const live = this.live();
    if (!live) return;
    const now = live.ctx.currentTime;
    const at = now + SCHEDULE.offset;
    const end = at + FADE_TCS * timeConstant;
    for (const voice of this.voices) {
      if (voice.stopAt <= at) continue;
      if (voice.startAt >= at) {
        // Scheduled but not started: it never sounds.
        for (const osc of voice.oscillators) stopQuietly(osc, voice.startAt);
        voice.stopAt = voice.startAt;
        continue;
      }
      voice.gain.hold(at, now);
      voice.gain.setTargetAtTime(TONE.floor, at, timeConstant);
      if (end < voice.stopAt) {
        for (const osc of voice.oscillators) stopQuietly(osc, end);
        voice.stopAt = end;
      }
    }
  }

  fadeDrones(timeConstant: number): void {
    const live = this.live();
    if (!live) return;
    const at = live.ctx.currentTime + SCHEDULE.offset;
    for (const [midi, drone] of this.droneVoices) this.retireDrone(midi, drone, at, timeConstant);
  }

  async sleep(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || isOffline(ctx) || ctx.state !== 'running' || this.closing) return;
    try {
      await (ctx as AudioContext).suspend();
    } catch {
      // Already suspended or closing.
    }
  }

  close(fadeSec: number = MASTER_TC.end, closeAfterSec: number = CLOSE_AFTER_SEC.end): Promise<void> {
    if (this.closing) return this.closing;
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return Promise.resolve();
    this.setMaster(MASTER.silent, fadeSec);
    this.closing = isOffline(ctx)
      ? Promise.resolve()
      : new Promise<void>((resolve) => setTimeout(resolve, closeAfterSec * 1000))
          .then(() => (ctx as AudioContext).close())
          .catch(() => undefined)
          .then(() => {
            this.voices.clear();
            this.droneVoices.clear();
          });
    return this.closing;
  }

  onStateChange(listener: (state: EngineState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
