import type { AudioEngine, EngineState } from '@calm/audio';
import { generateValid, lingerCycle, PACE_PRESETS } from '@calm/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionDoc } from '../storage/types';
import { FeedController } from './controller';

const session = generateValid({ seed: 9, ...PACE_PRESETS.standard });

/**
 * Records every call; the audio clock sits 100 s into the context. unlock() makes the context run
 * unless `resumable` is false; emit() changes the context state as the browser would.
 */
function fakeEngine() {
  const calls: { method: string; args: unknown[] }[] = [];
  let listener: ((s: EngineState) => void) | null = null;
  let state: EngineState = 'idle';
  const control = { resumable: true };
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  const engine: AudioEngine = {
    unlock: vi.fn(async () => {
      if (control.resumable) state = 'running';
      else if (state === 'idle') state = 'suspended';
      return state === 'running';
    }),
    tone: record('tone'),
    drones: record('drones'),
    setMaster: record('setMaster'),
    now: () => 100,
    close: vi.fn(async () => undefined),
    setVolume: record('setVolume'),
    releaseVoices: record('releaseVoices'),
    fadeDrones: record('fadeDrones'),
    sleep: vi.fn(async () => {
      if (state === 'running') emit('suspended');
    }),
    get state() {
      return state;
    },
    onStateChange: (l) => {
      listener = l;
      return () => (listener = null);
    },
  };
  const emit = (s: EngineState) => {
    state = s;
    listener?.(s);
  };
  return { engine, calls, emit, control };
}

/** Let unlock() promises settle. */
const settle = async () => {
  for (let i = 0; i < 3; i++) await Promise.resolve();
};

/** Move the fake clock without firing timers, like time passing between two inputs. */
const skip = (ms: number) => vi.setSystemTime(Date.now() + ms);

describe('feed controller', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
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
        now: () => Date.now(),
        wallNow: () => 1_700_000_000_000 + Date.now(),
        wakeLock: { set: (on: boolean) => void wake.push(on) },
      },
    );
    const advance = (ms: number) => vi.advanceTimersByTime(ms);
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
    skip(500);
    feed.next();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('pauses on an interruption only after audio has run, and resumes on a tap', async () => {
    const { feed, audio } = setup();
    feed.attach();
    audio.emit('suspended');
    expect(feed.state.status).toBe('idle');
    feed.start();
    await settle();
    audio.emit('interrupted');
    expect(feed.state.status).toBe('paused');
    feed.activity(true);
    await settle();
    expect(feed.state.status).toBe('lingering');
    expect(audio.engine.unlock).toHaveBeenCalledTimes(2);
  });

  it('never pauses when audio could not start at all, so a silent device still scrolls', async () => {
    const { feed, audio } = setup();
    audio.control.resumable = false;
    feed.attach();
    feed.start();
    await settle();
    expect(audio.engine.state).toBe('suspended');
    skip(1000);
    feed.next();
    expect(feed.state.status).toBe('showing');
  });

  it('an interruption while resting pauses the feed as soon as it wakes, even from a pointer move', async () => {
    const { feed, audio, advance } = setup();
    feed.attach();
    feed.start();
    await settle();
    advance(200_000);
    expect(feed.state.status).toBe('resting');
    audio.emit('interrupted');
    expect(feed.state.status).toBe('resting');
    feed.activity(false);
    expect(feed.state.status).toBe('paused');
    feed.activity(true);
    await settle();
    expect(feed.state.status).toBe('lingering');
    expect(audio.engine.state).toBe('running');
  });

  it('a resume that fails returns to "Tap to resume" instead of playing on in silence', async () => {
    const { feed, audio } = setup();
    feed.attach();
    feed.start();
    await settle();
    audio.emit('interrupted');
    expect(feed.state.status).toBe('paused');
    audio.control.resumable = false;
    feed.activity(true);
    expect(feed.state.status).toBe('lingering');
    await settle();
    expect(feed.state.status).toBe('paused');
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

  it('checkpoints the finished pages every 10 pages, dated by its own time', () => {
    const { feed, checkpoints } = setup();
    feed.start();
    for (let i = 0; i < 10; i++) {
      skip(1000);
      feed.next();
    }
    expect(checkpoints).toHaveLength(1);
    const doc = checkpoints[0];
    expect(doc).toMatchObject({ v: 1, id: '01TEST', status: 'open', seed: session.seed, pace: 'standard', lingerMode: 'gradual', totals: null });
    // The page just shown has no time yet, so it is not recorded as a 0 s skip.
    expect(doc.records).toHaveLength(10);
    expect(doc.records[0]).toMatchObject({ index: 0, planned: session.items[0].dwell, dwell: 1, sleep: false, breaths: 0, z: null, linger: false });
    // An open checkpoint carries its own time, so a recovered session is dated when it ran.
    expect(doc.endedAt).toBe(1_700_000_010_000);
  });

  it('a checkpoint on hide also records the page on screen so far', () => {
    const { feed, checkpoints } = setup();
    feed.start();
    skip(4_000);
    feed.dispatch({ type: 'hidden', at: Date.now() });
    expect(checkpoints[0].records).toEqual([expect.objectContaining({ index: 0, dwell: 4 })]);
  });

  it('finishes once: closes audio, drops the wake lock and hands over a done document', () => {
    const { feed, audio, finished, wake } = setup();
    feed.start();
    skip(4000);
    feed.end();
    feed.end();
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ status: 'done', startedAt: 1_700_000_000_000, endedAt: 1_700_000_004_000 });
    expect(finished[0].records).toEqual([expect.objectContaining({ index: 0, dwell: 4 })]);
    expect(audio.engine.close).toHaveBeenCalledWith(0.08);
    expect(wake.at(-1)).toBe(false);
  });

  it('suspends audio once a rest has faded, and a swipe brings it back', async () => {
    const { feed, audio, advance } = setup();
    feed.attach();
    feed.start();
    await settle();
    while (feed.state.status !== 'resting') advance(1000);
    // The rest began within the last second; the master needs 8 time constants of 8 s to fade.
    advance(62_000);
    expect(audio.engine.sleep).not.toHaveBeenCalled();
    advance(3_000);
    expect(audio.engine.sleep).toHaveBeenCalledTimes(1);
    await settle();
    expect(audio.engine.state).toBe('suspended');
    expect(feed.state.status).toBe('resting');
    skip(10);
    feed.next();
    await settle();
    expect(audio.engine.state).toBe('running');
    expect(feed.state.status).toBe('showing');
  });

  it('a rest that ends early never suspends audio', async () => {
    const { feed, audio, advance } = setup();
    feed.start();
    await settle();
    while (feed.state.status !== 'resting') advance(1000);
    advance(30_000);
    feed.activity(true);
    advance(120_000);
    expect(audio.engine.sleep).not.toHaveBeenCalled();
  });

  it('a resume that never settles counts as failed after 2 s', async () => {
    const { feed, audio, advance } = setup();
    feed.attach();
    feed.start();
    await settle();
    audio.emit('interrupted');
    vi.mocked(audio.engine.unlock).mockImplementationOnce(() => new Promise<boolean>(() => undefined));
    feed.activity(true);
    expect(feed.state.status).toBe('lingering');
    advance(1_999);
    await settle();
    expect(feed.state.status).toBe('lingering');
    advance(1);
    await settle();
    expect(feed.state.status).toBe('paused');
  });

  it('on pagehide, saves a checkpoint with the page on screen before ending', () => {
    const { feed, checkpoints, finished } = setup();
    feed.attach();
    feed.start();
    skip(6_500);
    const onPageHide = vi.mocked(window.addEventListener).mock.calls.find(([type]) => type === 'pagehide')![1] as () => void;
    onPageHide();
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].records).toEqual([expect.objectContaining({ index: 0, dwell: 6.5 })]);
    expect(finished).toHaveLength(1);
    expect(finished[0].status).toBe('done');
  });

  it('passes volume changes to the engine', () => {
    const { feed, audio } = setup();
    feed.setVolume(-12);
    expect(audio.calls).toContainEqual({ method: 'setVolume', args: [-12] });
  });
});
