import type { CalibrationStats } from "./calibration.js";
import type { TiltDirection } from "./gestures.js";
import type { GestureRecording } from "./recording.js";
import { createGestureTune } from "./tune.js";
import type { GestureTune } from "./tune.js";

export type TiltActionName = `${TiltDirection}.${"single" | "double"}`;
export interface TiltCalibrationAction {
  direction: TiltDirection;
  kind: "single" | "double";
  start: number;
  end: number;
  recording: number;
}
export interface TiltCalibration {
  status: "ready" | "incomplete" | "ambiguous";
  tune: GestureTune | null;
  counts: Record<TiltActionName, number>;
  missing: TiltActionName[];
  actions: TiltCalibrationAction[];
  stats: Partial<Record<TiltDirection, CalibrationStats>>;
  issues: string[];
}
import { coreCall } from "./rust.js";
export function calibrateTilts(
  input: GestureRecording | readonly GestureRecording[],
  settings: { baseTune?: GestureTune; minimumPerAction?: number } = {},
): TiltCalibration {
  const result = coreCall("calibrateTilts", { recordings: input, settings });
  return {
    ...result,
    tune: result.tune ? createGestureTune(result.tune) : null,
  };
}
