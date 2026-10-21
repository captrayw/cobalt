import { generateValid, PACE_PRESETS, type Session } from '@calm/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewPlayer, type AudioEngine, type EngineState } from '../src/index.ts';

interface Call {
  name: string;
  now: number;
  args: unknown[];
}

/** An engine that records every call and whose clock the test moves by hand. */
class FakeEngine implements AudioEngine {
  t = 0;
  calls: Call[] = [];
  state: EngineState = 'running';
  private record(name: string, args: unknown[]) {
    this.calls.push({ name, now: this.t, args });
  }
  async unlock() {
    this.record('unlock', []);
    return true;
  }
  tone(...args: unknown[]) {
    this.record('tone', args);
  }
  voice(...args: unknown[]) {
    this.record('voice', args);
    return true;
  }
  breath(...args: unknown[]) {
    this.record('breath', args);
  }
  drones(...args: unknown[]) {
    this.record('drones', args);
  }
  setMaster(...args: unknown[]) {
    this.record('setMaster', args);
  }
  now() {
    return this.t;
  }
  async close(...args: unknown[]) {
    this.record('close', args);
  }
  setVolume(...args: unknown[]) {
    this.record('setVolume', args);
  }
  releaseVoices(...args: unknown[]) {
    this.record('releaseVoices', args);
  }
  fadeDrones(...args: unknown[]) {
    this.record('fadeDrones', args);
  }
  async sleep() {
    this.record('sleep', []);
  }
  onStateChange() {
    return () => {};
  }
  named(name: string) {
    return this.calls.filter((c) => c.name === name);
  }
}

/** Advances the engine clock and the fake timers together, 10 ms at a time. */
function run(engine: FakeEngine, seconds: number) {
  const steps = Math.round(seconds * 100);
  for (let i = 0; i < steps; i++) {
    engine.t = Math.round((engine.t + 0.01) * 1000) / 1000;
    vi.advanceTimersByTime(10);
  }
}

const session: Session = generateValid({ seed: 1, ...PACE_PRESETS.standard });
const lastEnd = session.items[session.items.length - 1].start + session.items[session.items.length - 1].dwell;

describe('PreviewPlayer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays the whole session at 10x on the audio clock, then fades the drones and stops', async () => {
    const engine = new FakeEngine();
    const pages: number[] = [];
    let ended = 0;
    const player = new PreviewPlayer();
    player.play(session, 10, engine, { onPage: (i) => pages.push(i), onEnd: () => (ended += 1) });
    await Promise.resolve();
    run(engine, lastEnd / 10 + 1.5);

    const tones = engine.named('tone');
    expect(tones).toHaveLength(session.items.length);
    tones.forEach((call, i) => {
      const page = session.items[i];
      const [hz, at, dur, gainDb, inhale] = call.args as number[];
      const due = 0.15 + page.start / 10;
      expect(hz).toBe(page.hz);
      expect(dur).toBeCloseTo(page.dwell / 10, 12);
      expect(gainDb).toBe(page.gainDb);
      expect(inhale).toBe(0.4);
      // Scheduled within the 0.7 s lookahead, never sooner than 20 ms ahead.
      expect(due - call.now).toBeLessThanOrEqual(0.7 + 1e-9);
      expect(at).toBeCloseTo(Math.max(due, call.now + 0.02), 12);
      expect(at - call.now).toBeGreaterThanOrEqual(0.02 - 1e-9);
    });
    // The first page sounds 150 ms after the press.
    expect((tones[0].args as number[])[1]).toBeCloseTo(0.15, 12);
    expect(engine.named('drones').map((c) => c.args[0])).toEqual(session.items.map((p) => p.drone));
    expect(pages).toEqual(session.items.map((_, i) => i));

    const [fade] = engine.named('fadeDrones');
    expect(fade.args[0]).toBeCloseTo(0.06, 12);
    expect(fade.now).toBeGreaterThanOrEqual(0.15 + lastEnd / 10 - 1e-9);
    const [close] = engine.named('close');
    expect(close.args).toEqual([0.06, 0.45]);
    expect(close.now).toBeGreaterThan(fade.now);
    expect(ended).toBe(1);
    expect(player.playing).toBe(false);
  });

  it('at 1x the drones fade with a 0.6 s time constant', async () => {
    const engine = new FakeEngine();
    const player = new PreviewPlayer();
    const short: Session = { ...session, items: session.items.slice(0, 3) };
    player.play(short, 1, engine);
    await Promise.resolve();
    const end = short.items[2].start + short.items[2].dwell;
    run(engine, end + 4);
    expect(engine.named('fadeDrones')[0].args[0]).toBeCloseTo(0.6, 12);
    expect(engine.named('close')).toHaveLength(1);
  });

  it('stop() stops at once with a 0.06 s master fade, closes 0.45 s later, and schedules nothing more', async () => {
    const engine = new FakeEngine();
    let ended = 0;
    const player = new PreviewPlayer();
    player.play(session, 1, engine, { onEnd: () => (ended += 1) });
    await Promise.resolve();
    run(engine, 5);
    const scheduled = engine.named('tone').length;
    player.stop();
    run(engine, 5);
    expect(engine.named('tone')).toHaveLength(scheduled);
    expect(engine.named('close').map((c) => c.args)).toEqual([[0.06, 0.45]]);
    expect(ended).toBe(1);
    player.stop();
    expect(ended).toBe(1);
  });

  it('gives up when the engine cannot unlock', async () => {
    const engine = new FakeEngine();
    engine.unlock = async () => false;
    let ended = 0;
    new PreviewPlayer().play(session, 10, engine, { onEnd: () => (ended += 1) });
    await Promise.resolve();
    await Promise.resolve();
    expect(ended).toBe(1);
  });
});
