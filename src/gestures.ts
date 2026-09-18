import type { InputState } from './input.js';
import { defaultGestureTune } from './tune.js';
import type { GestureTune } from './tune.js';

export type GestureDirection = 'clockwise' | 'counterclockwise' | 'push' | 'pull';
export interface GestureOptions {
  activation?: number;
  release?: number;
  /** Optional axis-specific thresholds; fall back to activation/release. */
  pressActivation?: number;
  pressRelease?: number;
  twistActivation?: number;
  twistRelease?: number;
  clockwiseActivation?: number;
  clockwiseRelease?: number;
  counterclockwiseActivation?: number;
  counterclockwiseRelease?: number;
  pushActivation?: number;
  pushRelease?: number;
  pullActivation?: number;
  pullRelease?: number;
  minPulseMs?: number;
  maxPulseMs?: number;
  neutralMs?: number;
  doubleMs?: number;
  /** Exclusive waits for a double; immediate emits single, then double (additive). */
  singleMode?: 'exclusive' | 'immediate';
  /** Strongest axis must exceed the other by this ratio. */
  dominance?: number;
}
export interface GestureEvent {
  direction: GestureDirection;
  kind: 'single' | 'double';
  timestamp: number;
  durationMs: number;
}
export interface GestureRecognizer {
  /** Process every report with a monotonic timestamp; do not discard reports between frames. */
  update(input: Readonly<InputState>, timestampMs: number): GestureEvent[];
  /** Advance pending single/release deadlines, even when no reports arrive. */
  advance(timestampMs: number): GestureEvent[];
  /** Cancel everything. Fresh neutral input is required before rearming. */
  reset(): void;
  readonly state: { phase: 'neutral' | 'active' | 'releasing' | 'blocked'; direction: GestureDirection | null; pending: GestureDirection | null };
}

/** Experimental pulse recognizer. No timers, DOM, transport, or motion side effects. */
export function createGestures(configuration: GestureOptions | GestureTune = defaultGestureTune): GestureRecognizer {
  const options = 'toOptions' in configuration ? configuration.toOptions() : configuration;
  const activation = options.activation ?? .35;
  const release = options.release ?? .12;
  const pressActivation = options.pressActivation ?? options.activation;
  const pressRelease = options.pressRelease ?? options.release;
  const twistActivation = options.twistActivation ?? options.activation ?? defaultGestureTune.rotation.activation;
  const twistRelease = options.twistRelease ?? options.release ?? defaultGestureTune.rotation.release;
  const thresholds = {
    clockwise: { activation: options.clockwiseActivation ?? twistActivation, release: options.clockwiseRelease ?? twistRelease },
    counterclockwise: { activation: options.counterclockwiseActivation ?? twistActivation, release: options.counterclockwiseRelease ?? twistRelease },
    push: { activation: options.pushActivation ?? pressActivation ?? defaultGestureTune.push.activation, release: options.pushRelease ?? pressRelease ?? defaultGestureTune.push.release },
    pull: { activation: options.pullActivation ?? pressActivation ?? defaultGestureTune.pull.activation, release: options.pullRelease ?? pressRelease ?? defaultGestureTune.pull.release },
  };
  const minPulseMs = options.minPulseMs ?? 35;
  const maxPulseMs = options.maxPulseMs ?? 650;
  const neutralMs = options.neutralMs ?? defaultGestureTune.timing.neutralMs;
  const doubleMs = options.doubleMs ?? defaultGestureTune.timing.doubleMs;
  const singleMode = options.singleMode ?? 'exclusive';
  const dominance = options.dominance ?? 1.4;
  if (![activation, release, twistActivation, twistRelease, minPulseMs, maxPulseMs, neutralMs, doubleMs, dominance].every(Number.isFinite)
    || release < 0 || activation <= release || activation > 1 || minPulseMs < 0
    || twistRelease < 0 || twistActivation <= twistRelease || twistActivation > 1
    || Object.values(thresholds).some(v => !Number.isFinite(v.activation) || !Number.isFinite(v.release) || v.release < 0 || v.activation <= v.release || v.activation > 1)
    || maxPulseMs < minPulseMs || neutralMs < 0 || doubleMs < 0 || dominance < 1
    || !['exclusive', 'immediate'].includes(singleMode)) throw new RangeError('Invalid gesture options.');
  let last = -Infinity;
  let z = 0, rz = 0;
  let phase: 'neutral' | 'active' | 'releasing' | 'blocked' = 'blocked';
  let active: { direction: GestureDirection; start: number } | null = null;
  let releasedAt: number | null = null;
  let pending: GestureEvent | null = null;
  const neutral = () => Math.abs(z) <= thresholds[z >= 0 ? 'push' : 'pull'].release
    && Math.abs(rz) <= thresholds[rz >= 0 ? 'clockwise' : 'counterclockwise'].release;
  function clock(t: number) {
    if (!Number.isFinite(t) || t < last) throw new RangeError('Gesture timestamps must be finite and monotonic.');
    last = t;
  }
  function tick(t: number): GestureEvent[] {
    const events: GestureEvent[] = [];
    if (phase === 'releasing' && releasedAt !== null && active && t >= releasedAt + neutralMs) {
      const durationMs = releasedAt - active.start;
      const completedAt = releasedAt + neutralMs;
      if (durationMs >= minPulseMs && durationMs <= maxPulseMs) {
        const pulse: GestureEvent = { direction: active.direction, kind: 'single', timestamp: completedAt, durationMs };
        if (pending && pending.direction === pulse.direction && completedAt - pending.timestamp <= doubleMs) {
          events.push({ ...pulse, kind: 'double' });
          pending = null;
        } else {
          if (pending && singleMode === 'exclusive') events.push({ ...pending, timestamp: Math.min(completedAt, pending.timestamp + doubleMs) });
          pending = pulse;
          if (singleMode === 'immediate') events.push(pulse);
        }
      }
      active = null; releasedAt = null; phase = 'neutral';
    }
    if (active && phase === 'active' && t - active.start > maxPulseMs) {
      phase = 'blocked'; active = null;
    }
    // A double is defined by completion-to-completion time, including neutral dwell.
    if (pending && t > pending.timestamp + doubleMs) {
      if (singleMode === 'exclusive') events.push({ ...pending, timestamp: pending.timestamp + doubleMs });
      pending = null;
    }
    return events;
  }
  return {
    get state() { return { phase, direction: active?.direction ?? null, pending: pending?.direction ?? null }; },
    reset() { last = -Infinity; z = rz = 0; active = pending = null; releasedAt = null; phase = 'blocked'; },
    advance(t) { clock(t); return tick(t); },
    update(input, t) {
      if (!Number.isFinite(input.z) || !Number.isFinite(input.rz)) throw new RangeError('Gesture axes must be finite.');
      clock(t);
      const events = tick(t);
      z = Math.max(-1, Math.min(1, input.z)); rz = Math.max(-1, Math.min(1, input.rz));
      if (phase === 'blocked') { if (neutral()) phase = 'neutral'; return events; }
      if (active) {
        const signed = active.direction === 'push' ? z : active.direction === 'pull' ? -z : active.direction === 'clockwise' ? rz : -rz;
        if (neutral()) {
          if (releasedAt === null) releasedAt = t;
          phase = 'releasing';
        } else if (signed < -thresholds[active.direction].release) {
          // Reversal without a neutral dwell is not a completed pulse.
          active = null; releasedAt = null; phase = 'blocked';
        } else { phase = 'active'; releasedAt = null; }
      } else {
        const vertical = Math.abs(z) >= Math.abs(rz);
        const strong = vertical ? Math.abs(z) : Math.abs(rz);
        const weak = vertical ? Math.abs(rz) : Math.abs(z);
        const direction = vertical ? (z > 0 ? 'push' : 'pull') : (rz > 0 ? 'clockwise' : 'counterclockwise');
        if (strong >= thresholds[direction].activation && strong >= weak * dominance) {
          active = { direction, start: t };
          phase = 'active';
        }
      }
      return events.concat(tick(t));
    },
  };
}
