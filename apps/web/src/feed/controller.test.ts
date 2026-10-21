import type { AudioEngine, EngineState } from '@calm/audio';
import { generateValid, lingerCycle, PACE_PRESETS } from '@calm/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionDoc } from '../storage/types';
import { FeedController } from './controller';

const session = generateValid({ seed: 9, ...PACE_PRESETS.standard });

/** Records every call; the audio clock sits 100 s into the context. */
function fakeEngine() {
  const calls: { method: string; args: unknown[] }[] = [];
  let listener: ((s: EngineState) => void) | null = null;
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  const engine: AudioEngine = {
    unlock: vi.fn(async () => true),
    tone: record('tone'),
    drones: record('drones'),
    setMaster: record('setMaster'),
    now: () => 100,
    close: vi.fn(async () => undefined),
    setVolume: record('setVolume'),
    releaseVoices: record('releaseVoices'),
    fadeDrones: record('fadeDrones'),
    state: 'running',
    onStateChange: (l) => {
      listener = l;
      return () => (listener = null);
    },
  };
  return { engine, calls, emit: (s: EngineState) => listener?.(s) };
}

describe('feed controller', () => {
  let clock = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    clock = 0;
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup() {
    const audio = fakeEngine();
    const checkpoints: SessionDoc[] = [];
    const finished: SessionDoc[] = [];
    const wake: boolean[] = [];
    const feed = new FeedController(
      { id: '01TEST', session, mode: 'gradual', pace: 'standard', useMemory: true },
      {
        engine: audio.engine,
        hooks: { checkpoint: (d) => checkpoints.push(d), finish: (d) => finished.push(d) },
        now: () => clock,
        wallNow: () => 1_700_000_000_000 + clock,
        wakeLock: { set: (on: boolean) => void wake.push(on) },
      },
    );
    const advance = (ms: number) => {
      clock += ms;
      vi.advanceTimersByTime(ms);
    };
    return { feed, audio, checkpoints, finished, wake, advance };
  }

  it('starts inside the gesture: unlocks audio and schedules the first tone 30 ms ahead', () => {
    const { feed, audio, wake } = setup();
    feed.start();
    expect(audio.engine.unlock).toHaveBeenCalledTimes(1);
    const p = session.items[0];
    expect(audio.calls).toContainEqual({ method: 'tone', args: [p.hz, 100.03, p.dwell, p.gainDb, 0.4] });
    expect(audio.calls).toContainEqual({ method: 'drones', args: [p.drone, p.gainDb, 100.03] });
    expect(wake.at(-1)).toBe(true);
    expect(feed.getView()).toMatchObject({ status: 'showing', index: 0, total: session.items.length });
  });

  it('runs the single timer: the planned dwell, then breaths of lingerCycle length', () => {
    const { feed, audio, advance } = setup();
    feed.start();
    const p = session.items[0];
    advance(p.dwell * 1000 - 1);
    expect(feed.state.status).toBe('showing');
    advance(1);
    expect(feed.state.status).toBe('lingering');
    const breath = audio.calls.filter((c) => c.method === 'tone')[1];
    expect(breath.args[2]).toBeCloseTo(lingerCycle(p.dwell, 1, 'gradual'), 12);
    advance(lingerCycle(p.dwell, 1, 'gradual') * 1000);
    expect(feed.state.breath).toBe(2);
  });

  it('notifies listeners only when the view changes', () => {
    const { feed } = setup();
    const listener = vi.fn();
    feed.subscribe(listener);
    feed.start();
    expect(listener).toHaveBeenCalledTimes(1);
    feed.activity(false);
    feed.activity(true);
    expect(listener).toHaveBeenCalledTimes(1);
    clock += 500;
    feed.next();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('pauses on an interruption only after audio has run, and resumes on a tap', async () => {
    const { feed, audio } = setup();
    feed.attach();
    audio.emit('suspended');
    expect(feed.state.status).toBe('idle');
    feed.start();
    await vi.waitFor(() => expect(audio.engine.unlock).toHaveBeenCalled());
    await Promise.resolve();
    audio.emit('interrupted');
    expect(feed.state.status).toBe('paused');
    feed.activity(true);
    expect(feed.state.status).toBe('lingering');
    expect(audio.engine.unlock).toHaveBeenCalledTimes(2);
  });

  it('releases the wake lock while resting, and asks again on waking', () => {
    const { feed, wake, advance } = setup();
    feed.start();
    advance(200_000);
    expect(feed.state.status).toBe('resting');
    expect(wake.at(-1)).toBe(false);
    feed.activity(true);
    expect(wake.at(-1)).toBe(true);
  });

  it('checkpoints an open document that includes the page on screen', () => {
    const { feed, checkpoints } = setup();
    feed.start();
    for (let i = 0; i < 10; i++) {
      clock += 1000;
      feed.next();
    }
    expect(checkpoints).toHaveLength(1);
    const doc = checkpoints[0];
    expect(doc).toMatchObject({ v: 1, id: '01TEST', status: 'open', seed: session.seed, pace: 'standard', lingerMode: 'gradual', endedAt: null, totals: null });
    expect(doc.records).toHaveLength(11);
    expect(doc.records[0]).toMatchObject({ index: 0, planned: session.items[0].dwell, dwell: 1, sleep: false, breaths: 0, z: null, linger: false });
    expect(doc.records[10].dwell).toBe(0);
  });

  it('finishes once: closes audio, drops the wake lock and hands over a done document', () => {
    const { feed, audio, finished, wake } = setup();
    feed.start();
    clock += 4000;
    feed.end();
    feed.end();
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ status: 'done', startedAt: 1_700_000_000_000, endedAt: 1_700_000_004_000 });
    expect(finished[0].records).toEqual([expect.objectContaining({ index: 0, dwell: 4 })]);
    expect(audio.engine.close).toHaveBeenCalledWith(0.08);
    expect(wake.at(-1)).toBe(false);
  });

  it('passes volume changes to the engine', () => {
    const { feed, audio } = setup();
    feed.setVolume(-12);
    expect(audio.calls).toContainEqual({ method: 'setVolume', args: [-12] });
  });
});
