import { coreCall } from "./rust.js";
import type { GestureOptions, TiltDirection } from "./gestures.js";
import type { InputState } from "./input.js";

export type Axis = keyof InputState;
export type Source =
  | "slide"
  | "tilt"
  | "translation"
  | "rotation"
  | "pressure"
  | "twist"
  | "push"
  | "pull"
  | "axes";
/** Semantic tilt vectors are [horizontal, vertical], right/down positive: [-ry, rx]. Raw rotation/axes stay in device order. */
export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type SourceValue<S extends Source> = S extends "axes"
  ? Readonly<InputState>
  : S extends "slide" | "tilt"
    ? Vec2
    : S extends "translation" | "rotation"
      ? Vec3
      : number;
export type Interpretation = "deflection" | "velocity" | "direction";
declare const velocity: unique symbol;
export type Velocity<T> = T & { readonly [velocity]: true };
export type ContinuousValue<
  S extends Source,
  A extends Interpretation,
> = A extends "direction"
  ? number | null
  : A extends "velocity"
    ? Velocity<SourceValue<S>>
    : SourceValue<S>;
export type Ownership =
  | "shared"
  | "exclusive"
  | "observe"
  | {
      readonly mode: "shared" | "exclusive" | "observe";
      readonly channels?: "used" | "all" | readonly Axis[];
    };
export interface ContinuousOptions<A extends Interpretation = Interpretation> {
  as?: A;
  speed?: number | { translation: number; rotation: number };
  deadzone?: number;
  responseMs?: number;
  curve?: number;
  scale?: Partial<InputState>;
  ownership?: Ownership;
  /** Direction interpretation is only available for slide/tilt. */
  sectors?: number;
  hysteresis?: number;
  sticky?: boolean;
}
export type Activation = "push" | "pull" | "cw" | "ccw" | TiltDirection;
export type GestureInput =
  | Activation
  | "twist"
  | { readonly pressure: "push" | "pull"; readonly tilt: TiltDirection }
  | { readonly pressure: "push" | "pull"; readonly twist: "cw" | "ccw" };
export interface CommandOptions extends GestureOptions {
  count?: 1 | 2;
  direction?: "cw" | "ccw" | "either";
  ownership?: Ownership;
}
export interface CancelGesture {
  input: Activation | "twist";
  direction?: "cw" | "ccw" | "either" | "same";
  count?: 1 | 2;
}
export interface InteractionOptions<
  V extends Source | AnyContinuous = Source | AnyContinuous,
> {
  activation: Activation;
  value: V;
  lifetime?: "activation" | "combination";
  completion?: "release";
  cancel?: CancelGesture;
  ownership?: Ownership;
  enter?: number;
  leave?: number;
  holdMs?: number;
  releaseMs?: number;
  requireValue?: boolean;
  valueOptions?: ContinuousOptions;
}
declare const output: unique symbol;
export interface ContinuousControl<
  S extends Source = Source,
  A extends Interpretation = Interpretation,
> {
  readonly kind: "continuous";
  readonly source: S;
  readonly options: Readonly<ContinuousOptions<A>>;
  readonly [output]: ContinuousValue<S, A>;
}
export interface GestureControl {
  readonly kind: "gesture";
  readonly input: GestureInput;
  readonly options: Readonly<CommandOptions>;
}
export interface InteractionControl<T = unknown, C = T> {
  readonly kind: "interaction";
  readonly options: Readonly<InteractionOptions>;
  readonly [output]: { value: T; commit: C };
}
export type AnyContinuous = ContinuousControl<any, any>;
export type AnyInteraction = InteractionControl<any, any>;
export type Control = AnyContinuous | GestureControl | AnyInteraction;
export type ControlGroup = Readonly<Record<string, Control>>;
export type ValueOf<C> = C extends AnyContinuous
  ? C[typeof output]
  : C extends AnyInteraction
    ? C[typeof output]["value"]
    : never;
type InteractionValue<V> = V extends Source
  ? SourceValue<V>
  : V extends AnyContinuous
    ? ValueOf<V>
    : never;

export const sourceAxes: Readonly<Record<Source, readonly Axis[]>> =
  Object.freeze({
    slide: ["x", "y"],
    tilt: ["ry", "rx"],
    translation: ["x", "y", "z"],
    rotation: ["rx", "ry", "rz"],
    pressure: ["z"],
    twist: ["rz"],
    push: ["z"],
    pull: ["z"],
    axes: ["x", "y", "z", "rx", "ry", "rz"],
  });
export function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
export function continuous<S extends Source>(
  source: S,
  options: ContinuousOptions<"velocity"> & { as: "velocity" },
): ContinuousControl<S, "velocity">;
export function continuous<S extends "slide" | "tilt">(
  source: S,
  options: ContinuousOptions<"direction"> & { as: "direction" },
): ContinuousControl<S, "direction">;
export function continuous<S extends Source>(
  source: S,
  options?: ContinuousOptions<"deflection">,
): ContinuousControl<S, "deflection">;
export function continuous<S extends Source, A extends Interpretation>(
  source: S,
  options: ContinuousOptions<A>,
): ContinuousControl<S, A>;
export function continuous<
  S extends Source,
  A extends Interpretation = "deflection",
>(source: S, options: ContinuousOptions<A> = {}): ContinuousControl<S, A> {
  return freeze(
    coreCall("normalize", {
      definition: { kind: "continuous", source, options },
    }),
  );
}
export function gesture(
  input: GestureInput,
  options: CommandOptions = {},
): GestureControl {
  return freeze(
    coreCall("normalize", { definition: { kind: "gesture", input, options } }),
  );
}
export function interaction<V extends Source | AnyContinuous>(
  options: InteractionOptions<V> & { requireValue: true },
): InteractionControl<InteractionValue<V>, NonNullable<InteractionValue<V>>>;
export function interaction<V extends Source | AnyContinuous>(
  options: InteractionOptions<V>,
): InteractionControl<InteractionValue<V>>;
export function interaction(options: InteractionOptions): AnyInteraction {
  return freeze(
    coreCall("normalize", { definition: { kind: "interaction", options } }),
  );
}
export const control = Object.freeze({ continuous, gesture, interaction });
