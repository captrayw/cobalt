import {
  CHECKPOINT_EVERY,
  dimOpacity,
  inhaleShare,
  INPUT,
  lingerCycle,
  lingerLevelDb,
  MASTER,
  MASTER_TC,
  REST,
  TONE,
  type DwellRecord,
  type LingerMode,
  type Session,
} from '@calm/core';
import type { FeedEffect, FeedEvent, FeedState, FeedStep } from './types';

/**
 * The feed as a pure reducer over timestamped events (ms on the performance clock), with six
 * states: idle, showing, lingering, resting, paused and ended. Effects are returned, never run.
 */
export function createFeedState(session: Session, mode: LingerMode): FeedState {
  return {
    status: 'idle',
    session,
    mode,
    index: 0,
    t0: 0,
    lastActivity: 0,
    hiddenMs: 0,
    excludedSince: null,
    hidden: false,
    muted: false,
    breath: 0,
    breaths: [],
    sleep: false,
    lastAdvance: Number.NEGATIVE_INFINITY,
    records: [],
    startedAt: 0,
    endedAt: null,
    timer: null,
  };
}

const step = (state: FeedState, effects: FeedEffect[] = []): FeedStep => ({ state, effects });

export const isActive = (s: FeedState): boolean =>
  s.status === 'showing' || s.status === 'lingering' || s.status === 'resting' || s.status === 'paused';

/** Length of the open hidden or paused span, ms. */
const openSpan = (s: FeedState, at: number): number => (s.excludedSince === null ? 0 : at - s.excludedSince);

/** Seconds on the current page, with hidden and paused time removed. Never below zero. */
export const dwellSec = (s: FeedState, at: number): number => Math.max(0, (at - s.t0 - s.hiddenMs - openSpan(s, at)) / 1000);

/** Seconds since the last input, with hidden time removed. */
export const idleSec = (s: FeedState, at: number): number => (at - s.lastActivity - openSpan(s, at)) / 1000;

/** The record for the page on screen if the person moved on now. */
export const currentRecord = (s: FeedState, at: number): DwellRecord => ({
  item: s.session.items[s.index],
  k: s.index,
  dwell: dwellSec(s, at),
  sleep: s.sleep,
  cycles: s.breath,
});

/** Opacity of the dim layer for the current breath. */
export const dimFor = (s: FeedState): number => (s.breath > 0 && s.status !== 'showing' ? dimOpacity(s.breath) : 0);

/** Close the open hidden or paused span: add it to hiddenMs and shift the idle clock forward by it. */
function closeSpan(s: FeedState, at: number): FeedState {
  if (s.excludedSince === null) return s;
  const span = at - s.excludedSince;
  return { ...s, hiddenMs: s.hiddenMs + span, lastActivity: s.lastActivity + span, excludedSince: null };
}

function showPage(s: FeedState, index: number, at: number, effects: FeedEffect[]): FeedStep {
  const page = s.session.items[index];
  if (index > 0) effects.push({ type: 'releaseVoices' });
  effects.push(
    { type: 'master', target: MASTER.normal, tc: MASTER_TC.page },
    { type: 'tone', hz: page.hz, dur: page.dwell, gainDb: page.gainDb, inhale: TONE.pageInhale },
    { type: 'drones', midis: page.drone, gainDb: page.gainDb },
  );
  return step(
    {
      ...s,
      status: 'showing',
      index,
      t0: at,
      lastActivity: at,
      hiddenMs: 0,
      excludedSince: s.hidden ? at : null,
      muted: false,
      breath: 0,
      breaths: [],
      sleep: false,
      timer: { kind: 'dwell', at: at + page.dwell * 1000 },
    },
    effects,
  );
}

function playBreath(s: FeedState, k: number, at: number, effects: FeedEffect[] = []): FeedStep {
  const page = s.session.items[s.index];
  const cycle = lingerCycle(page.dwell, k, s.mode);
  effects.push({ type: 'tone', hz: page.hz, dur: cycle, gainDb: lingerLevelDb(page.gainDb, k), inhale: inhaleShare(k, s.mode) });
  return step(
    {
      ...s,
      status: 'lingering',
      breath: k,
      breaths: [...s.breaths, { k, start: at, dur: cycle * 1000 }],
      timer: { kind: 'breath', at: at + cycle * 1000 },
    },
    effects,
  );
}

function finish(s: FeedState, at: number, effects: FeedEffect[]): FeedStep {
  const records = [...s.records, currentRecord(s, at)];
  effects.push({ type: 'finish' });
  return step({ ...s, status: 'ended', records, endedAt: at, timer: null }, effects);
}

/** Record the page on screen and show the next one, or end after the last page. */
function advance(s: FeedState, at: number, effects: FeedEffect[]): FeedStep {
  if (s.index >= s.session.items.length - 1) return finish({ ...s, lastAdvance: at }, at, effects);
  const records = [...s.records, currentRecord(s, at)];
  // The page just shown has no time yet, so this checkpoint holds only the finished pages.
  if (records.length % CHECKPOINT_EVERY === 0) effects.push({ type: 'checkpoint', current: false });
  return showPage({ ...s, records, lastAdvance: at }, s.index + 1, at, effects);
}

function onNext(s: FeedState, at: number): FeedStep {
  if (!isActive(s)) return step(s);
  // At most one page advance per 400 ms; a quicker one only counts as activity.
  if (at - s.lastAdvance < INPUT.advanceGapMs) return onActivity(s, at, false);
  const effects: FeedEffect[] = [];
  let cur = s;
  if (s.status === 'paused') {
    effects.push({ type: 'resumeAudio' });
    cur = closeSpan(cur, at);
  }
  if (s.status === 'resting') {
    // The context may have been suspended while the screen was off; the swipe or key can resume it.
    effects.push({ type: 'resumeAudio' });
    cur = { ...cur, sleep: true };
  }
  return advance(cur, at, effects);
}

function onActivity(s: FeedState, at: number, gesture: boolean): FeedStep {
  if (!isActive(s)) return step(s);
  if (s.status === 'resting') {
    // Wake: clear the rest screen, bring the master back, next breath after 0.4 s. Sleep stays logged.
    const effects: FeedEffect[] = [{ type: 'master', target: MASTER.normal, tc: MASTER_TC.wake }];
    if (gesture) effects.unshift({ type: 'resumeAudio' });
    return step({ ...s, status: 'lingering', lastActivity: at, timer: { kind: 'wake', at: at + REST.wakeBreathDelaySec * 1000 } }, effects);
  }
  if (s.status === 'paused') {
    if (!gesture) return step({ ...s, lastActivity: at });
    // Close the paused span, unless the page is still hidden and it carries on as a hidden span.
    const resumed = s.hidden ? s : closeSpan(s, at);
    return step(
      { ...resumed, status: 'lingering', lastActivity: at, timer: { kind: 'wake', at: at + REST.wakeBreathDelaySec * 1000 } },
      [
        { type: 'resumeAudio' },
        { type: 'master', target: MASTER.normal, tc: MASTER_TC.wake },
      ],
    );
  }
  return step({ ...s, lastActivity: at });
}

function onTimer(s: FeedState, kind: 'dwell' | 'breath' | 'wake', at: number): FeedStep {
  if (!s.timer || s.timer.kind !== kind) return step(s);
  if (kind === 'dwell') return s.status === 'showing' ? playBreath(s, 1, at) : step(s);
  if (s.status !== 'lingering') return step(s);
  if (kind === 'wake') return playBreath(s, s.breath + 1, at);
  // A breath ended: rest after 180 s without input, otherwise breathe again.
  if (idleSec(s, at) >= REST.idleSec) {
    // While resting, time counts toward the page even if the screen turns off, so any open span closes here.
    return step({ ...closeSpan(s, at), status: 'resting', sleep: true, timer: null }, [
      { type: 'master', target: MASTER.silent, tc: MASTER_TC.rest },
    ]);
  }
  // Hidden for 3 minutes (the screen switched off, another app or tab): the breaths have carried on
  // as far as the browser allows; now the sound fades and the rhythm waits for the page to return.
  // Not Rest: the hidden time still stays out of the dwell and the idle clock.
  if (s.hidden && openSpan(s, at) >= REST.idleSec * 1000) {
    return step({ ...s, muted: true, timer: null }, [{ type: 'master', target: MASTER.silent, tc: MASTER_TC.rest }]);
  }
  return playBreath(s, s.breath + 1, at);
}

function onInterrupted(s: FeedState, at: number): FeedStep {
  if (s.status !== 'showing' && s.status !== 'lingering') return step(s);
  // Fade the master too, so nothing hums under "Tap to resume" if the system brings audio back alone.
  return step({ ...s, status: 'paused', muted: false, timer: null, excludedSince: s.excludedSince ?? at }, [
    { type: 'master', target: MASTER.silent, tc: MASTER_TC.end },
  ]);
}

function onHidden(s: FeedState, at: number): FeedStep {
  if (s.hidden) return step(s);
  const opensSpan = s.status === 'showing' || s.status === 'lingering' || s.status === 'paused';
  const next = { ...s, hidden: true, excludedSince: opensSpan && s.excludedSince === null ? at : s.excludedSince };
  return step(next, isActive(s) ? [{ type: 'checkpoint', current: true }] : []);
}

function onVisible(s: FeedState, at: number): FeedStep {
  if (!s.hidden) return step(s);
  const next = { ...s, hidden: false };
  // A paused span stays open until the person taps to resume.
  if (s.status === 'paused') return step(next);
  if (s.muted) {
    // Back from a long absence: sound returns and the next breath follows 0.4 s later.
    return step({ ...closeSpan(next, at), muted: false, timer: { kind: 'wake', at: at + REST.wakeBreathDelaySec * 1000 } }, [
      { type: 'master', target: MASTER.normal, tc: MASTER_TC.wake },
    ]);
  }
  return step(closeSpan(next, at));
}

export function reduce(s: FeedState, e: FeedEvent): FeedStep {
  switch (e.type) {
    case 'start':
      if (s.status !== 'idle') return step(s);
      return showPage({ ...s, startedAt: e.at }, 0, e.at, [{ type: 'unlockAudio' }]);
    case 'timer':
      return onTimer(s, e.kind, e.at);
    case 'next':
      return onNext(s, e.at);
    case 'activity':
      return onActivity(s, e.at, e.gesture);
    case 'interrupted':
      return onInterrupted(s, e.at);
    case 'hidden':
      return onHidden(s, e.at);
    case 'visible':
      return onVisible(s, e.at);
    case 'end':
      return isActive(s) ? finish(s, e.at, []) : step(s);
  }
}
