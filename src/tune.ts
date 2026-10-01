import type { GestureOptions } from "./gestures.js";
export interface ForceBand {
  readonly center: number;
  readonly low: number;
  readonly high: number;
  readonly activation: number;
  readonly release: number;
}
export interface PressTiltTune {
  readonly force: ForceBand;
  readonly minMs: number;
  readonly armMs: number;
  readonly relaxMs: number;
  readonly maxMs: number;
  readonly dominance: number;
}
export interface StandaloneTiltTune {
  readonly rx: ForceBand;
  readonly ry: ForceBand;
  readonly timing: {
    readonly minPulseMs: number;
    readonly maxPulseMs: number;
    readonly neutralMs: number;
    readonly doubleMs: number;
  };
}
export interface GestureTuneData {
  readonly version: 1;
  readonly rotation: ForceBand;
  readonly push: ForceBand;
  readonly pull: ForceBand;
  readonly timing: {
    readonly minPulseMs: number;
    readonly maxPulseMs: number;
    readonly neutralMs: number;
    readonly doubleMs: number;
  };
  readonly dominance: number;
  /** Optional for backward-compatible restoration of 0.2 tunes. Does not enable tilt mode by itself. */
  readonly pressTilt?: PressTiltTune;
  readonly standaloneTilt?: StandaloneTiltTune;
}
export interface GestureTune extends GestureTuneData {
  soften(amount: number): GestureTune;
  harden(amount: number): GestureTune;
  narrow(amount: number): GestureTune;
  widen(amount: number): GestureTune;
  toOptions(): GestureOptions;
  toJSON(): GestureTuneData;
}
import { coreCall } from "./rust.js";
import { freeze } from "./controls.js";
/** Immutable JS methods over Rust-owned tune validation and transformations. */
export function createGestureTune(data?: GestureTuneData): GestureTune {
  const value = freeze(
    coreCall<GestureTuneData>("tune", data === undefined ? {} : { data }),
  );
  const edit = (op: string, amount: number) =>
    createGestureTune(coreCall("tuneEdit", { data: value, edit: op, amount }));
  return Object.freeze({
    ...value,
    soften(amount: number) {
      return edit("soften", amount);
    },
    harden(amount: number) {
      return edit("harden", amount);
    },
    narrow(amount: number) {
      return edit("narrow", amount);
    },
    widen(amount: number) {
      return edit("widen", amount);
    },
    toJSON() {
      return value;
    },
    toOptions() {
      return coreCall<GestureOptions>("tuneOptions", { data: value });
    },
  });
}
export const defaultGestureTune = createGestureTune();
export const gesturePresets = Object.freeze({
  default: defaultGestureTune,
  soft: defaultGestureTune.soften(0.2),
  hard: defaultGestureTune.harden(0.2),
});
