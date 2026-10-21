import { CLOSE_AFTER_SEC, DRONE_FADE, DRONE_FADE_TCS, MASTER_TC, SCHEDULE, TONE, type Session } from '@calm/core';
import type { AudioEngine } from './engine.ts';

export type PreviewSpeed = 1 | 10;

export interface PreviewCallbacks {
  /** A page's sound starts (0-based index). */
  onPage?(index: number): void;
  /** The preview ended or was stopped. */
  onEnd?(): void;
}

/**
 * Plays a whole session at 1x or 10x for listening checks on the developer screen. Timers only
 * decide what to schedule; every sound is placed on the AudioContext clock.
 */
export class PreviewPlayer {
  private engine: AudioEngine | null = null;
  private callbacks: PreviewCallbacks = {};
  private interval: ReturnType<typeof setInterval> | null = null;
  private readonly timeouts = new Set<ReturnType<typeof setTimeout>>();

  get playing(): boolean {
    return this.engine !== null;
  }

  /** Call inside the press: the engine is unlocked there, and the first page sounds 150 ms later. */
  play(session: Session, speed: PreviewSpeed, engine: AudioEngine, callbacks: PreviewCallbacks = {}): void {
    this.stop();
    this.engine = engine;
    this.callbacks = callbacks;
    void engine.unlock().then((ok) => {
      if (!ok && this.engine === engine) this.stop();
    });

    const items = session.items;
    const origin = engine.now() + SCHEDULE.previewStartDelay;
    const last = items[items.length - 1];
    const endTime = origin + (last.start + last.dwell) / speed;
    let next = 0;
    let finishing = false;

    const tick = () => {
      if (this.engine !== engine) return;
      const now = engine.now();
      while (next < items.length) {
        const index = next;
        const page = items[index];
        const due = origin + page.start / speed;
        if (due > now + SCHEDULE.previewLookahead) break;
        const at = Math.max(due, now + SCHEDULE.previewMinLead);
        engine.tone(page.hz, at, page.dwell / speed, page.gainDb, TONE.pageInhale);
        engine.drones(page.drone, page.gainDb, at);
        this.later((at - now) * 1000, () => this.callbacks.onPage?.(index));
        next += 1;
      }
      if (next === items.length && !finishing && now >= endTime) {
        finishing = true;
        const timeConstant = DRONE_FADE.previewEndTc / speed;
        engine.fadeDrones(timeConstant);
        this.later(DRONE_FADE_TCS * timeConstant * 1000, () => this.stop());
      }
    };

    tick();
    this.interval = setInterval(tick, SCHEDULE.previewTick * 1000);
  }

  /** Stops with a 0.06 s master time constant and closes the context 0.45 s later. */
  stop(): void {
    const engine = this.engine;
    if (!engine) return;
    this.engine = null;
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
    for (const id of this.timeouts) clearTimeout(id);
    this.timeouts.clear();
    void engine.close(MASTER_TC.previewStop, CLOSE_AFTER_SEC.preview);
    const { onEnd } = this.callbacks;
    this.callbacks = {};
    onEnd?.();
  }

  private later(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.timeouts.delete(id);
      fn();
    }, Math.max(0, ms));
    this.timeouts.add(id);
  }
}
