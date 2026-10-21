type Kind = 'set' | 'linear' | 'exponential' | 'target';

/** One automation event as the Web Audio timeline evaluates it. */
interface Segment {
  kind: Kind;
  /** Start time and value. */
  t0: number;
  v0: number;
  /** End time and value of a ramp; the target value of a setTarget. */
  t1: number;
  v1: number;
  /** Time constant of a setTarget. */
  tc: number;
}

function evaluate(s: Segment, t: number): number {
  switch (s.kind) {
    case 'set':
      return s.v1;
    case 'linear':
      return t >= s.t1 || s.t1 <= s.t0 ? s.v1 : s.v0 + (s.v1 - s.v0) * ((t - s.t0) / (s.t1 - s.t0));
    case 'exponential':
      return t >= s.t1 || s.t1 <= s.t0 ? s.v1 : s.v0 * (s.v1 / s.v0) ** ((t - s.t0) / (s.t1 - s.t0));
    case 'target':
      return t <= s.t0 ? s.v0 : s.v1 + (s.v0 - s.v1) * Math.exp(-(t - s.t0) / s.tc);
  }
}

/**
 * An AudioParam whose automation is mirrored here, so that every change can start from the exact
 * value the param will have at that moment. A ramp in Web Audio starts at the previous event, which
 * may lie far in the past; anchoring each change with an explicit value keeps gain changes click-free.
 */
export class TrackedParam {
  readonly param: AudioParam;
  private segments: Segment[];

  /** Sets the param's value directly; only call this before the node makes any sound. */
  constructor(param: AudioParam, value: number) {
    this.param = param;
    param.value = value;
    this.segments = [{ kind: 'set', t0: 0, v0: value, t1: 0, v1: value, tc: 0 }];
  }

  /** The value the param will have at time t, as currently scheduled. */
  valueAt(t: number): number {
    let active = this.segments[0];
    for (const s of this.segments) {
      if (s.t0 <= t) active = s;
      else break;
    }
    return evaluate(active, t);
  }

  /** Time and value where the next ramp would start. */
  private get end(): { t: number; v: number } {
    const last = this.segments[this.segments.length - 1];
    const t = last.kind === 'linear' || last.kind === 'exponential' ? last.t1 : last.t0;
    return { t, v: this.valueAt(t) };
  }

  private push(segment: Segment): void {
    this.segments = this.segments.filter((s) => s.t0 < segment.t0);
    if (this.segments.length === 0) this.segments.push({ kind: 'set', t0: 0, v0: segment.v0, t1: 0, v1: segment.v0, tc: 0 });
    this.segments.push(segment);
  }

  /**
   * Freezes the curve at time `at`: later automation is cancelled and the value at `at` is anchored
   * there. `now` is the context's current time. Returns the held value.
   */
  hold(at: number, now: number): number {
    const v = this.valueAt(at);
    const p = this.param;
    if (typeof p.cancelAndHoldAtTime === 'function') {
      p.cancelAndHoldAtTime(at);
      p.setValueAtTime(v, at);
    } else {
      // Engines without cancelAndHoldAtTime: hold the mirrored value from now and glide to the value at `at`.
      const vNow = this.valueAt(now);
      p.cancelScheduledValues(now);
      p.setValueAtTime(vNow, now);
      if (at > now) p.linearRampToValueAtTime(v, at);
    }
    this.segments = this.segments.filter((s) => s.t0 < at);
    this.segments.push({ kind: 'set', t0: at, v0: v, t1: at, v1: v, tc: 0 });
    return v;
  }

  setValueAtTime(value: number, t: number): void {
    this.param.setValueAtTime(value, t);
    this.push({ kind: 'set', t0: t, v0: value, t1: t, v1: value, tc: 0 });
  }

  linearRampToValueAtTime(value: number, t: number): void {
    const start = this.end;
    this.param.linearRampToValueAtTime(value, t);
    this.segments.push({ kind: 'linear', t0: start.t, v0: start.v, t1: t, v1: value, tc: 0 });
  }

  exponentialRampToValueAtTime(value: number, t: number): void {
    const start = this.end;
    this.param.exponentialRampToValueAtTime(value, t);
    this.segments.push({ kind: 'exponential', t0: start.t, v0: start.v, t1: t, v1: value, tc: 0 });
  }

  setTargetAtTime(target: number, t: number, timeConstant: number): void {
    const v0 = this.valueAt(t);
    this.param.setTargetAtTime(target, t, timeConstant);
    this.push({ kind: 'target', t0: t, v0, t1: t, v1: target, tc: timeConstant });
  }
}
