import { describe, expect, it } from 'vitest';
import { droneLevel, NullAudioEngine, toneEnvelope, TrackedParam } from '../src/index.ts';

describe('envelope math', () => {
  it('a 7.5 s page tone rises for 3 s and falls for 4.5 s', () => {
    const env = toneEnvelope(7.5, 0, 0.4);
    expect(env.peak).toBeCloseTo(0.16, 12);
    expect(env.attack).toBeCloseTo(3, 12);
    expect(env.release).toBeCloseTo(4.5, 12);
    expect(env.rampEnd).toBeCloseTo(7.75, 12);
    expect(env.stopAt).toBeCloseTo(7.8, 12);
  });

  it('peak = 0.16 x 10^(gainDb / 20)', () => {
    expect(toneEnvelope(7.5, -14, 0.4).peak).toBeCloseTo(0.16 * 10 ** (-14 / 20), 12);
    expect(toneEnvelope(7.5, -6, 0.3).peak).toBeCloseTo(0.0801898, 6);
  });

  it('attack and release have floors of 0.04 s and 0.08 s', () => {
    const env = toneEnvelope(0.05, 0, 0.4);
    expect(env.attack).toBe(0.04);
    expect(env.release).toBe(0.08);
    expect(env.rampEnd).toBeCloseTo(0.37, 12);
    expect(env.stopAt).toBeCloseTo(0.42, 12);
  });

  it('a more exhale-weighted breath has a shorter rise and longer fall', () => {
    const env = toneEnvelope(10, -3, 0.3);
    expect(env.attack).toBeCloseTo(3, 12);
    expect(env.release).toBeCloseTo(7, 12);
  });

  it('drone levels: D3 0.045, A2 0.03, scaled by the page level; other notes are not drones', () => {
    expect(droneLevel(50, 0)).toBe(0.045);
    expect(droneLevel(45, 0)).toBe(0.03);
    expect(droneLevel(50, -6)).toBeCloseTo(0.045 * 10 ** (-6 / 20), 12);
    expect(droneLevel(62, 0)).toBe(0);
  });
});

describe('TrackedParam', () => {
  const param = () => new OfflineAudioContext({ numberOfChannels: 1, length: 128, sampleRate: 48_000 }).createGain().gain;

  it('mirrors ramps and targets', () => {
    const p = new TrackedParam(param(), 0.0001);
    p.setValueAtTime(0.0001, 1);
    p.exponentialRampToValueAtTime(0.1, 3);
    expect(p.valueAt(0.5)).toBe(0.0001);
    expect(p.valueAt(2)).toBeCloseTo(Math.sqrt(0.0001 * 0.1), 12);
    expect(p.valueAt(5)).toBe(0.1);
    p.linearRampToValueAtTime(0.05, 4);
    expect(p.valueAt(3.5)).toBeCloseTo(0.075, 12);
    p.setTargetAtTime(0, 5, 0.5);
    expect(p.valueAt(5.5)).toBeCloseTo(0.05 * Math.exp(-1), 12);
  });

  it('hold freezes the curve at a time and anchors it there', () => {
    const p = new TrackedParam(param(), 0.0001);
    p.setValueAtTime(0.0001, 0);
    p.exponentialRampToValueAtTime(0.1, 2);
    const held = p.hold(1, 0.97);
    expect(held).toBeCloseTo(Math.sqrt(0.0001 * 0.1), 12);
    expect(p.valueAt(1.5)).toBeCloseTo(held, 12);
    p.linearRampToValueAtTime(0.02, 1.2);
    expect(p.valueAt(1.1)).toBeCloseTo((held + 0.02) / 2, 12);
  });

  it('without cancelAndHoldAtTime, holds from now and glides to the value at the hold time', () => {
    const calls: string[] = [];
    const fake = {
      value: 0,
      setValueAtTime: (v: number, t: number) => calls.push(`set ${v.toFixed(4)} @${t}`),
      linearRampToValueAtTime: (v: number, t: number) => calls.push(`lin ${v.toFixed(4)} @${t}`),
      exponentialRampToValueAtTime: (v: number, t: number) => calls.push(`exp ${v.toFixed(4)} @${t}`),
      setTargetAtTime: (v: number, t: number, tc: number) => calls.push(`target ${v} @${t} tc ${tc}`),
      cancelScheduledValues: (t: number) => calls.push(`cancel @${t}`),
    } as unknown as AudioParam;
    const p = new TrackedParam(fake, 0.9);
    p.hold(1.03, 1);
    p.setTargetAtTime(0.0001, 1.03, 8);
    expect(calls).toEqual(['cancel @1', 'set 0.9000 @1', 'lin 0.9000 @1.03', 'target 0.0001 @1.03 tc 8']);
  });
});

describe('NullAudioEngine', () => {
  it('is silent and never unlocks', async () => {
    const engine = new NullAudioEngine();
    expect(await engine.unlock()).toBe(false);
    expect(engine.state).toBe('idle');
    expect(engine.now()).toBe(0);
    engine.tone();
    engine.drones();
    engine.setMaster();
    engine.setVolume();
    engine.releaseVoices();
    engine.fadeDrones();
    engine.onStateChange()();
    await expect(engine.close()).resolves.toBeUndefined();
  });
});
