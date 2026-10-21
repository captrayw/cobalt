import { generateValid, lingerCycle, PACE_PRESETS, sliceForPace, type Session } from '@calm/core';
import { describe, expect, it } from 'vitest';
import { createFeedState, dwellSec, reduce } from './reducer';
import type { FeedEffect, FeedEvent, FeedState } from './types';

const session: Session = generateValid({ seed: 15, ...PACE_PRESETS.standard });

/** An event without its timestamp; Replay stamps it with the fake clock. */
type Untimed = FeedEvent extends infer E ? (E extends FeedEvent ? Omit<E, 'at'> & { at?: number } : never) : never;

/** Replays events against the reducer with a fake clock, firing due timers in order. */
class Replay {
  state: FeedState;
  effects: FeedEffect[] = [];
  clock = 0;

  constructor(mode: 'gradual' | 'user' = 'gradual', s: Session = session) {
    this.state = createFeedState(s, mode);
  }

  send(event: Untimed) {
    const step = reduce(this.state, { ...event, at: event.at ?? this.clock } as FeedEvent);
    this.state = step.state;
    this.effects.push(...step.effects);
    return step;
  }

  /** Advance the clock by ms, firing every timer that falls due. */
  wait(ms: number) {
    const until = this.clock + ms;
    while (this.state.timer && this.state.timer.at <= until) {
      this.clock = this.state.timer.at;
      this.send({ type: 'timer', kind: this.state.timer.kind });
    }
    this.clock = until;
  }

  page() {
    return this.state.session.items[this.state.index];
  }
}

describe('feed reducer', () => {
  it('starts on page 1: unlocks audio, brings in the page voice and schedules the planned dwell', () => {
    const r = new Replay();
    const { effects } = r.send({ type: 'start', gesture: true });
    expect(r.state.status).toBe('showing');
    expect(r.state.index).toBe(0);
    expect(effects[0]).toEqual({ type: 'unlockAudio' });
    const p = session.items[0];
    expect(effects).toContainEqual({ type: 'voice', hz: p.hz, gainDb: p.gainDb, fade: p.xfade });
    expect(effects).toContainEqual({ type: 'drones', midis: p.drone, gainDb: p.gainDb });
    expect(r.state.timer).toEqual({ kind: 'dwell', at: p.dwell * 1000 });
  });

  it('switching to night changes no timer, sound or page, and each record notes its colors', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    r.wait(2000);
    const before = { timer: r.state.timer, index: r.state.index, status: r.state.status };
    const { effects } = r.send({ type: 'night', night: true });
    expect(effects).toEqual([]);
    expect({ timer: r.state.timer, index: r.state.index, status: r.state.status }).toEqual(before);
    expect(r.send({ type: 'night', night: true }).state).toBe(r.state);
    r.send({ type: 'next' });
    r.wait(1000);
    r.send({ type: 'night', night: false });
    r.send({ type: 'end' });
    expect(r.state.records.map((rec) => rec.night)).toEqual([true, false]);
  });

  it('opening the app starts the colors without a gesture; audio waits for the first touch', () => {
    const r = new Replay();
    const { effects } = r.send({ type: 'start', gesture: false });
    expect(r.state.status).toBe('showing');
    expect(effects).not.toContainEqual({ type: 'unlockAudio' });
    expect(effects.some((e) => e.type === 'voice')).toBe(true);
  });

  it('the voice holds through the planned dwell: no new voice until the person moves on, then a crossfade', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    r.wait(60_000);
    expect(r.effects.filter((e) => e.type === 'voice')).toHaveLength(1);
    const { effects } = r.send({ type: 'next' });
    const next = session.items[1];
    expect(effects).toContainEqual({ type: 'voice', hz: next.hz, gainDb: next.gainDb, fade: next.xfade });
  });

  it('scenario 1: ↓ 14 times at 2 to 4.5 s intervals shows page 15', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    for (let i = 0; i < 14; i++) {
      r.wait(2000 + ((i * 1700) % 2500));
      r.send({ type: 'next' });
    }
    expect(r.state.index).toBe(14);
    expect(r.state.records).toHaveLength(14);
  });

  it('scenario 2: a held page breathes; breath 1 lasts lingerCycle(dwell, 1), five breaths within 60 s', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    r.wait(session.items[0].dwell * 1000);
    expect(r.state.status).toBe('lingering');
    r.wait(60_000);
    const [b1, b2] = r.state.breaths;
    expect(Math.abs((b2.start - b1.start) / 1000 - lingerCycle(session.items[0].dwell, 1, 'gradual'))).toBeLessThan(0.01);
    expect(r.state.breath).toBeGreaterThanOrEqual(5);
    // Each breath swells the held voice to 1 dB softer than the last and settles 10 dB below that.
    const breaths = r.effects.filter((e) => e.type === 'breath');
    const gainDb = session.items[0].gainDb;
    expect(breaths[0]).toEqual({ type: 'breath', cycle: lingerCycle(session.items[0].dwell, 1, 'gradual'), inhale: 0.3875, peakDb: gainDb - 1, troughDb: gainDb - 11 });
    expect(breaths[1]).toMatchObject({ peakDb: gainDb - 2, troughDb: gainDb - 12 });
  });

  it('scenario 5: in "2, 5, 9 s" mode breaths last 2, 5, 9 and 9 s', () => {
    const r = new Replay('user');
    r.send({ type: 'start', gesture: true });
    r.wait(session.items[0].dwell * 1000 + 26_000);
    expect(r.state.breaths.slice(0, 4).map((b) => b.dur / 1000)).toEqual([2, 5, 9, 9]);
  });

  it('scenario 6: rests after 180 s without input; ↓ moves on with sleep logged', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    r.wait(200_000);
    expect(r.state.status).toBe('resting');
    expect(r.state.sleep).toBe(true);
    expect(r.effects).toContainEqual({ type: 'master', target: 0.0001, tc: 8 });
    r.send({ type: 'next' });
    expect(r.state.status).toBe('showing');
    expect(r.state.records[0].sleep).toBe(true);
    expect(r.state.records[0].dwell).toBeCloseTo(200, 6);
  });

  it('activity wakes a resting page: master back to 0.9, next breath after 0.4 s, sleep stays logged', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    r.wait(200_000);
    const breathsBefore = r.state.breath;
    r.send({ type: 'activity', gesture: true });
    expect(r.state.status).toBe('lingering');
    expect(r.effects.at(-1)).toEqual({ type: 'master', target: 0.9, tc: 0.5 });
    r.wait(399);
    expect(r.state.breath).toBe(breathsBefore);
    r.wait(1);
    expect(r.state.breath).toBe(breathsBefore + 1);
    expect(r.state.sleep).toBe(true);
  });

  it('scenario 8: 300 s hidden starts no rest and stays out of the recorded dwell', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    r.wait(10_000);
    r.send({ type: 'hidden' });
    r.wait(300_000);
    expect(r.state.status).toBe('lingering');
    r.send({ type: 'visible' });
    r.wait(5_000);
    expect(r.state.status).toBe('lingering');
    r.send({ type: 'next' });
    expect(r.state.records[0].dwell).toBeCloseTo(15, 6);
    expect(r.state.records[0].sleep).toBe(false);
  });

  it('accepts at most one page advance per 400 ms', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    r.wait(1000);
    r.send({ type: 'next' });
    r.wait(399);
    r.send({ type: 'next' });
    expect(r.state.index).toBe(1);
    r.wait(1);
    r.send({ type: 'next' });
    expect(r.state.index).toBe(2);
  });

  it('pauses on an audio interruption and resumes on a tap; paused time is not dwell', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    r.wait(2_000);
    const paused = r.send({ type: 'interrupted' });
    expect(r.state.status).toBe('paused');
    expect(r.state.timer).toBeNull();
    // The master fades too, so nothing hums under "Tap to resume" if audio comes back on its own.
    expect(paused.effects).toEqual([{ type: 'master', target: 0.0001, tc: 0.08 }]);
    r.wait(30_000);
    r.send({ type: 'activity', gesture: false });
    expect(r.state.status).toBe('paused');
    const { effects } = r.send({ type: 'activity', gesture: true });
    expect(effects).toEqual([{ type: 'resumeAudio' }, { type: 'master', target: 0.9, tc: 0.5 }]);
    expect(r.state.status).toBe('lingering');
    r.wait(400);
    expect(r.state.breath).toBe(1);
    expect(dwellSec(r.state, r.clock)).toBeCloseTo(2.4, 6);
  });

  it('hidden for 3 minutes while lingering: the sound fades and the breaths wait, without resting', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    r.wait(10_000);
    r.send({ type: 'hidden' });
    r.wait(180_000);
    const breaths = r.state.breath;
    r.wait(15_000);
    expect(r.state.status).toBe('lingering');
    expect(r.state.muted).toBe(true);
    expect(r.state.timer).toBeNull();
    expect(r.effects).toContainEqual({ type: 'master', target: 0.0001, tc: 8 });
    r.wait(3_600_000);
    expect(r.state.breath).toBeLessThanOrEqual(breaths + 1);
    const back = r.send({ type: 'visible' });
    expect(back.effects).toEqual([{ type: 'master', target: 0.9, tc: 0.5 }]);
    expect(r.state.muted).toBe(false);
    const before = r.state.breath;
    r.wait(400);
    expect(r.state.breath).toBe(before + 1);
    r.send({ type: 'next' });
    // All the hidden time stays out of the dwell.
    expect(r.state.records[0].dwell).toBeCloseTo(10.4, 6);
  });

  it('Next from Resting tries to resume audio, which may have been suspended with the screen off', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    r.wait(200_000);
    expect(r.state.status).toBe('resting');
    expect(r.send({ type: 'next' }).effects[0]).toEqual({ type: 'resumeAudio' });
  });

  it('Next from Paused resumes audio, closes the paused span and records the page', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    r.wait(3_000);
    r.send({ type: 'interrupted' });
    r.wait(10_000);
    const { effects } = r.send({ type: 'next' });
    expect(effects[0]).toEqual({ type: 'resumeAudio' });
    expect(r.state.records[0].dwell).toBeCloseTo(3, 6);
    expect(r.state.status).toBe('showing');
  });

  it('checkpoints every 10 pages and whenever the page is hidden', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    for (let i = 0; i < 10; i++) {
      r.wait(1000);
      r.send({ type: 'next' });
    }
    // Every 10 pages, only finished pages; on hide, the page on screen too.
    expect(r.effects.filter((e) => e.type === 'checkpoint')).toEqual([{ type: 'checkpoint', current: false }]);
    r.send({ type: 'hidden' });
    expect(r.effects.filter((e) => e.type === 'checkpoint')).toEqual([
      { type: 'checkpoint', current: false },
      { type: 'checkpoint', current: true },
    ]);
  });

  it('End records the page on screen and finishes; the last page ends on Next', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    r.wait(4_000);
    const { effects } = r.send({ type: 'end' });
    expect(effects).toEqual([{ type: 'finish' }]);
    expect(r.state.status).toBe('ended');
    expect(r.state.records).toHaveLength(1);
    expect(r.state.records[0].dwell).toBeCloseTo(4, 6);
    expect(r.send({ type: 'next' }).effects).toEqual([]);

    const short: Session = { ...session, items: session.items.slice(0, 2) };
    const q = new Replay('gradual', short);
    q.send({ type: 'start', gesture: true });
    q.wait(1000);
    q.send({ type: 'next' });
    q.wait(1000);
    expect(q.send({ type: 'next' }).effects).toContainEqual({ type: 'finish' });
    expect(q.state.records).toHaveLength(2);
  });

  it('the last page lingers like any other; no timer ends the session', () => {
    const short: Session = { ...session, items: session.items.slice(0, 1) };
    const r = new Replay('gradual', short);
    r.send({ type: 'start', gesture: true });
    r.wait(100_000);
    expect(r.state.status).toBe('lingering');
  });

  it('page changes return the master to 0.9 and crossfade to the next voice', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    r.wait(1000);
    const { effects } = r.send({ type: 'next' });
    expect(effects).toContainEqual({ type: 'master', target: 0.9, tc: 0.2 });
    expect(effects.filter((e) => e.type === 'voice')).toHaveLength(1);
  });

  it('asks for a pace check every 10 pages', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    let checks = 0;
    for (let i = 0; i < 25; i++) {
      r.wait(1000);
      checks += r.send({ type: 'next' }).effects.filter((e) => e.type === 'checkPace').length;
    }
    expect(checks).toBe(2);
  });

  it('accepts a re-sliced session only while the person is on the page it was sliced from', () => {
    const r = new Replay();
    r.send({ type: 'start', gesture: true });
    for (let i = 0; i < 10; i++) {
      r.wait(2000);
      r.send({ type: 'next' });
    }
    const sliced = sliceForPace(r.state.session, { index: 10, elapsedSec: 20, watched: 10 }, { useMemory: false })!;
    expect(sliced.items.length).toBeGreaterThan(session.items.length);
    // A replan from an earlier page is stale and ignored.
    r.send({ type: 'replan', index: 9, session: sliced });
    expect(r.state.session).toBe(session);
    r.send({ type: 'replan', index: 10, session: sliced });
    expect(r.state.session).toBe(sliced);
    expect(r.state.index).toBe(10);
    // The rest of the session now follows the shorter plan.
    r.wait(1000);
    r.send({ type: 'next' });
    expect(r.state.session.items[11]).toEqual(sliced.items[11]);
  });
});
