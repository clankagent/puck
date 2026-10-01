import type { TiltDirection } from "./gestures.js";
import type { GestureRecording } from "./recording.js";
import { createGestureTune } from "./tune.js";
import type { GestureTune } from "./tune.js";

export const tiltDirections = ["rx+", "rx-", "ry+", "ry-"] as const;
export type PressTiltActionName = `${"push" | "pull"}.${TiltDirection}`;
export interface PressTiltAction {
  direction: "push" | "pull";
  tilt: TiltDirection;
  kind: "single";
  recording: number;
  start: number;
  end: number;
  pressurePeak: number;
  tiltPeak: number;
  pressureAtTiltPeak: number;
  onsetDelayMs: number;
}
export interface PressTiltCalibration {
  status: "ready" | "incomplete" | "ambiguous";
  tune: GestureTune | null;
  counts: Record<PressTiltActionName, number>;
  missing: PressTiltActionName[];
  actions: PressTiltAction[];
  issues: string[];
}
import { coreCall } from "./rust.js";
export function calibratePressTilts(
  input: GestureRecording | readonly GestureRecording[],
  settings: { baseTune?: GestureTune; minimumPerAction?: number } = {},
): PressTiltCalibration {
  const result = coreCall("calibratePressTilts", {
    recordings: input,
    settings,
  });
  return {
    ...result,
    tune: result.tune ? createGestureTune(result.tune) : null,
  };
}
