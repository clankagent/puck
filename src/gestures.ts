import { RustEngine } from "./rust.js";
import type { InputState } from "./input.js";
import { defaultGestureTune } from "./tune.js";
import type { GestureTune } from "./tune.js";

export type PulseDirection = "clockwise" | "counterclockwise" | "push" | "pull";
export type TiltDirection = "rx+" | "rx-" | "ry+" | "ry-";
export type GestureDirection = PulseDirection | TiltDirection;
export type PressMode = "simple" | "tilt" | "auto";
export interface GestureOptions {
  /** Push/pull + twist, including holds, is enabled by default. */
  pressRotate?: boolean;
  /** Minimum combined tap duration (default 25 ms). */
  rotateMinMs?: number;
  /** Delay before holdstart (default 250 ms). Holds have no maximum duration. */
  rotateHoldMs?: number;
  /** Enabled by default. Set false to disable standalone rx/ry gestures. */
  standaloneTilt?: boolean;
  tiltXActivation?: number;
  tiltXRelease?: number;
  tiltYActivation?: number;
  tiltYRelease?: number;
  standaloneMinPulseMs?: number;
  standaloneMaxPulseMs?: number;
  standaloneNeutralMs?: number;
  standaloneDoubleMs?: number;
  /** Default auto chooses plain or combined; simple disables combined tilts; tilt suppresses plain singles. Plain doubles work in all modes. */
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
  singleMode?: "exclusive" | "immediate";
  /** Strongest axis must exceed the other by this ratio. */
  dominance?: number;
}
export interface PressRotateHold {
  direction: "push" | "pull";
  rotation: "clockwise" | "counterclockwise";
  startedAt: number;
  pressure: number;
  strength: number;
}
export interface GestureEvent {
  /** Present for push/pull + twist taps or hold lifecycle events. */
  rotation?: "clockwise" | "counterclockwise";
  direction: GestureDirection;
  /** Present for a combined push/pull + tilt. Such events have kind single. */
  tilt?: TiltDirection;
  kind: "single" | "double" | "holdstart" | "holdend" | "holdcancel";
  timestamp: number;
  durationMs: number;
}
export interface GestureRecognizer {
  /** Process every report with a monotonic timestamp; do not discard reports between frames. */
  update(input: Readonly<InputState>, timestampMs: number): GestureEvent[];
  /** Advance pending single/release deadlines, even when no reports arrive. */
  advance(timestampMs: number): GestureEvent[];
  /** Cancel everything and return holdcancel when held. Pass current time; omitted uses last processed time. Fresh neutral is required. */
  reset(timestampMs?: number): GestureEvent[];
  readonly state: {
    hold: PressRotateHold | null;
    phase: "neutral" | "active" | "releasing" | "blocked";
    direction: GestureDirection | null;
    pending: GestureDirection | null;
  };
}

/** Rust recognizer; the host owns device transport and deadline scheduling. */
export function createGestures(
  configuration: GestureOptions | GestureTune = defaultGestureTune,
): GestureRecognizer {
  const options =
    "toOptions" in configuration ? configuration.toOptions() : configuration;
  if (
    Object.values(options).some(
      (v) => typeof v === "number" && !Number.isFinite(v),
    )
  )
    throw new RangeError("Invalid gesture options.");
  const engine = new RustEngine("gestures", options);
  return {
    update(input, time) {
      const tilted =
        options.pressRotate !== false ||
        options.standaloneTilt !== false ||
        (options.pushMode ?? options.pressMode ?? "auto") !== "simple" ||
        (options.pullMode ?? options.pressMode ?? "auto") !== "simple";
      if (
        ![input.z, input.rz, ...(tilted ? [input.rx, input.ry] : [])].every(
          Number.isFinite,
        )
      )
        throw new RangeError("Gesture axes must be finite.");
      return engine.feed(
        {
          x: 0,
          y: 0,
          z: input.z,
          rz: input.rz,
          rx: input.rx ?? 0,
          ry: input.ry ?? 0,
        },
        time,
      );
    },
    advance(time) {
      return engine.call("advance", { time });
    },
    reset(time) {
      return engine.call("reset", { time });
    },
    get state() {
      return engine.call("state");
    },
  };
}
