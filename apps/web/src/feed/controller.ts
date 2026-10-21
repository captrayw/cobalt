import type { AudioEngine, EngineState } from '@calm/audio';
import { FADE_TCS, FEED_UI, MASTER_TC, SCHEDULE, VOICE_RELEASE_TC, type DwellRecord, type LingerMode, type Page, type PaceId, type Session } from '@calm/core';
import { watchPageHide, watchVisibility } from '../platform/visibility';
import { WakeLockManager } from '../platform/wakeLock';
import type { SessionDoc, SessionRecordDoc, SessionStatus } from '../storage/types';
import { createFeedState, currentRecord, dimFor, isActive, reduce } from './reducer';
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
}

export interface FeedSetup {
  id: string;
  session: Session;
  mode: LingerMode;
  pace: PaceId;
  useMemory: boolean;
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
});

const sameView = (a: FeedView, b: FeedView): boolean =>
  a.status === b.status && a.index === b.index && a.breath === b.breath && a.dim === b.dim && a.t0 === b.t0;

/** Runs the reducer's effects: sound, the single timer, the wake lock and checkpoints. */
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
  /** An unlock or resume is in flight. */
  private resuming = false;
  /** Suspends the context once a rest has faded out. */
  private restSleep: ReturnType<typeof setTimeout> | null = null;
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
    this.s = createFeedState(setup.session, setup.mode);
    this.view = this.computeView();
  }

  get state(): FeedState {
    return this.s;
  }

  getView = (): FeedView => this.view;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Call inside the tap or key press that starts the session, so audio can unlock. */
  start(): void {
    this.wallStart = this.wallNow();
    this.dispatch({ type: 'start', at: this.now() });
  }

  setVolume(db: number): void {
    this.engine.setVolume(db);
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
    const view = this.computeView();
    if (!sameView(view, this.view)) {
      this.view = view;
      for (const listener of this.listeners) listener();
    }
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
      if (running || this.engine.state === 'running') this.audioRan = true;
      else this.checkAudio();
    });
  }

  /** A tap, key or swipe is a chance to bring back audio that stopped (a call, a locked screen). */
  private resumeIfStopped(): void {
    const audio: EngineState = this.engine.state;
    if (this.audioRan && (audio === 'suspended' || audio === 'interrupted')) this.unlockAudio();
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

  /** Watch page visibility, pagehide and the audio context. Returns a function that stops watching. */
  attach(): () => void {
    const offVisibility = watchVisibility((hidden) => this.dispatch({ type: hidden ? 'hidden' : 'visible', at: this.now() }));
    const offPageHide = watchPageHide(() => {
      // Writes started while the page unloads may not finish, so save what is known first, then end.
      if (isActive(this.s)) this.hooks.checkpoint(this.buildDoc('open', true));
      this.dispatch({ type: 'end', at: this.now() });
    });
    const offAudio = this.engine.onStateChange((state: EngineState) => {
      if (state === 'running') this.audioRan = true;
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
    this.timer = null;
    this.restSleep = null;
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
    const { session } = this.setup;
    const end = s.endedAt ?? (status === 'open' ? now : null);
    return {
      v: 1,
      id: this.setup.id,
      seed: session.seed,
      pace: this.setup.pace,
      minDwell: session.opts.minDwell,
      maxDwell: session.opts.maxDwell,
      lingerMode: this.setup.mode,
      useMemory: this.setup.useMemory,
      inserted: session.inserted,
      pages: session.items.length,
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
    };
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
        case 'tone':
          this.engine.tone(fx.hz, at(), fx.dur, fx.gainDb, fx.inhale);
          break;
        case 'drones':
          this.engine.drones(fx.midis, fx.gainDb, at());
          break;
        case 'releaseVoices':
          this.engine.releaseVoices(VOICE_RELEASE_TC);
          break;
        case 'master':
          this.engine.setMaster(fx.target, fx.tc);
          break;
        case 'checkpoint':
          this.hooks.checkpoint(this.buildDoc('open', fx.current));
          break;
        case 'finish':
          this.detach();
          this.wake.set(false);
          void this.engine.close(MASTER_TC.end);
          this.hooks.finish(this.buildDoc('done'));
          break;
      }
    }
  }
}
