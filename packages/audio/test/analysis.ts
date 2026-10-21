import { TONE } from '@calm/core';
import { WebAudioEngine } from '../src/index.ts';

export const SR = 48_000;

/** Renders `seconds` of mono audio from an engine attached to a fresh OfflineAudioContext. */
export async function render(
  seconds: number,
  schedule: (engine: WebAudioEngine, ctx: OfflineAudioContext) => void,
  volumeDb?: number,
): Promise<{ data: Float32Array; engine: WebAudioEngine }> {
  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: Math.ceil(seconds * SR), sampleRate: SR });
  const engine = new WebAudioEngine({ context: ctx, volumeDb });
  schedule(engine, ctx);
  const buffer = await ctx.startRendering();
  return { data: buffer.getChannelData(0), engine };
}

/** Runs `fn` when offline rendering reaches `time`, then resumes rendering. */
export function at(ctx: OfflineAudioContext, time: number, fn: () => void): void {
  void ctx.suspend(time).then(() => {
    fn();
    void ctx.resume();
  });
}

/** Largest absolute sample in [from, to) seconds. */
export function peakIn(data: Float32Array, from = 0, to = data.length / SR): number {
  let peak = 0;
  const end = Math.min(data.length, Math.round(to * SR));
  for (let i = Math.max(0, Math.round(from * SR)); i < end; i++) peak = Math.max(peak, Math.abs(data[i]));
  return peak;
}

/** Envelope as the largest absolute sample in consecutive windows; times are window centers. */
export function envelope(data: Float32Array, windowSec = 0.01): { t: number[]; v: number[] } {
  const size = Math.round(windowSec * SR);
  const t: number[] = [],
    v: number[] = [];
  for (let start = 0; start + size <= data.length; start += size) {
    let peak = 0;
    for (let i = start; i < start + size; i++) peak = Math.max(peak, Math.abs(data[i]));
    t.push((start + size / 2) / SR);
    v.push(peak);
  }
  return { t, v };
}

/** Largest sample-to-sample jump. */
export function maxJump(data: Float32Array): number {
  let jump = 0;
  for (let i = 1; i < data.length; i++) jump = Math.max(jump, Math.abs(data[i] - data[i - 1]));
  return jump;
}

/** Steady peak of a unit sine plus a 0.1 second harmonic at hz after the engine's low-pass filter. */
export function voiceFactor(filter: BiquadFilterNode, hz: number): number {
  const mag = new Float32Array(2),
    phase = new Float32Array(2);
  filter.getFrequencyResponse(new Float32Array([hz, 2 * hz]), mag, phase);
  let peak = 0;
  for (let i = 0; i < 8192; i++) {
    const th = (2 * Math.PI * i) / 8192;
    peak = Math.max(peak, Math.abs(mag[0] * Math.sin(th + phase[0]) + TONE.harmonic * mag[1] * Math.sin(2 * th + phase[1])));
  }
  return peak;
}

/** Filter gain for a pure sine at hz. */
export function filterGain(filter: BiquadFilterNode, hz: number): number {
  const mag = new Float32Array(1),
    phase = new Float32Array(1);
  filter.getFrequencyResponse(new Float32Array([hz]), mag, phase);
  return mag[0];
}

export const db = (ratio: number): number => 20 * Math.log10(ratio);

/** Least-squares slope (dB per second) of the envelope in dB between two levels below its peak. */
export function decaySlope(env: { t: number[]; v: number[] }, after: number, topDb: number, bottomDb: number): number {
  const peak = Math.max(...env.v);
  const xs: number[] = [],
    ys: number[] = [];
  env.t.forEach((t, i) => {
    const level = db(env.v[i] / peak);
    if (t > after && level <= topDb && level >= bottomDb) {
      xs.push(t);
      ys.push(level);
    }
  });
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n,
    my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return num / den;
}
