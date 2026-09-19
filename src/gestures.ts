import type { InputState } from './input.js';
import { defaultGestureTune } from './tune.js';
import type { GestureTune } from './tune.js';

export type GestureDirection = 'clockwise' | 'counterclockwise' | 'push' | 'pull';
export type TiltDirection = 'rx+' | 'rx-' | 'ry+' | 'ry-';
export type PressMode = 'simple' | 'tilt' | 'auto';
export interface GestureOptions {
  /** Simple preserves 0.2 behavior; tilt suppresses plain singles; auto chooses. Plain doubles work in all modes. */
  pressMode?: PressMode;
  pushMode?: PressMode;
  pullMode?: PressMode;
  tiltActivation?: number;
  tiltRelease?: number;
  tiltMinMs?: number;
  tiltArmMs?: number;
  tiltRelaxMs?: number;
  tiltMaxMs?: number;
  tiltDominance?: number;
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
  /** Present for a combined push/pull + tilt. Such events have kind single. */
  tilt?: TiltDirection;
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
  const modes = {push: options.pushMode ?? options.pressMode ?? 'simple', pull: options.pullMode ?? options.pressMode ?? 'simple'};
  const tiltActivation = options.tiltActivation ?? defaultGestureTune.pressTilt!.force.activation, tiltRelease = options.tiltRelease ?? defaultGestureTune.pressTilt!.force.release;
  const tiltMinMs = options.tiltMinMs ?? 25, tiltArmMs = options.tiltArmMs ?? 450;
  const tiltRelaxMs = options.tiltRelaxMs ?? 180, tiltMaxMs = options.tiltMaxMs ?? 1000;
  const tiltDominance = options.tiltDominance ?? 1.25;
  const tiltEnabled = modes.push !== 'simple' || modes.pull !== 'simple';
  const tiltMode = (d: GestureDirection) => (d === 'push' || d === 'pull') && modes[d] !== 'simple';
  if ([options.pressMode, options.pushMode, options.pullMode].some(v=>v!==undefined&&!['simple','tilt','auto'].includes(v))
    || ![tiltActivation,tiltRelease,tiltMinMs,tiltArmMs,tiltRelaxMs,tiltMaxMs,tiltDominance].every(Number.isFinite)
    || tiltRelease < 0 || tiltActivation <= tiltRelease || tiltActivation > 1 || tiltDominance <= 1
    || tiltMinMs < 0 || tiltArmMs < tiltMinMs || tiltArmMs > tiltMaxMs || tiltMaxMs > 10000
    || tiltRelaxMs < 0 || tiltRelaxMs > tiltArmMs || (tiltEnabled && singleMode !== 'exclusive')) throw new RangeError('Invalid press-tilt options; combined gestures require exclusive single mode.');
  if (![activation, release, twistActivation, twistRelease, minPulseMs, maxPulseMs, neutralMs, doubleMs, dominance].every(Number.isFinite)
    || release < 0 || activation <= release || activation > 1 || minPulseMs < 0
    || twistRelease < 0 || twistActivation <= twistRelease || twistActivation > 1
    || Object.values(thresholds).some(v => !Number.isFinite(v.activation) || !Number.isFinite(v.release) || v.release < 0 || v.activation <= v.release || v.activation > 1)
    || maxPulseMs < minPulseMs || neutralMs < 0 || doubleMs < 0 || dominance < 1
    || !['exclusive', 'immediate'].includes(singleMode)) throw new RangeError('Invalid gesture options.');
  let last = -Infinity;
  let z = 0, rz = 0, rx = 0, ry = 0;
  let phase: 'neutral' | 'active' | 'releasing' | 'blocked' = 'blocked';
  let active: { direction: GestureDirection; start: number; tilt?: TiltDirection; tiltPeak?: number; candidate?: TiltDirection; candidateAt?: number; candidatePeak?: number; attemptedTilt?: boolean; borrowed?: boolean; tiltEligible?: boolean } | null = null;
  let releasedAt: number | null = null;
  let pending: GestureEvent | null = null;
  const tiltNeutral = () => Math.max(Math.abs(rx),Math.abs(ry)) <= tiltRelease;
  const neutral = () => Math.abs(z) <= thresholds[z >= 0 ? 'push' : 'pull'].release
    && Math.abs(rz) <= thresholds[rz >= 0 ? 'clockwise' : 'counterclockwise'].release
    && (!(active ? tiltMode(active.direction) : tiltEnabled) || tiltNeutral());
  const allowSingle = (e: GestureEvent) => e.direction !== 'push' && e.direction !== 'pull' || modes[e.direction as 'push'|'pull'] !== 'tilt';
  const pendingStart = () => pending!.timestamp-neutralMs-pending!.durationMs;
  const canResume = (t: number) => pending && tiltMode(pending.direction) && t <= pending.timestamp-neutralMs+tiltRelaxMs && t <= pendingStart()+tiltArmMs;
  const deadline = (e: GestureEvent) => e.timestamp + (tiltMode(e.direction)?Math.max(doubleMs,tiltRelaxMs+tiltMinMs):doubleMs);
  function tiltDirection(): TiltDirection | undefined {
    if (Math.abs(rx)>=tiltActivation && Math.abs(rx)>=Math.abs(ry)*tiltDominance) return rx>0?'rx+':'rx-';
    if (Math.abs(ry)>=tiltActivation && Math.abs(ry)>=Math.abs(rx)*tiltDominance) return ry>0?'ry+':'ry-';
    return undefined;
  }
  function clock(t: number) {
    if (!Number.isFinite(t) || t < last) throw new RangeError('Gesture timestamps must be finite and monotonic.');
    last = t;
  }
  function tick(t: number): GestureEvent[] {
    const events: GestureEvent[] = [];
    if (active?.candidate && active.candidateAt !== undefined && t >= active.candidateAt + tiltMinMs
      && (!active.tilt || active.candidate === active.tilt || active.candidatePeak! > active.tiltPeak! * tiltDominance)) {
      if (canResume(active.candidateAt) && pending!.direction === active.direction) {
        active.start=pendingStart();pending=null;
      }
      active.tilt=active.candidate;
      active.tiltPeak=Math.max(active.tiltPeak??0,active.candidatePeak??0);
    }
    if (phase === 'releasing' && releasedAt !== null && active && t >= releasedAt + neutralMs) {
      const durationMs = releasedAt - active.start;
      const completedAt = releasedAt + neutralMs;
      if (active.tilt && durationMs <= tiltMaxMs) {
        // Combined gestures consume one excursion; repeats are separate actions, not tilt doubles.
        if (pending && allowSingle(pending)) events.push({...pending,timestamp:Math.min(completedAt,deadline(pending))});
        pending=null;
        events.push({direction:active.direction,tilt:active.tilt,kind:'single',timestamp:completedAt,durationMs});
      } else if (!active.borrowed && !active.attemptedTilt && durationMs >= minPulseMs && durationMs <= maxPulseMs) {
        const pulse: GestureEvent = { direction: active.direction, kind: 'single', timestamp: completedAt, durationMs };
        if (pending && pending.direction === pulse.direction && completedAt - pending.timestamp <= doubleMs) {
          events.push({ ...pulse, kind: 'double' });
          pending = null;
        } else {
          if (pending && singleMode === 'exclusive' && allowSingle(pending)) events.push({ ...pending, timestamp: Math.min(completedAt, deadline(pending)) });
          pending = pulse;
          if (singleMode === 'immediate' && allowSingle(pulse)) events.push(pulse);
        }
      }
      active = null; releasedAt = null; phase = 'neutral';
    }
    if (active && phase === 'active' && t - active.start > (active.tilt || active.candidate ? tiltMaxMs : maxPulseMs)) {
      phase = 'blocked'; active = null;
    }
    // A double is defined by completion-to-completion time, including neutral dwell.
    if (pending && t > deadline(pending)) {
      if (singleMode === 'exclusive' && allowSingle(pending)) events.push({ ...pending, timestamp: deadline(pending) });
      pending = null;
    }
    return events;
  }
  return {
    get state() { return { phase, direction: active?.direction ?? null, pending: pending?.direction ?? null }; },
    reset() { last = -Infinity; z = rz = rx = ry = 0; active = pending = null; releasedAt = null; phase = 'blocked'; },
    advance(t) { clock(t); return tick(t); },
    update(input, t) {
      if (![input.z,input.rz,...(tiltEnabled?[input.rx,input.ry]:[])].every(Number.isFinite)) throw new RangeError('Gesture axes must be finite.');
      clock(t);
      const events = tick(t);
      const tiltWasBelowActivation = Math.max(Math.abs(rx),Math.abs(ry)) < tiltActivation;
      z = Math.max(-1, Math.min(1, input.z)); rz = Math.max(-1, Math.min(1, input.rz));
      if (tiltEnabled) {rx=Math.max(-1,Math.min(1,input.rx));ry=Math.max(-1,Math.min(1,input.ry));}
      if (phase === 'blocked') { if (neutral()) phase = 'neutral'; return events; }
      const side = tiltEnabled ? tiltDirection() : undefined;
      if (!active && side && canResume(t)) {
        active={direction:pending!.direction,start:pendingStart(),borrowed:true,tiltEligible:true};phase='active';
      }
      if (active) {
        if (tiltMode(active.direction) && active.tiltEligible) {
          if (Math.max(Math.abs(rx),Math.abs(ry))>=tiltActivation) active.attemptedTilt=true;
          if (side && (active.tilt || active.candidate===side || t-active.start<=tiltArmMs)) {
            const strength=Math.abs(side.startsWith('rx')?rx:ry);
            if (active.candidate!==side) {active.candidate=side;active.candidateAt=t;active.candidatePeak=strength;}
            else active.candidatePeak=Math.max(active.candidatePeak??0,strength);
          } else {active.candidate=undefined;active.candidateAt=undefined;active.candidatePeak=undefined;}
        }
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
          active = { direction, start: t, tiltEligible:tiltWasBelowActivation };
          if (tiltMode(direction) && active.tiltEligible && side) {active.candidate=side;active.candidateAt=t;active.candidatePeak=Math.abs(side.startsWith('rx')?rx:ry);active.attemptedTilt=true;}
          phase = 'active';
        }
      }
      return events.concat(tick(t));
    },
  };
}
