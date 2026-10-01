import type { InputState } from './input.js';
import type { GestureEvent, GestureOptions, GestureRecognizer, PressRotateHold } from './gestures.js';
import { defaultGestureTune } from './tune.js';

/** Arbitration around the pulse recognizer; the caller still owns the clock. */
export function withPressRotate(pulses: GestureRecognizer & { cancelExcursion(): void }, options: GestureOptions): GestureRecognizer {
  const enabled = options.pressRotate ?? true;
  const minMs = options.rotateMinMs ?? 25, holdMs = options.rotateHoldMs ?? 250;
  if (typeof enabled !== 'boolean' || !Number.isFinite(minMs) || !Number.isFinite(holdMs) || minMs < 0 || holdMs < minMs) throw new RangeError('Invalid press-rotate options.');
  if (!enabled) return pulses;
  const gates = {
    push: { activation: options.pushActivation ?? options.pressActivation ?? options.activation ?? defaultGestureTune.push.activation, release: options.pushRelease ?? options.pressRelease ?? options.release ?? defaultGestureTune.push.release },
    pull: { activation: options.pullActivation ?? options.pressActivation ?? options.activation ?? defaultGestureTune.pull.activation, release: options.pullRelease ?? options.pressRelease ?? options.release ?? defaultGestureTune.pull.release },
    clockwise: { activation: options.clockwiseActivation ?? options.twistActivation ?? options.activation ?? defaultGestureTune.rotation.activation, release: options.clockwiseRelease ?? options.twistRelease ?? options.release ?? defaultGestureTune.rotation.release },
    counterclockwise: { activation: options.counterclockwiseActivation ?? options.twistActivation ?? options.activation ?? defaultGestureTune.rotation.activation, release: options.counterclockwiseRelease ?? options.twistRelease ?? options.release ?? defaultGestureTune.rotation.release },
  };
  const rxRelease = Math.min(options.tiltRelease ?? defaultGestureTune.pressTilt!.force.release, options.tiltXRelease ?? defaultGestureTune.standaloneTilt!.rx.release);
  const ryRelease = Math.min(options.tiltRelease ?? defaultGestureTune.pressTilt!.force.release, options.tiltYRelease ?? defaultGestureTune.standaloneTilt!.ry.release);
  let last = -Infinity, armed: 'push' | 'pull' | null = null, blocked = true;
  let pair: { direction: 'push' | 'pull'; rotation: 'clockwise' | 'counterclockwise'; start: number; holding: boolean; pressure: number; strength: number } | null = null;
  const clock = (t: number) => { if (!Number.isFinite(t) || t < last) throw new RangeError('Gesture timestamps must be finite and monotonic.'); last = t; };
  const event = (kind: GestureEvent['kind'], t: number): GestureEvent => ({ direction: pair!.direction, rotation: pair!.rotation, kind, timestamp: t, durationMs: t - pair!.start });
  function tick(t: number): GestureEvent[] {
    if (pair && !pair.holding && t >= pair.start + holdMs) { pair.holding = true; return [event('holdstart', pair.start + holdMs)]; }
    return [];
  }
  return {
    get state() {
      const hold: PressRotateHold | null = pair?.holding ? { direction: pair.direction, rotation: pair.rotation, startedAt: pair.start + holdMs, pressure: pair.pressure, strength: pair.strength } : null;
      return pair ? { phase: 'active' as const, direction: pair.direction, pending: null, hold } : { ...pulses.state, hold };
    },
    reset(t = Number.isFinite(last) ? last : 0) {
      clock(t); const events = pair?.holding ? [event('holdcancel', t)] : [];
      pair = null; armed = null; blocked = true; last = -Infinity; pulses.reset(); return events;
    },
    advance(t) { clock(t); return pair ? pulses.advance(t).concat(tick(t)).sort((a,b) => a.timestamp - b.timestamp) : pulses.advance(t); },
    update(input: Readonly<InputState>, t: number) {
      if (![input.z,input.rz,input.rx,input.ry].every(Number.isFinite)) throw new RangeError('Gesture axes must be finite.');
      clock(t);
      const z = Math.max(-1, Math.min(1, input.z)), rz = Math.max(-1, Math.min(1, input.rz));
      const direction = z >= 0 ? 'push' : 'pull', rotation = rz >= 0 ? 'clockwise' : 'counterclockwise';
      const tiltRest = Math.abs(input.rx) <= rxRelease && Math.abs(input.ry) <= ryRelease;
      const rest = Math.abs(z) <= gates[direction].release && Math.abs(rz) <= gates[rotation].release && tiltRest;
      if (pair) {
        const events = pulses.advance(t).concat(tick(t));
        const pressure = z * (pair.direction === 'push' ? 1 : -1), strength = rz * (pair.rotation === 'clockwise' ? 1 : -1);
        const reversed = pressure < -gates[pair.direction === 'push' ? 'pull' : 'push'].release || strength < -gates[pair.rotation === 'clockwise' ? 'counterclockwise' : 'clockwise'].release;
        if (reversed || pressure <= gates[pair.direction].release || strength <= gates[pair.rotation].release) {
          if (pair.holding) events.push(event(reversed ? 'holdcancel' : 'holdend', t));
          else if (!reversed && t - pair.start >= minMs) events.push(event('single', t));
          pair = null; armed = null; blocked = !rest; pulses.cancelExcursion();
          if (rest) pulses.update(input, t);
        } else { pair.pressure = pressure; pair.strength = strength; }
        return events;
      }
      if (rest) { blocked = false; armed = null; }
      if (!blocked) {
        if (!armed && Math.abs(z) >= gates[direction].activation && (Math.abs(rz) < gates[rotation].activation || Math.abs(z) * (options.dominance ?? 1.4) >= Math.abs(rz)) && tiltRest) armed = direction;
        if (armed && (z * (armed === 'push' ? 1 : -1) <= gates[armed].release || !tiltRest)) { armed = null; blocked = !rest; }
        if (armed && Math.abs(rz) >= gates[rotation].activation) {
          pair = { direction: armed, rotation, start: t, holding: false, pressure: Math.abs(z), strength: Math.abs(rz) };
          pulses.cancelExcursion(); return pulses.advance(t).concat(tick(t));
        }
        // Twist/tilt first owns this excursion; pressure cannot steal it later.
        if (!armed && (Math.abs(rz) >= gates[rotation].activation || !tiltRest)) blocked = true;
      }
      return pulses.update(input, t);
    },
  };
}
