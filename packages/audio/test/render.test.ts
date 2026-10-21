import { inhaleShare, lingerCycle, lingerLevelDb, MASTER, midiToHz, TONE } from '@calm/core';
import { describe, expect, it } from 'vitest';
import { toneEnvelope } from '../src/index.ts';
import { at, db, decaySlope, envelope, filterGain, maxJump, peakIn, render, voiceFactor } from './analysis.ts';

// A realistic group-3 page: F#4 at the level of a page about a third of the way through a session.
const HZ = midiToHz(66);
const PAGE_DB = -4.67;
const PAGE_DWELL = 7.5;
const START = 0.05;

interface ToneCase {
  name: string;
  dur: number;
  gainDb: number;
  inhale: number;
}

const cases: ToneCase[] = [
  { name: 'page tone (7.5 s, inhale 0.4)', dur: PAGE_DWELL, gainDb: PAGE_DB, inhale: TONE.pageInhale },
  {
    name: 'linger breath 1',
    dur: lingerCycle(PAGE_DWELL, 1, 'gradual'),
    gainDb: lingerLevelDb(PAGE_DB, 1),
    inhale: inhaleShare(1, 'gradual'),
  },
];

describe('tone voices rendered offline', () => {
  for (const c of cases) {
    it(`${c.name}: peak, attack and release match the envelope, with no clicks`, async () => {
      const env = toneEnvelope(c.dur, c.gainDb, c.inhale);
      const { data, engine } = await render(START + env.stopAt + 0.3, (e) => e.tone(HZ, START, c.dur, c.gainDb, c.inhale));
      const expectedPeak = env.peak * MASTER.normal * voiceFactor(engine.nodes!.filter, HZ);
      const peakErrorDb = db(peakIn(data) / expectedPeak);

      const curve = envelope(data);
      const top = curve.v.indexOf(Math.max(...curve.v));
      const attack = curve.t[top] - START;
      const attackErrorPct = (100 * Math.abs(attack - env.attack)) / env.attack;

      // The exhale falls exponentially from the peak to 0.0001 over (release + 0.25) s.
      const slope = decaySlope(curve, curve.t[top], -3, -40);
      const fall = db(env.peak / TONE.floor) / -slope;
      const expectedFall = env.rampEnd - env.attack;
      const releaseErrorPct = (100 * Math.abs(fall - expectedFall)) / expectedFall;
      const jump = maxJump(data);
      console.log(`[audio] ${c.name}: ${JSON.stringify({ peakErrorDb, attackErrorPct, releaseErrorPct, maxJump: jump })}`);

      expect(Math.abs(peakErrorDb)).toBeLessThanOrEqual(0.5);
      expect(attackErrorPct).toBeLessThanOrEqual(5);
      expect(releaseErrorPct).toBeLessThanOrEqual(5);
      expect(jump).toBeLessThanOrEqual(0.01);
      // Silent before the start and after the oscillators stop.
      expect(peakIn(data, 0, START - 0.001)).toBe(0);
      expect(peakIn(data, START + env.stopAt + 0.05)).toBeLessThan(1e-5);
    });
  }

  it('the first page tone of a session, the loudest sound, stays click-free', async () => {
    // B4 at 0 dB: the waveform's own slope reaches about 0.01 per sample at 48 kHz, so the bound
    // here is the slope of a clean sine at that level, with 30% headroom, not 0.01.
    const hz = midiToHz(71);
    const { data, engine } = await render(1.2, (e) => e.tone(hz, START, 1, 0, TONE.pageInhale));
    const amplitude = toneEnvelope(1, 0, TONE.pageInhale).peak * MASTER.normal * voiceFactor(engine.nodes!.filter, hz);
    const cleanSlope = amplitude * 2 * Math.PI * hz * 1.25 / 48_000; // fundamental plus the second harmonic's share
    console.log(`[audio] first page tone B4 0 dB: ${JSON.stringify({ maxJump: maxJump(data), cleanSlope })}`);
    expect(maxJump(data)).toBeLessThanOrEqual(cleanSlope * 1.3);
    expect(peakIn(data)).toBeLessThan(0.2);
  });
});

describe('drones', () => {
  it('fade in over 3 s without clicks and settle at 0.045 at 0 dB', async () => {
    const { data, engine } = await render(4.5, (e) => e.drones([50], 0, START));
    const g = MASTER.normal * filterGain(engine.nodes!.filter, midiToHz(50));
    expect(Math.abs(db(peakIn(data, 3.6, 4.4) / (0.045 * g)))).toBeLessThanOrEqual(0.5);
    // Halfway through the exponential fade the level is the geometric mean of 0.0001 and 0.045.
    expect(Math.abs(db(peakIn(data, START + 1.48, START + 1.52) / (Math.sqrt(0.0001 * 0.045) * g)))).toBeLessThanOrEqual(1);
    expect(maxJump(data)).toBeLessThanOrEqual(0.01);
  });

  it('a level change ramps linearly over 0.2 s, and A2 joins at 0.03 with its own fade-in', async () => {
    const { data, engine } = await render(7, (e, ctx) => {
      e.drones([50], 0, START);
      at(ctx, 3.5, () => e.drones([50, 45], -6, e.now() + 0.03));
    });
    const f = engine.nodes!.filter;
    const before = 0.045 * MASTER.normal * filterGain(f, midiToHz(50));
    const d3 = 0.045 * 10 ** (-6 / 20) * MASTER.normal * filterGain(f, midiToHz(50));
    const a2 = 0.03 * 10 ** (-6 / 20) * MASTER.normal * filterGain(f, midiToHz(45));
    expect(Math.abs(db(peakIn(data, 3.3, 3.5) / before))).toBeLessThanOrEqual(0.5);
    // D3 has reached its new level 0.2 s after the change, while A2 is still near silent.
    expect(Math.abs(db(peakIn(data, 3.75, 3.85) / d3))).toBeLessThanOrEqual(0.5);
    // After A2's 3 s fade-in, the two sines add up to at most the sum of their levels.
    const late = peakIn(data, 6.6, 7);
    expect(late).toBeLessThanOrEqual((d3 + a2) * 1.02);
    expect(late).toBeGreaterThan(Math.max(d3, a2));
    expect(maxJump(data)).toBeLessThanOrEqual(0.01);
  });

  it('fadeDrones fades and stops every drone', async () => {
    const { data } = await render(4, (e, ctx) => {
      e.drones([50, 45], 0, START);
      at(ctx, 3, () => e.fadeDrones(0.06));
    });
    expect(peakIn(data, 3.6)).toBeLessThan(1e-4);
    expect(maxJump(data)).toBeLessThanOrEqual(0.01);
  });
});

describe('master and volume', () => {
  it('setMaster fades to silence with a 0.08 s time constant without clicks', async () => {
    const { data } = await render(5, (e, ctx) => {
      e.drones([50], 0, START);
      at(ctx, 3.5, () => e.setMaster(MASTER.silent, 0.08));
    });
    const steady = peakIn(data, 3.3, 3.5);
    expect(peakIn(data, 3.5 + 0.03 + 8 * 0.08)).toBeLessThan(steady * 1e-3);
    // One time constant in, about e^-1 of the level remains.
    expect(peakIn(data, 3.5 + 0.03 + 0.08 - 0.004, 3.5 + 0.03 + 0.08 + 0.004) / steady).toBeCloseTo(Math.exp(-1), 1);
    expect(maxJump(data)).toBeLessThanOrEqual(0.01);
  });

  it('a page change returns the master to 0.9 smoothly after a rest fade', async () => {
    const { data } = await render(6, (e, ctx) => {
      e.drones([50], 0, START);
      at(ctx, 3.5, () => e.setMaster(MASTER.silent, 8));
      at(ctx, 4.5, () => e.setMaster(MASTER.normal, 0.2));
    });
    const before = peakIn(data, 3.3, 3.5);
    expect(peakIn(data, 4.4, 4.5)).toBeLessThan(before);
    expect(peakIn(data, 5.6, 6) / before).toBeCloseTo(1, 1);
    expect(maxJump(data)).toBeLessThanOrEqual(0.01);
  });

  it('releaseVoices fades a sounding tone quickly without clicks and stops it', async () => {
    const env = toneEnvelope(PAGE_DWELL, PAGE_DB, TONE.pageInhale);
    const { data } = await render(4.6, (e, ctx) => {
      e.tone(HZ, START, PAGE_DWELL, PAGE_DB, TONE.pageInhale);
      at(ctx, 2, () => e.releaseVoices(0.25));
    });
    // The voice is mid-attack at 2.03 s; from there it approaches the 0.0001 floor with tc 0.25 s.
    const g0 = TONE.floor * (env.peak / TONE.floor) ** ((2.03 - START) / env.attack);
    const expected = (TONE.floor + (g0 - TONE.floor) * Math.exp(-4)) / g0;
    const ratio = peakIn(data, 3.025, 3.035) / peakIn(data, 2.025, 2.035);
    expect(Math.abs(ratio / expected - 1)).toBeLessThan(0.2);
    expect(peakIn(data, 4.2)).toBeLessThan(1e-5);
    expect(maxJump(data)).toBeLessThanOrEqual(0.01);
    expect(env.stopAt).toBeGreaterThan(4.6); // without the release it would still be sounding
  });

  it('volume is clamped to -30..0 dB, never boosts, and changes without clicks', async () => {
    const { data: full } = await render(4, (e) => e.drones([50], 0, START));
    const { data: quiet, engine } = await render(4, (e) => e.drones([50], 0, START), -30);
    expect(engine.volumeDb).toBe(-30);
    expect(db(peakIn(quiet, 3.5) / peakIn(full, 3.5))).toBeCloseTo(-30, 1);

    const { engine: loud } = await render(0.1, () => undefined, 6);
    expect(loud.volumeDb).toBe(0);
    expect(loud.nodes!.user.gain.value).toBe(1);
    loud.setVolume(-50);
    expect(loud.volumeDb).toBe(-30);
    loud.setVolume(Number.NaN);
    expect(loud.volumeDb).toBe(0);

    const { data: changed } = await render(5, (e, ctx) => {
      e.drones([50], 0, START);
      at(ctx, 3.5, () => e.setVolume(-12));
    });
    expect(db(peakIn(changed, 4.5) / peakIn(changed, 3.2, 3.5))).toBeCloseTo(-12, 0);
    expect(maxJump(changed)).toBeLessThanOrEqual(0.01);
  });
});

describe('signal graph', () => {
  it('voices -> user gain -> master 0.9 -> low-pass 2,400 Hz, Q 0.4 -> destination', async () => {
    const { engine } = await render(0.1, () => undefined);
    const { user, master, filter } = engine.nodes!;
    expect(user.gain.value).toBe(1);
    expect(master.gain.value).toBeCloseTo(0.9, 6);
    expect(filter.type).toBe('lowpass');
    expect(filter.frequency.value).toBe(2400);
    expect(filter.Q.value).toBeCloseTo(0.4, 6);
  });

  it('an offline engine unlocks at once and reports its context state', async () => {
    const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: 4800, sampleRate: 48_000 });
    const { WebAudioEngine } = await import('../src/index.ts');
    const engine = new WebAudioEngine({ context: ctx });
    expect(await engine.unlock()).toBe(true);
    expect(engine.state).toBe('suspended');
    expect(engine.now()).toBe(0);
  });
});
