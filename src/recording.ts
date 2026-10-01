import type { InputState } from "./input.js";
import type { GestureEvent, GestureOptions } from "./gestures.js";
import type { GestureTune } from "./tune.js";
export type RecordingEntry =
  | { type: "input"; t: number; input: InputState }
  | { type: "advance" | "reset"; t: number };
export interface GestureRecording {
  version: 1;
  source: "device" | "simulator";
  note: string;
  durationMs: number;
  options: GestureOptions;
  timeline: RecordingEntry[];
  events: GestureEvent[];
}
export interface GestureRecorder {
  readonly full: boolean;
  input(input: Readonly<InputState>, timestampMs: number): void;
  advance(timestampMs: number): void;
  reset(timestampMs: number): void;
  events(events: readonly GestureEvent[]): void;
  snapshot(timestampMs: number): GestureRecording;
}
import { RustEngine, coreCall } from "./rust.js";
/** The host supplies timestamps and chooses if/how recordings are saved. */
export function createGestureRecorder(config: {
  startTimeMs: number;
  tune?: GestureTune;
  options?: GestureOptions;
  source?: "device" | "simulator";
  note?: string;
  maxDurationMs?: number;
  maxEntries?: number;
}): GestureRecorder {
  const engine = new RustEngine("recorder", config);
  return {
    get full() {
      return engine.call("full");
    },
    input(input, time) {
      engine.call("input", { input, time });
    },
    advance(time) {
      engine.call("advance", { time });
    },
    reset(time) {
      engine.call("reset", { time });
    },
    events(events) {
      engine.call("events", { events });
    },
    snapshot(time) {
      return engine.call("snapshot", { time });
    },
  };
}
export function validateGestureRecording(recording: GestureRecording): void {
  coreCall("validateRecording", { recording });
}
