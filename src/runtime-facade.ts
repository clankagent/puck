import { RustEngine } from "./rust.js";
import { freeze, copy, sourceAxes } from "./controls.js";
import type {
  Control,
  AnyContinuous,
  AnyInteraction,
  GestureControl,
  Axis,
} from "./controls.js";
import type { InputState } from "./input.js";
import type { GestureRecognizer } from "./gestures.js";
import { EventOverflowError } from "./puck.js";
import type {
  PuckOptions,
  PuckEvent,
  EventOf,
  EventCursor,
  StateOf,
  SettingsOf,
  CancelReason,
  PuckSettings,
  PuckRecording,
  PuckFrame,
} from "./puck.js";

/** JS owns handles, callbacks and immutable object identity; Rust owns state. */
export function createRuntime(options: PuckOptions = {}) {
  const clock = options.clock ?? (() => performance.now());
  const byHandle = new Map<Control, string>(),
    byName = new Map<string, Control>();
  const add = (group: Readonly<Record<string, Control>>, prefix: string) => {
    for (const [key, h] of Object.entries(group)) {
      if (byHandle.has(h))
        throw new RangeError(
          "A handle cannot be registered twice in one instance.",
        );
      const name = `${prefix}.${key}`;
      byHandle.set(h, name);
      byName.set(name, h);
    }
  };
  add(options.controls ?? {}, "controls");
  for (const [name, group] of Object.entries(options.contexts ?? {}))
    add(group, `contexts.${name}`);
  const entry = (handle: Control) => {
    const name = byHandle.get(handle);
    if (!name)
      throw new RangeError("Handle is not registered in this Puck instance.");
    return name;
  };
  const engine = new RustEngine("puck", {
    controls: options.controls ?? {},
    contexts: options.contexts ?? {},
    context: options.context,
    conflicts: (options.conflicts ?? []).map((r) => ({
      prefer: entry(r.prefer),
      over: r.over.map(entry),
    })),
    maxFrameMs: options.maxFrameMs,
    eventLimit: options.eventLimit,
    recordingLimit: options.recordingLimit,
    trace: options.trace,
    record: options.record,
  });
  let disposed = false,
    dispatching = false,
    sequence = 0;
  const queue: (() => void)[] = [],
    log: PuckEvent[] = [],
    traces = new Map<number, unknown>(),
    listeners = new Map<Control, Set<(event: any) => void>>();
  const live = () => {
    if (disposed) throw Error("Puck instance is disposed.");
  };
  const timestamp = (t?: number) => t ?? clock();
  const query = (op: string, data: Record<string, unknown> = {}) => {
    live();
    return engine.call<{ value: any; events: any[] }>(op, data).value;
  };
  function flush(events: any[]) {
    const errors: unknown[] = [];
    dispatching = true;
    for (const item of events) {
      const { evidence, ...data } = item;
      const event = freeze({
        ...data,
        control: byName.get(data.control),
      }) as PuckEvent;
      sequence = event.sequence;
      log.push(event);
      if (options.trace) traces.set(sequence, freeze(evidence));
      while (log.length > (options.eventLimit ?? 2048)) {
        const old = log.shift()!;
        traces.delete(old.sequence);
      }
      for (const fn of [...(listeners.get(event.control) ?? [])])
        try {
          fn(event);
        } catch (error) {
          errors.push(error);
        }
    }
    dispatching = false;
    while (queue.length) queue.shift()!();
    for (const error of errors) {
      if (options.onError) options.onError(error);
      else throw error;
    }
  }
  function operation(
    op: string,
    data: Record<string, unknown>,
    body?: (value: any) => void,
  ) {
    live();
    if (dispatching) {
      queue.push(() => operation(op, data, body));
      return;
    }
    const result = engine.call<{ value: any; events: any[] }>(op, data);
    body?.(result.value);
    flush(result.events);
  }
  function configure<C extends Control>(
    handle: C,
    settings: SettingsOf<C>,
    time?: number,
  ) {
    const control = entry(handle),
      patch = copy(settings);
    query("validateConfigure", { control, settings: patch });
    operation("configure", { control, settings: patch, time: timestamp(time) });
  }
  const api = {
    controls: options.controls ?? {},
    feed(input: Readonly<InputState>, time?: number) {
      if (
        !input ||
        sourceAxes.axes.some(
          (a) => !Number.isFinite(input[a]) || Math.abs(input[a]) > 1,
        )
      )
        throw new RangeError("Input must contain six finite normalized axes.");
      operation("feed", { input: { ...input }, time: timestamp(time) });
    },
    advance(time?: number) {
      operation("advance", { time: timestamp(time) });
    },
    read<C extends AnyContinuous | AnyInteraction>(handle: C): StateOf<C> {
      live();
      entry(handle);
      if ((handle as Control).kind === "gesture")
        throw new TypeError(
          "A gesture is an occurrence; use on/events, not read.",
        );
      return freeze(query("read", { control: entry(handle) }));
    },
    on<C extends GestureControl | AnyInteraction>(
      handle: C,
      callback: (event: EventOf<C>) => void,
    ): () => void {
      live();
      entry(handle);
      if ((handle as Control).kind === "continuous")
        throw new TypeError("Continuous values use read.");
      const set = listeners.get(handle) ?? new Set();
      set.add(callback);
      listeners.set(handle, set);
      return () => {
        set.delete(callback);
      };
    },
    events(): EventCursor {
      live();
      const state = { next: sequence + 1, disposed: false };
      return {
        drain() {
          live();
          if (state.disposed) throw Error("Event cursor is disposed.");
          const first = log[0]?.sequence ?? sequence + 1;
          if (state.next < first) {
            const missed = first - state.next;
            state.next = first;
            throw new EventOverflowError(missed);
          }
          const result = log.filter((e) => e.sequence >= state.next);
          state.next = sequence + 1;
          return freeze(result);
        },
        dispose() {
          state.disposed = true;
        },
      };
    },
    frame(time?: number): PuckFrame {
      if (dispatching) throw Error("Create frames outside event callbacks.");
      let result: any;
      operation("frame", { time: timestamp(time) }, (v) => {
        result = freeze(v);
      });
      return Object.freeze({
        start: result.start,
        end: result.end,
        integrate(handle: Control): any {
          const name = byHandle.get(handle);
          if (
            !name ||
            !Object.prototype.hasOwnProperty.call(result.results, name)
          )
            throw new TypeError(
              "Frame integration requires a registered velocity-valued control.",
            );
          return result.results[name];
        },
      });
    },
    interrupt(reason: CancelReason = "pause", time?: number) {
      operation("interrupt", { reason, time: timestamp(time) });
    },
    cancel(handle: AnyInteraction, time?: number) {
      entry(handle);
      if (handle.kind !== "interaction")
        throw new TypeError("Only interactions can be canceled.");
      operation("cancel", { control: entry(handle), time: timestamp(time) });
    },
    setContext(context: string, time?: number) {
      operation("context", { context, time: timestamp(time) });
    },
    configure,
    settings(): PuckSettings {
      return freeze(query("settings"));
    },
    restoreSettings(saved: PuckSettings, time?: number) {
      const changes = query("validateRestoreSettings", {
          settings: copy(saved),
        }),
        t = timestamp(time);
      for (const patch of changes)
        configure(byName.get(patch.control)!, patch.settings, t);
    },
    inspect(handle?: Control): {
      context: string | null;
      input: InputState;
      controls: {
        name: string;
        kind: Control["kind"];
        definition: Control;
        settings: Control["options"];
        ownership: {
          mode: "shared" | "exclusive" | "observe";
          channels: readonly Axis[];
        };
        eligible: boolean;
        suppressedBy: string | null;
        sessionId: number | null;
        cancellation: GestureRecognizer["state"] | null;
        releasePending: boolean;
        prefers: string[];
      }[];
    } {
      return freeze(query("inspect", handle ? { control: entry(handle) } : {}));
    },
    explain(event: PuckEvent) {
      live();
      return traces.has(event.sequence) && log.some((e) => e === event)
        ? { status: "retained" as const, evidence: traces.get(event.sequence) }
        : {
            status: options.trace
              ? ("expired" as const)
              : ("disabled" as const),
          };
    },
    recording(): PuckRecording {
      return freeze(query("recording"));
    },
    get recordingFull() {
      return query("recordingFull") as boolean;
    },
    dispose(time?: number) {
      if (disposed) return;
      if (dispatching) {
        queue.push(() => api.dispose(time));
        return;
      }
      api.interrupt("dispose", time);
      disposed = true;
      listeners.clear();
      traces.clear();
      log.length = 0;
      engine.dispose();
    },
  };
  return api;
}
