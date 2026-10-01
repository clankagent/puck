import { continuous, interaction, gesture, freeze } from "./controls.js";
import type {
  Control,
  ControlGroup,
  AnyContinuous,
  AnyInteraction,
  GestureControl,
  Source,
  SourceValue,
  Velocity,
  ValueOf,
  InteractionControl,
  ContinuousControl,
  ContinuousOptions,
  InteractionOptions,
  CommandOptions,
} from "./controls.js";

import type { GestureEvent } from "./gestures.js";

import type { InputState } from "./input.js";

export type CancelReason =
  | "gesture"
  | "reversal"
  | "no-selection"
  | "ownership"
  | "context-change"
  | "configuration-change"
  | "explicit"
  | "blur"
  | "pause"
  | "disconnect"
  | "close"
  | "dispose";
export type InteractionState<T> =
  | { readonly status: "inactive" }
  | {
      readonly status: "active";
      readonly sessionId: number;
      readonly startedAt: number;
      readonly value: T;
    };
interface OccurrenceBase<C extends Control> {
  readonly control: C;
  readonly timestamp: number;
  readonly sequence: number;
}
export type InteractionEvent<C extends AnyInteraction> = OccurrenceBase<C> & {
  readonly sessionId: number;
} & (
    | { readonly type: "begin" | "update"; readonly value: ValueOf<C> }
    | {
        readonly type: "commit";
        readonly value: C extends InteractionControl<any, infer T> ? T : never;
      }
    | { readonly type: "cancel"; readonly reason: CancelReason }
  );
export type CommandEvent = OccurrenceBase<GestureControl> & {
  readonly type: "trigger";
  readonly gesture: Readonly<GestureEvent>;
};
export type EventOf<C extends Control> = C extends GestureControl
  ? CommandEvent
  : C extends AnyInteraction
    ? InteractionEvent<C>
    : never;
export type PuckEvent = CommandEvent | InteractionEvent<AnyInteraction>;
export type StateOf<C extends Control> = C extends AnyContinuous
  ? ValueOf<C>
  : C extends AnyInteraction
    ? InteractionState<ValueOf<C>>
    : never;
export type SettingsOf<C extends Control> = C extends AnyContinuous
  ? Omit<ContinuousOptions, "as" | "ownership">
  : C extends GestureControl
    ? Omit<CommandOptions, "count" | "direction" | "ownership">
    : C extends AnyInteraction
      ? Pick<
          InteractionOptions,
          "enter" | "leave" | "holdMs" | "releaseMs" | "valueOptions"
        >
      : never;
export interface PuckOptions {
  controls?: ControlGroup;
  contexts?: Readonly<Record<string, ControlGroup>>;
  context?: string;
  conflicts?: readonly {
    readonly prefer: Control;
    readonly over: readonly Control[];
  }[];
  clock?: () => number;
  maxFrameMs?: number;
  eventLimit?: number;
  trace?: boolean;
  record?: boolean;
  recordingLimit?: number;
  onError?: (error: unknown) => void;
}
export class EventOverflowError extends Error {
  constructor(readonly missed: number) {
    super(
      `Event cursor lost ${missed} occurrences. Drain again to read retained events.`,
    );
    this.name = "EventOverflowError";
  }
}
export interface EventCursor {
  drain(): readonly PuckEvent[];
  dispose(): void;
}
export interface PuckFrame {
  readonly start: number;
  readonly end: number;
  integrate<S extends Source>(
    handle: ContinuousControl<S, "velocity">,
  ): SourceValue<S>;
  integrate<T>(handle: InteractionControl<Velocity<T>, any>): T;
}
export interface PuckSettings {
  readonly version: 1;
  readonly controls: Readonly<Record<string, Record<string, unknown>>>;
}
export type TimelineOperation =
  | { type: "feed"; time: number; input: InputState }
  | { type: "advance" | "frame"; time: number }
  | { type: "interrupt"; time: number; reason: CancelReason }
  | { type: "context"; time: number; context: string }
  | { type: "cancel"; time: number; control: string }
  | {
      type: "configure";
      time: number;
      control: string;
      settings: Record<string, unknown>;
    };
export interface PuckRecording {
  readonly version: 1;
  readonly definition: SerializedDefinition;
  readonly timeline: readonly TimelineOperation[];
  readonly full: boolean;
}
export interface SerializedDefinition {
  controls: Record<string, Control>;
  contexts: Record<string, Record<string, Control>>;
  context?: string;
  conflicts: { prefer: string; over: string[] }[];
  maxFrameMs: number;
  eventLimit: number;
}
import { createRuntime } from "./runtime-facade.js";
export const createPuck = createRuntime;
export type Puck = ReturnType<typeof createPuck>;
export function restoreControl(def: Control): Control {
  if (!def || typeof def !== "object")
    throw new RangeError("Invalid control definition.");
  if (def.kind === "continuous") return continuous(def.source, def.options);
  if (def.kind === "gesture") return gesture(def.input, def.options);
  if (def.kind === "interaction") return interaction(def.options);
  throw new RangeError("Unknown control kind.");
}
export function replayPuck(recording: PuckRecording) {
  if (
    !recording ||
    recording.version !== 1 ||
    !Array.isArray(recording.timeline) ||
    recording.timeline.length > 1000000
  )
    throw new RangeError("Invalid Puck recording.");
  const d = recording.definition,
    handles = new Map<string, Control>();
  const group = (g: Record<string, Control>, prefix: string) =>
    Object.fromEntries(
      Object.entries(g).map(([k, v]) => {
        const h = restoreControl(v);
        handles.set(`${prefix}.${k}`, h);
        return [k, h];
      }),
    );
  const controls = group(d.controls, "controls"),
    contexts = Object.fromEntries(
      Object.entries(d.contexts).map(([k, v]) => [
        k,
        group(v, `contexts.${k}`),
      ]),
    );
  const handle = (name: string) => {
    const h = handles.get(name);
    if (!h) throw new RangeError("Unknown recorded handle.");
    return h;
  };
  const puck = createPuck({
    controls,
    contexts,
    context: d.context,
    conflicts: d.conflicts.map((r) => ({
      prefer: handle(r.prefer),
      over: r.over.map(handle),
    })),
    maxFrameMs: d.maxFrameMs,
    eventLimit: d.eventLimit,
    clock: () => recording.timeline[recording.timeline.length - 1]?.time ?? 0,
    trace: true,
  });
  const events = puck.events(),
    occurrences: PuckEvent[] = [],
    frames: PuckFrame[] = [];
  for (const op of recording.timeline) {
    switch (op.type) {
      case "feed":
        puck.feed(op.input, op.time);
        break;
      case "advance":
        puck.advance(op.time);
        break;
      case "frame":
        frames.push(puck.frame(op.time));
        break;
      case "interrupt":
        puck.interrupt(op.reason, op.time);
        break;
      case "context":
        puck.setContext(op.context, op.time);
        break;
      case "cancel":
        puck.cancel(handle(op.control) as AnyInteraction, op.time);
        break;
      case "configure":
        puck.configure(handle(op.control), op.settings, op.time);
        break;
      default:
        throw new RangeError("Unknown timeline operation.");
    }
    occurrences.push(...events.drain());
  }
  return {
    puck,
    controls,
    contexts,
    events: freeze(occurrences),
    frames: Object.freeze(frames),
    complete: !recording.full,
  };
}
