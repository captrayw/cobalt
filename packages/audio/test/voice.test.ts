import { inhaleShare, MASTER, midiToHz, TONE } from '@calm/core';
import { describe, expect, it } from 'vitest';
import { dbToGain } from '../src/index.ts';
import { at, db, envelope, maxJump, peakIn, render, voiceFactor } from './analysis.ts';

const START = 0.05;
const HZ_A = midiToHz(66); // F#4
const HZ_B = midiToHz(64); // E4
const A_DB = -4.67;
const B_DB = -6;

/** Steady envelope of a held voice at this pitch and level, through the master and the filter. */
const level = (filter: BiquadFilterNode, hz: number, gainDb: number): number =>
  TONE.peak * dbToGain(gainDb) * MASTER.normal * voiceFactor(filter, hz);

/** Let 'ended' events from the render reach the engine. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('held voices rendered offline', () => {
  it('fades in linearly, then holds its level for 10 s with no decay and no clicks', async () => {
    const fade = 1.2;
    let started = false;
    const { data, engine } = await render(START + fade + 10.2, (e) => {
      started = e.voice(HZ_A, A_DB, START, fade);
    });
    expect(started).toBe(true);
    const expected = level(engine.nodes!.filter, HZ_A, A_DB);
    const env = envelope(data, 0.05);
    const steady = env.v.filter((_, i) => env.t[i] > START + fade + 0.1);
    const worstDb = Math.max(...steady.map((v) => Math.abs(db(v / expected))));
    const driftDb = db(steady[steady.length - 1] / steady[0]);
    const halfway = peakIn(data, START + fade / 2 - 0.01, START + fade / 2 + 0.01) / expected;
    const jump = maxJump(data);
    console.log(`[audio] held voice 10 s: ${JSON.stringify({ worstDb, driftDb, halfway, maxJump: jump })}`);
    expect(worstDb).toBeLessThanOrEqual(0.5);
    expect(Math.abs(driftDb)).toBeLessThanOrEqual(0.1);
    expect(halfway).toBeGreaterThan(0.45);
    expect(halfway).toBeLessThan(0.55);
    expect(jump).toBeLessThanOrEqual(0.01);
    expect(peakIn(data, 0, START - 0.001)).toBe(0);
  });

  it('crossfades into the next voice over 1.2 s with no click and no bump', async () => {
    const { data, engine } = await render(7, (e, ctx) => {
      e.voice(HZ_A, A_DB, START, 0.5);
      at(ctx, 3, () => e.voice(HZ_B, B_DB, e.now() + 0.03, 1.2));
    });
    const f = engine.nodes!.filter;
    const a = level(f, HZ_A, A_DB),
      b = level(f, HZ_B, B_DB);
    const during = peakIn(data, 3, 3.03 + 1.2 + 0.05);
    const afterDb = db(peakIn(data, 4.6, 7) / b);
    const jump = maxJump(data);
    console.log(`[audio] crossfade A to B: ${JSON.stringify({ bumpRatio: during / Math.max(a, b), afterDb, maxJump: jump })}`);
    expect(Math.abs(db(peakIn(data, 2, 3) / a))).toBeLessThanOrEqual(0.5);
    expect(during).toBeLessThanOrEqual(Math.max(a, b) * 1.05);
    expect(Math.abs(afterDb)).toBeLessThanOrEqual(0.5);
    expect(jump).toBeLessThanOrEqual(0.01);
    await settle();
    expect(engine.heldVoices).toBe(1);
  });

  it('the earlier voice falls silent and stops shortly after the crossfade', async () => {
    // B is far too quiet to hear, so anything left after the fade would be A.
    const { data, engine } = await render(5, (e, ctx) => {
      e.voice(HZ_A, A_DB, START, 0.5);
      at(ctx, 2, () => e.voice(HZ_B, -80, e.now() + 0.03, 1.2));
    });
    const residue = peakIn(data, 2.03 + 1.2 + 0.1);
    console.log(`[audio] after the crossfade: ${JSON.stringify({ residue })}`);
    expect(residue).toBeLessThan(1e-4);
    expect(maxJump(data)).toBeLessThanOrEqual(0.01);
    await settle();
    expect(engine.heldVoices).toBe(1);
  });

  it('a crossfade that starts mid fade-in starts from where the voice is, with no click', async () => {
    const { data, engine } = await render(4, (e, ctx) => {
      e.voice(HZ_A, A_DB, START, 2);
      at(ctx, 1, () => e.voice(HZ_B, B_DB, e.now() + 0.03, 1));
    });
    const f = engine.nodes!.filter;
    const aAtSwitch = level(f, HZ_A, A_DB) * ((1.03 - START) / 2);
    const b = level(f, HZ_B, B_DB);
    const beforeRatio = peakIn(data, 0.99, 1.03) / aAtSwitch;
    const during = peakIn(data, 1.03, 2.08);
    const jump = maxJump(data);
    console.log(`[audio] crossfade mid fade-in: ${JSON.stringify({ beforeRatio, bumpRatio: during / Math.max(aAtSwitch, b), maxJump: jump })}`);
    expect(beforeRatio).toBeGreaterThan(0.95);
    expect(beforeRatio).toBeLessThan(1.05);
    expect(during).toBeLessThanOrEqual(Math.max(aAtSwitch, b) * 1.05);
    expect(jump).toBeLessThanOrEqual(0.01);
  });

  it('breaths swell between trough and peak on the held voice, never to silence, and chain smoothly', async () => {
    const breaths = [
      { at: 2, cycle: 8, inhale: inhaleShare(1, 'gradual'), peak: -5, trough: -15 },
      { at: 10, cycle: 8.4, inhale: inhaleShare(2, 'gradual'), peak: -6, trough: -16 },
    ];
    const { data, engine } = await render(19, (e, ctx) => {
      e.voice(HZ_A, -15, START, 1);
      for (const br of breaths) at(ctx, br.at - 0.5, () => e.breath(br.at, br.cycle, br.inhale, br.peak, br.trough));
    });
    const f = engine.nodes!.filter;
    const env = envelope(data, 0.02);
    const report: Record<string, number>[] = [];
    let previousTrough = level(f, HZ_A, -15);
    for (const br of breaths) {
      const inBreath = env.t.map((t, i) => ({ t, v: env.v[i] })).filter((p) => p.t > br.at && p.t < br.at + br.cycle);
      const top = inBreath.reduce((best, p) => (p.v > best.v ? p : best));
      const peakTimeErrorPct = (100 * Math.abs(top.t - br.at - br.inhale * br.cycle)) / br.cycle;
      const peakErrorDb = db(top.v / level(f, HZ_A, br.peak));
      const endErrorDb = db(peakIn(data, br.at + br.cycle - 0.04, br.at + br.cycle - 0.01) / level(f, HZ_A, br.trough));
      const lowest = Math.min(...inBreath.map((p) => p.v));
      const floorMarginDb = db(lowest / Math.min(previousTrough, level(f, HZ_A, br.trough)));
      const seamDb = db(peakIn(data, br.at - 0.03, br.at) / peakIn(data, br.at, br.at + 0.03));
      report.push({ peakTimeErrorPct, peakErrorDb, endErrorDb, floorMarginDb, seamDb });
      expect(peakTimeErrorPct).toBeLessThanOrEqual(5);
      expect(Math.abs(peakErrorDb)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(endErrorDb)).toBeLessThanOrEqual(0.5);
      expect(floorMarginDb).toBeGreaterThanOrEqual(-1);
      expect(Math.abs(seamDb)).toBeLessThanOrEqual(0.5);
      previousTrough = level(f, HZ_A, br.trough);
    }
    const jump = maxJump(data);
    console.log(`[audio] breaths: ${JSON.stringify({ breaths: report, maxJump: jump })}`);
    expect(jump).toBeLessThanOrEqual(0.01);
  });

  it('releaseVoices fades the held voice too, and close() stops any new voice', async () => {
    const { data, engine } = await render(5, (e, ctx) => {
      e.voice(HZ_A, A_DB, START, 0.5);
      at(ctx, 2, () => e.releaseVoices(0.25));
    });
    expect(peakIn(data, 2.03 + 8 * 0.25 + 0.05)).toBeLessThan(1e-4);
    expect(maxJump(data)).toBeLessThanOrEqual(0.01);
    await settle();
    expect(engine.heldVoices).toBe(0);
    await engine.close();
    expect(engine.voice(HZ_A, A_DB, engine.now() + 0.03, 0.5)).toBe(false);
  });
});
