import type { PulseDirection as GestureDirection } from "./gestures.js";
import { createGestureTune } from "./tune.js";
import type { GestureTune } from "./tune.js";
import type { GestureRecording } from "./recording.js";
export const gestureDirections = [
  "clockwise",
  "counterclockwise",
  "push",
  "pull",
] as const;
export type GestureActionName = `${GestureDirection}.${"single" | "double"}`;
export interface CalibrationPulse {
  direction: GestureDirection;
  start: number;
  end: number;
  peak: number;
  peakTime: number;
  valleyBefore: number;
  recording: number;
  segment: number;
}
export interface CalibrationAction {
  direction: GestureDirection;
  kind: "single" | "double";
  start: number;
  end: number;
  pulses: CalibrationPulse[];
  recording: number;
}
export interface CalibrationStats {
  count: number;
  center: number;
  low: number;
  high: number;
  min: number;
  max: number;
}
export interface GestureCalibration {
  status: "ready" | "incomplete" | "ambiguous";
  tune: GestureTune | null;
  counts: Record<GestureActionName, number>;
  missing: GestureActionName[];
  pulses: CalibrationPulse[];
  actions: CalibrationAction[];
  stats: Partial<Record<GestureDirection, CalibrationStats>>;
  issues: string[];
}
import { coreCall } from "./rust.js";
/** Raw pulse inference and statistics are implemented in Rust. */
export function calibrateGestures(
  input: GestureRecording | readonly GestureRecording[],
  settings: {
    minimumPerAction?: number;
    detectionFloor?: number;
    pairGapMs?: number;
  } = {},
): GestureCalibration {
  const result = coreCall("calibrateGestures", { recordings: input, settings });
  return {
    ...result,
    tune: result.tune ? createGestureTune(result.tune) : null,
  };
}
