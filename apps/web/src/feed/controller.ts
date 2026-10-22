import type { AudioEngine, EngineState } from '@calm/audio';
import {
  FADE_TCS,
  FEED_UI,
  MASTER,
  MASTER_TC,
  PACE_PRESETS,
  SCHEDULE,
  sliceForPace,
  VOICE,
  type DwellRecord,
  type LingerMode,
  type Memory,
  type Page,
  type PaceId,
  type Session,
} from '@calm/core';
import { watchPageHide, watchVisibility } from '../platform/visibility';
import { WakeLockManager } from '../platform/wakeLock';
import type { SessionDoc, SessionRecordDoc, SessionStatus } from '../storage/types';
import { breathLevelDb, createFeedState, currentRecord, dimFor, isActive, reduce } from './reducer';
import type { FeedEffect, FeedEvent, FeedState, FeedStatus, FeedTimer } from './types';

/** What the feed screen draws. Listeners are only told when one of these changes. */
export interface FeedView {
  status: FeedStatus;
  index: number;
  total: number;
  page: Page;
  breath: number;
  dim: number;
  /** When the page was shown, ms, so the progress hairline restarts per page. */
  t0: number;
  /**
   * The session opened without a touch and no sound has played yet. A browser starts sound only
   * from a touch, and iPhone Safari counts a tap but not a swipe, so the screen asks for a tap.
   */
  awaitingSound: boolean;
}

export interface FeedSetup {
  id: string;
  session: Session;
  mode: LingerMode;
  pace: PaceId;
  useMemory: boolean;
  /** Memory as it was when the session started (null with the switch off), for pace slicing. */
  memory: Memory | null;
  /** Start in night colors. */
  night: boolean;
}

export interface FeedHooks {
  /** Save an in-progress copy of the session (every 10 pages and whenever the page is hidden). */
  checkpoint(doc: SessionDoc): void;
  /** The session ended: score, learn and save it. */
  finish(doc: SessionDoc): void;
}

export interface FeedDeps {
  engine: AudioEngine;
  hooks: FeedHooks;
  /** Monotonic ms; performance.now by default. */
  now?: () => number;
  /** Epoch ms; Date.now by default. */
  wallNow?: () => number;
  wakeLock?: Pick<WakeLockManager, 'set'>;
}

const toRecordDoc = (r: DwellRecord): SessionRecordDoc => ({
  index: r.k,
  planned: r.item.dwell,
  dwell: r.dwell,
  sleep: r.sleep,
  breaths: r.cycles,
  z: null,
  linger: false,
  item: r.item,
  night: r.night ?? false,
});

const sameView = (a: FeedView, b: FeedView): boolean =>
  a.status === b.status &&
  a.index === b.index &&
  a.total === b.total &&
  a.breath === b.breath &&
  a.dim === b.dim &&
  a.t0 === b.t0 &&
  a.awaitingSound === b.awaitingSound;

/** Runs the reducer's effects: sound, the single timer, the wake lock, checkpoints and pace slicing. */
export class FeedController {
  private s: FeedState;
  private view: FeedView;
  private readonly listeners = new Set<() => void>();
  private readonly engine: AudioEngine;
  private readonly hooks: FeedHooks;
  private readonly now: () => number;
  private readonly wallNow: () => number;
  private readonly wake: Pick<WakeLockManager, 'set'>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerFor: FeedTimer | null = null;
  /** Audio has run at least once this session; only then can a stopped context pause the feed. */
  private audioRan = false;
  /** The session started inside a tap or key press (or in the iPhone app), so its sound did too. */
  private startedByGesture = false;
  /** An unlock or resume is in flight. */
  private resuming = false;
  /** Index of the page whose voice is sounding, or -1. */
  private voiced = -1;
  /** Suspends the context once a rest has faded out. */
  private restSleep: ReturnType<typeof setTimeout> | null = null;
  /** Cancels a pending pace check. */
  private paceTask: (() => void) | null = null;
  private wallStart = 0;
  private detachers: (() => void)[] = [];

  constructor(
    readonly setup: FeedSetup,
    deps: FeedDeps,
  ) {
    this.engine = deps.engine;
    this.hooks = deps.hooks;
    this.now = deps.now ?? (() => performance.now());
    this.wallNow = deps.wallNow ?? (() => Date.now());
    this.wake = deps.wakeLock ?? new WakeLockManager();
    this.s = createFeedState(setup.session, setup.mode, setup.night);
    this.view = this.computeView();
  }

  get state(): FeedState {
    return this.s;
  }

  /** The audio engine's state: idle until the first touch creates the context. */
  get audioState(): EngineState {
    return this.engine.state;
  }

  getView = (): FeedView => this.view;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Start showing pages. Inside a tap or key press (`gesture`), audio unlocks at once; otherwise
   * (opening the app) the colors start now and the sound with the first touch, swipe or key.
   */
  start(gesture = true): void {
    this.wallStart = this.wallNow();
    this.startedByGesture = gesture;
    this.dispatch({ type: 'start', at: this.now(), gesture });
  }

  setVolume(db: number): void {
    this.engine.setVolume(db);
  }

  /** Day or night colors from now on. The screen paints them; the records note them. */
  setNight(night: boolean): void {
    this.dispatch({ type: 'night', at: this.now(), night });
  }

  next = (): void => {
    this.resumeIfStopped();
    this.dispatch({ type: 'next', at: this.now() });
  };
  end = (): void => this.dispatch({ type: 'end', at: this.now() });
  activity = (gesture: boolean): void => {
    if (gesture) this.resumeIfStopped();
    this.dispatch({ type: 'activity', at: this.now(), gesture });
  };
  /**
   * Another chance to start audio, from a touchend or click on the feed. Swipes and taps are read on
   * pointerup, but iOS may only count touchend or click as the gesture that lets sound start, so a
   * try still in flight from pointerup is asked again here. That first try still settles the outcome.
   */
  unlock = (): void => {
    if (!isActive(this.s)) return;
    const audio: EngineState = this.engine.state;
    if (audio !== 'idle' && audio !== 'suspended' && audio !== 'interrupted') return;
    if (this.resuming) void this.engine.unlock();
    else this.unlockAudio();
  };

  dispatch(event: FeedEvent): void {
    const { state, effects } = reduce(this.s, event);
    if (state === this.s && effects.length === 0) return;
    const was = this.s.status;
    this.s = state;
    this.syncTimer();
    // The screen stays on in Showing and Lingering while the page is visible; resting lets it sleep.
    this.wake.set(!state.hidden && (state.status === 'showing' || state.status === 'lingering'));
    if (state.status !== was) this.syncRestSleep();
    this.run(effects);
    this.refreshView();
    this.checkAudio();
  }

  /**
   * In Showing or Lingering, an audio context that has run before but is not running now (a call,
   * another app, a resume that failed, or an interruption while resting) moves the feed to Paused,
   * which shows "Tap to resume". A resume still in flight is given time to finish.
   */
  private checkAudio(): void {
    const status = this.s.status;
    if (status !== 'showing' && status !== 'lingering') return;
    if (!this.audioRan || this.resuming) return;
    const audio: EngineState = this.engine.state;
    if (audio === 'suspended' || audio === 'interrupted') this.dispatch({ type: 'interrupted', at: this.now() });
  }

  /** Create or resume the context. A resume that has not settled after a while counts as failed. */
  private unlockAudio(): void {
    if (this.resuming) return;
    this.resuming = true;
    const settled = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), FEED_UI.resumeTimeoutMs));
    void Promise.race([this.engine.unlock(), settled]).then((running) => {
      this.resuming = false;
      if (running || this.engine.state === 'running') this.onAudioRunning();
      else this.checkAudio();
    });
  }

  /**
   * Audio is running. If the page's voice could not start while audio was off (before the first
   * touch, or a page changed while audio was stopped), bring it in now, with its drones.
   */
  private onAudioRunning(): void {
    this.audioRan = true;
    this.refreshView();
    const s = this.s;
    if ((s.status !== 'showing' && s.status !== 'lingering') || s.muted || this.voiced === s.index) return;
    const page = s.session.items[s.index];
    const at = this.engine.now() + SCHEDULE.offset;
    this.engine.setMaster(MASTER.normal, MASTER_TC.wake);
    if (this.engine.voice(page.hz, breathLevelDb(s), at, VOICE.resumeFadeSec)) this.voiced = s.index;
    this.engine.drones(page.drone, page.gainDb, at);
  }

  /** A tap, key or swipe is the chance to start audio, or to bring back audio that stopped. */
  private resumeIfStopped(): void {
    const audio: EngineState = this.engine.state;
    if (audio === 'idle' || audio === 'suspended' || audio === 'interrupted') this.unlockAudio();
  }

  /** While resting, suspend the context once the master has faded out, to save battery. */
  private syncRestSleep(): void {
    if (this.restSleep !== null) clearTimeout(this.restSleep);
    this.restSleep = null;
    if (this.s.status !== 'resting') return;
    this.restSleep = setTimeout(() => {
      this.restSleep = null;
      if (this.s.status === 'resting') void this.engine.sleep();
    }, FADE_TCS * MASTER_TC.rest * 1000);
  }

  /** Check the pace when the page change is done and the browser is idle, so it never slows a swipe. */
  private schedulePaceCheck(): void {
    if (this.paceTask) return;
    const run = () => {
      this.paceTask = null;
      this.checkPace();
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(run, { timeout: 1500 });
      this.paceTask = () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(run, 0);
      this.paceTask = () => clearTimeout(id);
    }
  }

  /**
   * If the pages left would run out before 15 minutes at the person's average pace so far, slice the
   * rest of the session into more, shorter pages, from the page on screen on.
   */
  private checkPace(): void {
    const s = this.s;
    if (s.status !== 'showing' && s.status !== 'lingering') return;
    const elapsedSec = s.records.reduce((sum, r) => sum + r.dwell, 0);
    const sliced = sliceForPace(
      s.session,
      { index: s.index, elapsedSec, watched: s.records.length },
      { memory: this.setup.memory, useMemory: this.setup.useMemory },
    );
    if (sliced) this.dispatch({ type: 'replan', at: this.now(), index: s.index, session: sliced });
  }

  /** Watch page visibility, pagehide and the audio context. Returns a function that stops watching. */
  attach(): () => void {
    const offVisibility = watchVisibility((hidden) => this.dispatch({ type: hidden ? 'hidden' : 'visible', at: this.now() }));
    const offPageHide = watchPageHide(() => {
      // Writes started while the page unloads may not finish, so save what is known first, then end.
      if (isActive(this.s)) this.hooks.checkpoint(this.buildDoc('open', true));
      this.dispatch({ type: 'end', at: this.now() });
    });
    const offAudio = this.engine.onStateChange((state: EngineState) => {
      if (state === 'running') this.onAudioRunning();
      else this.checkAudio();
    });
    this.detachers = [offVisibility, offPageHide, offAudio];
    return () => this.detach();
  }

  detach(): void {
    for (const off of this.detachers) off();
    this.detachers = [];
  }

  /** Stop everything without recording, e.g. when the app unmounts mid-session. */
  dispose(): void {
    this.detach();
    if (this.timer !== null) clearTimeout(this.timer);
    if (this.restSleep !== null) clearTimeout(this.restSleep);
    this.paceTask?.();
    this.timer = null;
    this.restSleep = null;
    this.paceTask = null;
    this.wake.set(false);
  }

  /**
   * The session as a stored document. With `current`, an open checkpoint also records the page on
   * screen so far. An open checkpoint's endedAt is its own time, the last moment the session is
   * known to have run.
   */
  buildDoc(status: SessionStatus, current = false): SessionDoc {
    const s = this.s;
    const now = this.now();
    const records = [...s.records];
    if (current && isActive(s)) records.push(currentRecord(s, now));
    const pace = PACE_PRESETS[this.setup.pace];
    const end = s.endedAt ?? (status === 'open' ? now : null);
    return {
      v: 1,
      id: this.setup.id,
      seed: s.session.seed,
      pace: this.setup.pace,
      minDwell: pace.minDwell,
      maxDwell: pace.maxDwell,
      lingerMode: this.setup.mode,
      useMemory: this.setup.useMemory,
      inserted: s.session.inserted,
      pages: s.session.items.length,
      startedAt: this.wallStart,
      endedAt: end === null ? null : Math.round(this.wallStart + (end - s.startedAt)),
      status,
      records: records.map(toRecordDoc),
      totals: null,
    };
  }

  private computeView(): FeedView {
    const s = this.s;
    return {
      status: s.status,
      index: s.index,
      total: s.session.items.length,
      page: s.session.items[s.index],
      breath: s.breath,
      dim: dimFor(s),
      t0: s.t0,
      awaitingSound: !this.audioRan && !this.startedByGesture,
    };
  }

  /** Recompute what the screen draws, and tell the listeners if it changed. */
  private refreshView(): void {
    const view = this.computeView();
    if (sameView(view, this.view)) return;
    this.view = view;
    for (const listener of this.listeners) listener();
  }

  private syncTimer(): void {
    const t = this.s.timer;
    if (t === this.timerFor) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.timerFor = t;
    if (!t) return;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.dispatch({ type: 'timer', kind: t.kind, at: this.now() });
      },
      Math.max(0, t.at - this.now()),
    );
  }

  private run(effects: FeedEffect[]): void {
    const at = () => this.engine.now() + SCHEDULE.offset;
    for (const fx of effects) {
      switch (fx.type) {
        case 'unlockAudio':
        case 'resumeAudio':
          this.unlockAudio();
          break;
        case 'voice':
          this.voiced = this.engine.voice(fx.hz, fx.gainDb, at(), fx.fade) ? this.s.index : -1;
          break;
        case 'breath':
          this.engine.breath(at(), fx.cycle, fx.inhale, fx.peakDb, fx.troughDb);
          break;
        case 'drones':
          this.engine.drones(fx.midis, fx.gainDb, at());
          break;
        case 'master':
          this.engine.setMaster(fx.target, fx.tc);
          break;
        case 'checkpoint':
          this.hooks.checkpoint(this.buildDoc('open', fx.current));
          break;
        case 'checkPace':
          this.schedulePaceCheck();
          break;
        case 'finish':
          this.detach();
          this.wake.set(false);
          this.paceTask?.();
          this.paceTask = null;
          void this.engine.close(MASTER_TC.end);
          this.hooks.finish(this.buildDoc('done'));
          break;
      }
    }
  }
}
