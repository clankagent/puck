import { RustEngine } from "./rust.js";
import type { InputState } from "./input.js";

export type ZoomInput = "twist" | "press";
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

export function createPanZoom(options: PanZoomOptions = {}): PanZoomController {
  if (
    Object.values(options).some(
      (v) => typeof v === "number" && !Number.isFinite(v),
    )
  )
    throw new RangeError("Speeds and times must be finite and non-negative.");
  const engine = new RustEngine("motion", options);
  return {
    setInput(input) {
      engine.feed(input, 0);
    },
    step(time) {
      return engine.call<MotionDelta>("step", { time });
    },
    setZoomInput(source) {
      engine.call("zoom", { source });
    },
    reset() {
      engine.call("reset");
    },
  };
}
