import type { AudioEngine, EngineState } from '@calm/audio';
import { MASTER_TC, SCHEDULE, VOICE_RELEASE_TC, type DwellRecord, type LingerMode, type Page, type PaceId, type Session } from '@calm/core';
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
  private audioWasRunning = false;
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

  next = (): void => this.dispatch({ type: 'next', at: this.now() });
  end = (): void => this.dispatch({ type: 'end', at: this.now() });
  activity = (gesture: boolean): void => this.dispatch({ type: 'activity', at: this.now(), gesture });

  dispatch(event: FeedEvent): void {
    const { state, effects } = reduce(this.s, event);
    if (state === this.s && effects.length === 0) return;
    this.s = state;
    this.syncTimer();
    // The screen stays on in Showing and Lingering while the page is visible; resting lets it sleep.
    this.wake.set(!state.hidden && (state.status === 'showing' || state.status === 'lingering'));
    this.run(effects);
    const view = this.computeView();
    if (!sameView(view, this.view)) {
      this.view = view;
      for (const listener of this.listeners) listener();
    }
  }

  /** Watch page visibility, pagehide and the audio context. Returns a function that stops watching. */
  attach(): () => void {
    const onVisibility = () => this.dispatch({ type: document.visibilityState === 'hidden' ? 'hidden' : 'visible', at: this.now() });
    const onPageHide = () => this.dispatch({ type: 'end', at: this.now() });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    const offAudio = this.engine.onStateChange((state: EngineState) => {
      if (state === 'running') this.audioWasRunning = true;
      else if (this.audioWasRunning && (state === 'suspended' || state === 'interrupted')) {
        this.audioWasRunning = false;
        this.dispatch({ type: 'interrupted', at: this.now() });
      }
    });
    if (document.visibilityState === 'hidden') onVisibility();
    this.detachers = [() => document.removeEventListener('visibilitychange', onVisibility), () => window.removeEventListener('pagehide', onPageHide), offAudio];
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
    this.timer = null;
    this.wake.set(false);
  }

  /** The session as a stored document. An open checkpoint includes the page on screen so far. */
  buildDoc(status: SessionStatus): SessionDoc {
    const s = this.s;
    const records = [...s.records];
    if (status === 'open' && isActive(s)) records.push(currentRecord(s, this.now()));
    const { session } = this.setup;
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
      endedAt: s.endedAt === null ? null : Math.round(this.wallStart + (s.endedAt - s.startedAt)),
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
          void this.engine.unlock().then((running) => {
            if (running) this.audioWasRunning = true;
          });
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
          this.hooks.checkpoint(this.buildDoc('open'));
          break;
        case 'finish':
          this.detach();
          this.wake.set(false);
          this.audioWasRunning = false;
          void this.engine.close(MASTER_TC.end);
          this.hooks.finish(this.buildDoc('done'));
          break;
      }
    }
  }
}
