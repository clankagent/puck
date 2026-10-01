import { neutralInput } from './input.js';
import type { InputState } from './input.js';

export type ZoomInput = 'twist' | 'press';
export interface PanZoomOptions {
  /** Positive twist or downward pressure zooms in. Default: twist. */
  zoomInput?: ZoomInput;
  /** Screen pixels per second at full deflection. Default: 1320. */
  panSpeed?: number;
  /** Logarithmic zoom change per second at full deflection. Default: 1.5. */
  zoomSpeed?: number;
  panDeadzone?: number;
  zoomDeadzone?: number;
  /** Acceleration response time. Neutral and reversal do not coast. Default: 25 ms. */
  responseMs?: number;
  /** Maximum integrated interval after a render stall. Default: 50 ms. */
  maxFrameMs?: number;
}
export interface MotionDelta {
  panX: number;
  panY: number;
  zoomFactor: number;
  moving: boolean;
}
export interface PanZoomController {
  /** Copy the latest deflection. Safe to pass directly as a callback. */
  setInput(input: Readonly<InputState>): void;
  /** Call once per render frame with a monotonic timestamp in milliseconds. */
  step(timestampMs: number): MotionDelta;
  setZoomInput(input: ZoomInput): void;
  /** Clear input and response when application input ownership changes. */
  reset(): void;
}

const idle: Readonly<MotionDelta> = Object.freeze({ panX: 0, panY: 0, zoomFactor: 1, moving: false });
function deadzone(value: number, threshold: number): number {
  const unit = Math.max(-1, Math.min(1, value));
  return Math.abs(unit) <= threshold ? 0 : Math.sign(unit) * (Math.abs(unit) - threshold) / (1 - threshold);
}

/** Stateful input processing; owns no camera, render loop, DOM, or event listeners. */
export function createPanZoom(options: PanZoomOptions = {}): PanZoomController {
  let zoomInput = options.zoomInput ?? 'twist';
  const panSpeed = options.panSpeed ?? 1320;
  const zoomSpeed = options.zoomSpeed ?? 1.5;
  const panDeadzone = options.panDeadzone ?? .05;
  const zoomDeadzone = options.zoomDeadzone ?? .1;
  const responseMs = options.responseMs ?? 25;
  const maxFrameMs = options.maxFrameMs ?? 50;
  if (![panSpeed, zoomSpeed, responseMs, maxFrameMs].every(v => Number.isFinite(v) && v >= 0)
    || ![panDeadzone, zoomDeadzone].every(v => Number.isFinite(v) && v >= 0 && v < 1)) {
    throw new RangeError('Speeds and times must be finite and non-negative; deadzones must be in [0, 1).');
  }
  let current: InputState = { ...neutralInput };
  let previous: number | undefined;
  const velocity = [0, 0, 0];

  function integrate(target: number, i: number, dt: number): number {
    if (target === 0) { velocity[i] = 0; return 0; }
    if (responseMs === 0) { velocity[i] = target; return target * dt / 1000; }
    const initial = velocity[i] * target < 0 ? 0 : velocity[i];
    const blend = -Math.expm1(-dt / responseMs);
    velocity[i] = initial + (target - initial) * blend;
    return (target * dt + (initial - target) * responseMs * blend) / 1000;
  }
  return {
    setInput(input) { current = { ...input }; },
    setZoomInput(input) { zoomInput = input; velocity[2] = 0; },
    reset() { current = { ...neutralInput }; velocity.fill(0); previous = undefined; },
    step(timestamp) {
      // Duplicate/out-of-order timestamps must not introduce extra elapsed time.
      if (previous !== undefined && timestamp <= previous) return idle;
      const dt = previous === undefined ? 0 : Math.min(maxFrameMs, timestamp - previous);
      previous = timestamp;
      const panX = integrate(deadzone(-current.x, panDeadzone), 0, dt) * panSpeed;
      const panY = integrate(deadzone(-current.y, panDeadzone), 1, dt) * panSpeed;
      const logZoom = integrate(deadzone(zoomInput === 'press' ? current.z : current.rz, zoomDeadzone), 2, dt) * zoomSpeed;
      if (panX === 0 && panY === 0 && logZoom === 0) return idle;
      return { panX, panY, zoomFactor: Math.exp(logZoom), moving: true };
    },
  };
}
