import { control, continuous, interaction, gesture, sourceAxes, activationAxis, activationSign, activationGates, ownership, freeze, copy, finite } from './controls.js';
import type { Control, ControlGroup, AnyContinuous, AnyInteraction, GestureControl, Source, SourceValue, Velocity, Axis, ValueOf, InteractionControl, ContinuousControl, ContinuousOptions, InteractionOptions, CommandOptions, GestureInput } from './controls.js';
import { createGestures } from './gestures.js';
import type { GestureEvent, GestureRecognizer } from './gestures.js';
import { neutralInput } from './input.js';
import type { InputState } from './input.js';

export type CancelReason = 'gesture' | 'reversal' | 'no-selection' | 'ownership' | 'context-change' | 'configuration-change' | 'explicit' | 'blur' | 'pause' | 'disconnect' | 'close' | 'dispose';
export type InteractionState<T> = { readonly status: 'inactive' } | { readonly status: 'active'; readonly sessionId: number; readonly startedAt: number; readonly value: T };
interface OccurrenceBase<C extends Control> { readonly control: C; readonly timestamp: number; readonly sequence: number }
export type InteractionEvent<C extends AnyInteraction> = OccurrenceBase<C> & { readonly sessionId: number } & (
  { readonly type: 'begin' | 'update'; readonly value: ValueOf<C> } |
  { readonly type: 'commit'; readonly value: C extends InteractionControl<any, infer T> ? T : never } |
  { readonly type: 'cancel'; readonly reason: CancelReason }
);
export type CommandEvent = OccurrenceBase<GestureControl> & { readonly type: 'trigger'; readonly gesture: Readonly<GestureEvent> };
export type EventOf<C extends Control> = C extends GestureControl ? CommandEvent : C extends AnyInteraction ? InteractionEvent<C> : never;
export type PuckEvent = CommandEvent | InteractionEvent<AnyInteraction>;
export type StateOf<C extends Control> = C extends AnyContinuous ? ValueOf<C> : C extends AnyInteraction ? InteractionState<ValueOf<C>> : never;
export type SettingsOf<C extends Control> = C extends AnyContinuous ? Omit<ContinuousOptions, 'as' | 'ownership'> : C extends GestureControl ? Omit<CommandOptions, 'count' | 'direction' | 'ownership'> : C extends AnyInteraction ? Pick<InteractionOptions, 'enter' | 'leave' | 'holdMs' | 'releaseMs' | 'valueOptions'> : never;
export interface PuckOptions {
  controls?: ControlGroup;
  contexts?: Readonly<Record<string, ControlGroup>>;
  context?: string;
  conflicts?: readonly { readonly prefer: Control; readonly over: readonly Control[] }[];
  clock?: () => number;
  maxFrameMs?: number;
  eventLimit?: number;
  trace?: boolean;
  record?: boolean;
  recordingLimit?: number;
  onError?: (error: unknown) => void;
}
export class EventOverflowError extends Error {
  constructor(readonly missed: number) { super(`Event cursor lost ${missed} occurrences. Drain again to read retained events.`); this.name = 'EventOverflowError'; }
}
export interface EventCursor { drain(): readonly PuckEvent[]; dispose(): void }
export interface PuckFrame {
  readonly start: number; readonly end: number;
  integrate<S extends Source>(handle: ContinuousControl<S, 'velocity'>): SourceValue<S>;
  integrate<T>(handle: InteractionControl<Velocity<T>, any>): T;
}
export interface PuckSettings { readonly version: 1; readonly controls: Readonly<Record<string, Record<string, unknown>>> }
export type TimelineOperation = { type: 'feed'; time: number; input: InputState } | { type: 'advance' | 'frame'; time: number } |
  { type: 'interrupt'; time: number; reason: CancelReason } | { type: 'context'; time: number; context: string } |
  { type: 'cancel'; time: number; control: string } | { type: 'configure'; time: number; control: string; settings: Record<string, unknown> };
export interface PuckRecording { readonly version: 1; readonly definition: SerializedDefinition; readonly timeline: readonly TimelineOperation[]; readonly full: boolean }
export interface SerializedDefinition {
  controls: Record<string, Control>; contexts: Record<string, Record<string, Control>>; context?: string;
  conflicts: { prefer: string; over: string[] }[]; maxFrameMs: number; eventLimit: number;
}
type Entry = {
  handle: Control; def: Control; name: string; context?: string; owner: ReturnType<typeof ownership>;
  blocked: boolean; suppressed?: string; recognizer?: GestureRecognizer;
  valueDef?: AnyContinuous; value: any; velocity: number[]; total: number[]; sector: number | null;
  active: boolean; session: number; started: number; pending?: number; releasing?: number;
  cancelRecognizer?: GestureRecognizer; cancelPulse?: { direction: string; time: number }; pairSign?: number;
};
const axes = sourceAxes.axes;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function valueDefinition(d: Control): AnyContinuous | undefined {
  if (d.kind === 'continuous') return d;
  if (d.kind !== 'interaction') return undefined;
  const v = typeof d.options.value === 'string' ? continuous(d.options.value) : d.options.value;
  return continuous(v.source, { ...v.options, ...d.options.valueOptions });
}
function arrayValue(def: AnyContinuous, sample: Readonly<InputState>): number[] {
  const o = def.options;
  return sourceAxes[def.source as Source].map(axis => {
    let v = sample[axis] * (o.scale?.[axis] ?? 1);
    if (def.source === 'pull') v = Math.max(0, -v);
    if (def.source === 'push') v = Math.max(0, v);
    v = Math.max(-1, Math.min(1, v));
    const dz = o.deadzone!;
    v = Math.abs(v) <= dz ? 0 : Math.sign(v) * ((Math.abs(v) - dz) / (1 - dz)) ** o.curve!;
    if (o.as === 'velocity') v *= typeof o.speed === 'number' ? o.speed : axis.startsWith('r') ? o.speed!.rotation : o.speed!.translation;
    return v;
  });
}
function shaped(def: AnyContinuous, values: number[]): any {
  return def.source === 'axes' ? Object.fromEntries(axes.map((a, i) => [a, values[i]])) : values.length === 1 ? values[0] : [...values];
}
function matches(input: GestureInput, options: CommandOptions, e: GestureEvent): boolean {
  if (e.kind !== (options.count === 2 ? 'double' : 'single')) return false;
  const dir = (d: string) => d === 'cw' ? 'clockwise' : d === 'ccw' ? 'counterclockwise' : d;
  if (typeof input === 'object') return e.direction === input.pressure && ('tilt' in input ? e.tilt === input.tilt : e.rotation === dir(input.twist));
  if (e.tilt || e.rotation) return false;
  if (input === 'twist') return (e.direction === 'clockwise' || e.direction === 'counterclockwise') && (!options.direction || options.direction === 'either' || e.direction === dir(options.direction));
  return e.direction === dir(input);
}

/** Application-owned runtime. No timers, DOM, storage or device permissions. */
export function createPuck(options: PuckOptions = {}) {
  const clock = options.clock ?? (() => performance.now());
  const maxFrameMs = options.maxFrameMs ?? 50, eventLimit = options.eventLimit ?? 2048, recordingLimit = options.recordingLimit ?? 50000;
  finite(maxFrameMs, 'maxFrameMs'); finite(eventLimit, 'eventLimit', 1, 100000); finite(recordingLimit, 'recordingLimit', 1, 1000000);
  if (!Number.isInteger(eventLimit) || !Number.isInteger(recordingLimit)) throw new RangeError('Limits must be integers.');
  const entries: Entry[] = [], byHandle = new Map<Control, Entry>(), byName = new Map<string, Entry>();
  const add = (group: ControlGroup, context?: string) => {
    for (const [key, handle] of Object.entries(group)) {
      if (!key || key.includes('.') || (context && context.includes('.'))) throw new RangeError('Control/context names must be nonempty and cannot contain dots.');
      if (byHandle.has(handle)) throw new RangeError('A handle cannot be registered twice in one instance.');
      const def = restoreControl(copy(handle));
      const valueDef = valueDefinition(def), length = valueDef ? sourceAxes[valueDef.source as Source].length : 0;
      const e: Entry = { handle, def, name: context ? `contexts.${context}.${key}` : `controls.${key}`, context, owner: ownership(def), blocked: def.kind === 'interaction', valueDef, value: null, velocity: Array(length).fill(0), total: Array(length).fill(0), sector: null, active: false, session: 0, started: 0 };
      if (def.kind === 'gesture') e.recognizer = createGestures(def.options);
      entries.push(e); byHandle.set(handle, e); byName.set(e.name, e);
    }
  };
  add(options.controls ?? {});
  for (const [name, group] of Object.entries(options.contexts ?? {})) { if (!name) throw new RangeError('Empty context name.'); add(group, name); }
  let context = options.context;
  if (context !== undefined && !Object.prototype.hasOwnProperty.call(options.contexts ?? {}, context)) throw new RangeError('Unknown context.');
  const preferences = new Map<Entry, Set<Entry>>();
  const entry = (h: Control): Entry => { const e = byHandle.get(h); if (!e) throw new RangeError('Handle is not registered in this Puck instance.'); return e; };
  for (const rule of options.conflicts ?? []) {
    const a = entry(rule.prefer), set = preferences.get(a) ?? new Set<Entry>();
    for (const h of rule.over) set.add(entry(h));
    preferences.set(a, set);
  }
  function prefers(a: Entry, b: Entry, seen = new Set<Entry>()): boolean {
    if (seen.has(a)) return false;
    seen.add(a);
    return [...preferences.get(a) ?? []].some(next => next === b || prefers(next, b, seen));
  }
  for (const a of entries) if (prefers(a, a)) throw new RangeError('Cyclic control precedence.');
  const overlap = (a: Entry, b: Entry) => a.owner.channels.some(c => b.owner.channels.includes(c));
  const opposite = (a: Entry, b: Entry) => a.def.kind === 'interaction' && b.def.kind === 'interaction' && activationAxis(a.def.options.activation) === activationAxis(b.def.options.activation) && activationSign(a.def.options.activation) !== activationSign(b.def.options.activation);
  for (let i = 0; i < entries.length; i++) for (const b of entries.slice(i + 1)) {
    const a = entries[i];
    if (a.context && b.context && a.context !== b.context || a.owner.mode === 'observe' || b.owner.mode === 'observe' || !overlap(a, b) || opposite(a, b)) continue;
    if ((a.owner.mode === 'exclusive' || b.owner.mode === 'exclusive') && !prefers(a, b) && !prefers(b, a)) throw new RangeError(`Unresolved ownership conflict: ${a.name} / ${b.name}. Declare preference, contexts, shared or observe ownership.`);
  }
  const ordered = [...entries].sort((a, b) => prefers(a, b) ? -1 : prefers(b, a) ? 1 : 0);
  let now: number | undefined, frameAt: number | undefined, sample: InputState = { ...neutralInput }, disposed = false, sequence = 0, session = 0;
  let dispatching = false;
  const queue: (() => void)[] = [], pendingEvents: any[] = [], log: PuckEvent[] = [], listeners = new Map<Control, Set<(event: any) => void>>();
  const traces = new Map<number, unknown>(), timeline: TimelineOperation[] = [];
  let full = false;
  const cursors = new Set<{ next: number; disposed: boolean }>();
  const initialDefinition: SerializedDefinition = { controls: copy(options.controls ?? {}), contexts: copy(options.contexts ?? {}), context, conflicts: (options.conflicts ?? []).map(r => ({ prefer: entry(r.prefer).name, over: r.over.map(h => entry(h).name) })), maxFrameMs, eventLimit };
  const enabled = (e: Entry) => !e.context || e.context === context;
  function live() { if (disposed) throw new Error('Puck instance is disposed.'); }
  function neutral(e: Entry) { return e.owner.channels.every(a => Math.abs(sample[a]) <= (a === 'z' ? activationGates(sample.z >= 0 ? 'push' : 'pull').leave : a === 'rz' ? .15 : a === 'rx' ? .104 : a === 'ry' ? .16 : .05)); }
  function emit(e: Entry, data: object) { pendingEvents.push({ control: e.handle, ...data, evidence: options.trace ? { input: { ...sample }, context: context ?? null, control: e.name, settings: copy(e.def.options) } : undefined }); }
  function end(e: Entry, t: number, reason?: CancelReason) {
    if (e.active) emit(e, reason ? { type: 'cancel', sessionId: e.session, timestamp: t, reason } : { type: 'commit', sessionId: e.session, timestamp: t, value: copy(e.value) });
    e.active = false; e.pending = undefined; e.releasing = undefined; e.blocked = true; e.value = null; e.sector = null; e.velocity.fill(0); e.cancelRecognizer = undefined; e.cancelPulse = undefined;
  }
  function reset(e: Entry, t: number, reason: CancelReason) {
    end(e, t, reason); e.recognizer?.reset(t);
  }
  function interpret(e: Entry): any {
    const d = e.valueDef!;
    if (d.options.as !== 'direction') return shaped(d, d.options.as === 'velocity' ? e.velocity : arrayValue(d, sample));
    const [x, y] = sourceAxes[d.source as Source].map(a => sample[a] * (d.options.scale?.[a] ?? 1));
    if (Math.hypot(x, y) <= d.options.deadzone!) { if (!d.options.sticky) e.sector = null; return e.sector; }
    const n = d.options.sectors!, step = 2 * Math.PI / n, angle = (Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI);
    if (e.sector !== null) {
      const distance = Math.abs(Math.atan2(Math.sin(angle - e.sector * step), Math.cos(angle - e.sector * step)));
      if (distance < step / 2 + d.options.hysteresis!) return e.sector;
    }
    e.sector = Math.round(angle / step) % n; return e.sector;
  }
  function eligible(e: Entry) { return enabled(e) && !e.suppressed && !e.blocked; }
  function integrate(to: number) {
    const from = now ?? to, dt = to - from;
    if (dt <= 0) return;
    const allowed = frameAt === undefined ? 0 : Math.max(0, Math.min(to, frameAt + maxFrameMs) - from);
    for (const e of entries) {
      if (!e.valueDef || e.valueDef.options.as !== 'velocity') continue;
      const active = eligible(e) && (e.def.kind !== 'interaction' || e.active);
      const targets = active ? arrayValue(e.valueDef, sample) : e.velocity.map(() => 0);
      const response = e.valueDef.options.responseMs!;
      targets.forEach((target, i) => {
        const initial = e.velocity[i] * target < 0 || target === 0 ? 0 : e.velocity[i];
        const area = (ms: number) => response === 0 ? target * ms / 1000 : (target * ms + (initial - target) * response * -Math.expm1(-ms / response)) / 1000;
        e.total[i] += area(allowed);
        e.velocity[i] = response === 0 ? target : target + (initial - target) * Math.exp(-dt / response);
      });
      if (e.active) e.value = interpret(e);
    }
  }
  function route(t: number, report = false) {
    const winners: Entry[] = [];
    for (const e of [...ordered].sort((a, b) => Number(b.active) - Number(a.active))) {
      let candidate = enabled(e) && e.owner.mode === 'exclusive';
      if (e.def.kind === 'interaction') {
        const o = e.def.options;
        candidate &&= e.active || e.pending !== undefined || !e.blocked && sample[activationAxis(o.activation)] * activationSign(o.activation) >= o.enter!;
      }
      if (candidate && !winners.some(w => overlap(w, e))) winners.push(e);
    }
    for (const e of entries) {
      const winner = e.owner.mode === 'observe' ? undefined : winners.find(w => w !== e && overlap(w, e));
      const suppressed = !enabled(e) ? 'context' : winner?.name;
      if (suppressed && !e.suppressed) reset(e, t, suppressed === 'context' ? 'context-change' : 'ownership');
      e.suppressed = suppressed;
      if (report && !suppressed && e.blocked && neutral(e)) { e.blocked = false; e.recognizer?.update(neutralInput, t); }
    }
  }
  function cancellation(e: Entry, t: number, report: boolean): boolean {
    if (!e.cancelRecognizer || e.def.kind !== 'interaction') return false;
    const c = e.def.options.cancel!, filtered = { ...neutralInput };
    const axis = c.input === 'twist' ? 'rz' : activationAxis(c.input); filtered[axis] = sample[axis];
    const events = report ? e.cancelRecognizer.update(filtered, t) : e.cancelRecognizer.advance(t);
    for (const event of events) {
      if (c.count === 2 && matches(c.input, { count: 2, direction: c.direction === 'same' ? 'either' : c.direction }, event)) return true;
      if (!matches(c.input, { count: 1, direction: c.direction === 'same' ? 'either' : c.direction }, event)) continue;
      if ((c.count ?? 1) === 1) return true;
      if (e.cancelPulse && event.timestamp - e.cancelPulse.time <= 400 && (c.direction !== 'same' || e.cancelPulse.direction === event.direction)) return true;
      e.cancelPulse = { direction: event.direction, time: event.timestamp };
    }
    return false;
  }
  function process(t: number, report: boolean) {
    route(t, report);
    for (const e of ordered) {
      if (!eligible(e)) continue;
      if (e.def.kind === 'gesture') {
        const events = report ? e.recognizer!.update(sample, t) : e.recognizer!.advance(t);
        for (const g of events) if (matches(e.def.input, e.def.options, g)) emit(e, { type: 'trigger', timestamp: g.timestamp, gesture: g });
        continue;
      }
      if (e.def.kind === 'continuous') { e.value = interpret(e); continue; }
      const o = e.def.options, pressure = sample[activationAxis(o.activation)] * activationSign(o.activation);
      const values = arrayValue(e.valueDef!, sample), combined = o.lifetime === 'combination';
      const valueActive = values.some(v => Math.abs(v) > 0);
      if (!e.active) {
        if (pressure < o.enter! || combined && !valueActive) { e.pending = undefined; continue; }
        e.pending ??= t;
        if (t < e.pending + o.holdMs!) continue;
        e.active = true; e.session = ++session; e.started = t; e.pending = undefined; e.sector = null; e.value = interpret(e); e.pairSign = values.length === 1 ? Math.sign(values[0]) : undefined;
        if (o.cancel) {
          e.cancelRecognizer = createGestures({ pressMode: 'simple', standaloneTilt: true, pressRotate: false, singleMode: 'immediate' });
          // Only real neutral evidence within this session arms cancellation.
          const cs = { ...neutralInput }, axis = o.cancel.input === 'twist' ? 'rz' : activationAxis(o.cancel.input); cs[axis] = sample[axis]; e.cancelRecognizer.update(cs, t);
        }
        emit(e, { type: 'begin', timestamp: t, sessionId: e.session, value: copy(e.value) });
      } else {
        if (cancellation(e, t, report)) { end(e, t, 'gesture'); continue; }
        if (pressure < -o.leave! || combined && e.pairSign && values.length === 1 && values[0] * e.pairSign < 0) { end(e, t, 'reversal'); continue; }
        if (pressure <= o.leave! || combined && !valueActive) {
          e.releasing ??= t;
          if (t >= e.releasing + o.releaseMs!) end(e, t, o.requireValue && e.value === null ? 'no-selection' : undefined);
        } else {
          e.releasing = undefined;
          const value = interpret(e);
          if (!equal(value, e.value)) { e.value = value; emit(e, { type: 'update', timestamp: t, sessionId: e.session, value: copy(value) }); }
        }
      }
    }
    route(t);
    // New targets stop or reverse immediately; they are never integrated backwards.
    for (const e of entries) if (e.valueDef?.options.as === 'velocity') {
      const target = eligible(e) && (e.def.kind !== 'interaction' || e.active) ? arrayValue(e.valueDef, sample) : e.velocity.map(() => 0);
      target.forEach((v, i) => { if (v === 0 || v * e.velocity[i] < 0) e.velocity[i] = 0; if (e.valueDef!.options.responseMs === 0) e.velocity[i] = v; });
      if (e.active) e.value = interpret(e);
    }
  }
  function advanceTo(t: number, stopBeforeEndpoint = false) {
    finite(t, 'timestamp', -Number.MAX_VALUE);
    if (now !== undefined && t < now) throw new RangeError('Puck timestamps must be monotonic.');
    while (now !== undefined) {
      let deadline = t;
      for (const e of entries) if (e.def.kind === 'interaction') {
        const d = e.releasing !== undefined ? e.releasing + e.def.options.releaseMs! : e.pending !== undefined ? e.pending + e.def.options.holdMs! : Infinity;
        if (d > now && d < deadline) deadline = d;
      }
      integrate(deadline); now = deadline;
      if (!(stopBeforeEndpoint && deadline === t)) process(deadline, false);
      if (deadline === t) return;
    }
    now = t; if (!stopBeforeEndpoint) process(t, false);
  }
  function flush() {
    const events = pendingEvents.splice(0).sort((a, b) => a.timestamp - b.timestamp);
    const errors: unknown[] = [];
    dispatching = true;
    for (const item of events) {
      const { evidence, ...data } = item;
      const event = freeze({ ...data, sequence: ++sequence }) as PuckEvent;
      log.push(event);
      if (options.trace) traces.set(sequence, freeze({ ...evidence, dispatchedAt: now, timestamp: event.timestamp }));
      while (log.length > eventLimit) { const old = log.shift()!; traces.delete(old.sequence); }
      for (const fn of [...listeners.get(event.control) ?? []]) try { fn(event); } catch (error) { errors.push(error); }
    }
    dispatching = false;
    while (queue.length) queue.shift()!();
    for (const error of errors) { if (options.onError) options.onError(error); else throw error; }
  }
  function operation(op: TimelineOperation, body: () => void) {
    live();
    if (dispatching) { queue.push(() => operation(op, body)); return; }
    advanceTo(op.time, ['interrupt', 'cancel', 'context', 'configure'].includes(op.type));
    if (options.record) { if (timeline.length < recordingLimit) timeline.push(copy(op)); else full = true; }
    body(); flush();
  }
  function checkSample(input: Readonly<InputState>) {
    if (!input || axes.some(a => !Number.isFinite(input[a]) || Math.abs(input[a]) > 1)) throw new RangeError('Input must contain six finite normalized axes.');
  }
  const timestamp = (t?: number) => t ?? clock();
  function configure<C extends Control>(handle: C, settings: SettingsOf<C>, time?: number) {
    const e = entry(handle), keys = e.def.kind === 'continuous' ? ['speed', 'deadzone', 'responseMs', 'curve', 'scale', 'sectors', 'hysteresis', 'sticky'] : e.def.kind === 'interaction' ? ['enter', 'leave', 'holdMs', 'releaseMs', 'valueOptions'] : Object.keys({ ...e.def.options, ...settings }).filter(k => !['count', 'direction', 'ownership'].includes(k));
    if (Object.keys(settings).some(k => !keys.includes(k))) throw new RangeError('Structural/unknown control setting.');
    const patch = copy(settings);
    restoreControl({ ...e.def, options: { ...e.def.options, ...patch } } as Control);
    const t = timestamp(time);
    operation({ type: 'configure', time: t, control: e.name, settings: copy(settings) as Record<string, unknown> }, () => {
      const next = restoreControl({ ...e.def, options: { ...e.def.options, ...patch } } as Control);
      if (e.def.kind === 'continuous') e.velocity.fill(0); else reset(e, t, 'configuration-change');
      e.def = next; e.valueDef = valueDefinition(next); e.owner = ownership(next);
      if (next.kind === 'gesture') e.recognizer = createGestures(next.options);
      process(t, false);
    });
  }
  const api = {
    controls: options.controls ?? {},
    feed(input: Readonly<InputState>, time?: number) {
      checkSample(input); const next = { ...input }, t = timestamp(time);
      operation({ type: 'feed', input: next, time: t }, () => { sample = next; process(t, true); });
    },
    advance(time?: number) { const t = timestamp(time); operation({ type: 'advance', time: t }, () => {}); },
    read<C extends AnyContinuous | AnyInteraction>(handle: C): StateOf<C> {
      live(); const e = entry(handle);
      if (e.def.kind === 'gesture') throw new TypeError('A gesture is an occurrence; use on/events, not read.');
      if (e.def.kind === 'interaction') return freeze(e.active ? { status: 'active', sessionId: e.session, startedAt: e.started, value: copy(e.value) } : { status: 'inactive' }) as StateOf<C>;
      return freeze(eligible(e) ? e.valueDef!.options.as === 'direction' ? e.value : interpret(e) : e.valueDef!.options.as === 'direction' ? null : shaped(e.valueDef!, e.velocity.map(() => 0))) as StateOf<C>;
    },
    on<C extends GestureControl | AnyInteraction>(handle: C, callback: (event: EventOf<C>) => void): () => void {
      live(); const e = entry(handle); if (e.def.kind === 'continuous') throw new TypeError('Continuous values use read.');
      const set = listeners.get(handle) ?? new Set(); set.add(callback); listeners.set(handle, set); return () => { set.delete(callback); };
    },
    events(): EventCursor {
      live(); const state = { next: sequence + 1, disposed: false }; cursors.add(state);
      return { drain() {
        live(); if (state.disposed) throw new Error('Event cursor is disposed.');
        const first = log[0]?.sequence ?? sequence + 1;
        if (state.next < first) { const missed = first - state.next; state.next = first; throw new EventOverflowError(missed); }
        const result = log.filter(e => e.sequence >= state.next); state.next = sequence + 1; return freeze(result);
      }, dispose() { state.disposed = true; cursors.delete(state); } };
    },
    frame(time?: number): PuckFrame {
      if (dispatching) throw new Error('Create frames outside event callbacks.');
      const t = timestamp(time), start = frameAt ?? t;
      const results = new Map<Control, unknown>();
      operation({ type: 'frame', time: t }, () => {
        for (const e of entries) if (e.valueDef?.options.as === 'velocity') { results.set(e.handle, freeze(shaped(e.valueDef, [...e.total]))); e.total.fill(0); }
        frameAt = t;
      });
      return Object.freeze({ start, end: t, integrate(handle: Control): any { if (!results.has(handle)) throw new TypeError('Frame integration requires a registered velocity-valued control.'); return results.get(handle); } });
    },
    interrupt(reason: CancelReason = 'pause', time?: number) {
      const t = timestamp(time);
      operation({ type: 'interrupt', reason, time: t }, () => { for (const e of entries) reset(e, t, reason); sample = { ...neutralInput }; });
    },
    cancel(handle: AnyInteraction, time?: number) {
      const e = entry(handle); if (e.def.kind !== 'interaction') throw new TypeError('Only interactions can be canceled.');
      const t = timestamp(time); operation({ type: 'cancel', control: e.name, time: t }, () => { end(e, t, 'explicit'); route(t); });
    },
    setContext(next: string, time?: number) {
      if (!Object.prototype.hasOwnProperty.call(options.contexts ?? {}, next)) throw new RangeError('Unknown context.');
      const t = timestamp(time);
      operation({ type: 'context', context: next, time: t }, () => {
        if (next === context) return;
        for (const e of entries) reset(e, t, 'context-change');
        context = next; route(t);
      });
    },
    configure,
    settings(): PuckSettings { live(); return freeze({ version: 1, controls: Object.fromEntries(entries.map(e => [e.name, copy(e.def.options) as Record<string, unknown>])) }); },
    restoreSettings(saved: PuckSettings, time?: number) {
      live(); if (saved.version !== 1 || !saved.controls || !equal(Object.keys(saved.controls).sort(), entries.map(e => e.name).sort())) throw new RangeError('Settings do not match this definition.');
      const changes = entries.map(e => {
        const next = restoreControl({ ...e.def, options: saved.controls[e.name] } as Control);
        const old = e.def.options as Record<string, unknown>, value = next.options as Record<string, unknown>;
        const patch = Object.fromEntries(Object.keys(value).filter(k => !equal(old[k], value[k])).map(k => [k, value[k]]));
        return { e, patch };
      });
      const t = timestamp(time);
      // Validate all patches before changing any state.
      for (const { e, patch } of changes) {
        const structural = e.def.kind === 'continuous' ? ['as', 'ownership'] : e.def.kind === 'gesture' ? ['count', 'direction', 'ownership'] : ['activation', 'value', 'lifetime', 'completion', 'cancel', 'ownership', 'requireValue'];
        if (Object.keys(patch).some(k => structural.includes(k))) throw new RangeError('Saved settings change the definition.');
      }
      for (const { e, patch } of changes) if (Object.keys(patch).length) configure(e.handle, patch, t);
    },
    inspect(handle?: Control) {
      live(); const selected = handle ? [entry(handle)] : entries;
      return freeze({ context: context ?? null, input: { ...sample }, controls: selected.map(e => ({ name: e.name, kind: e.def.kind, definition: copy(e.def), settings: copy(e.def.options), ownership: copy(e.owner), eligible: eligible(e), suppressedBy: e.suppressed ?? (e.blocked ? 'neutral-rearm' : null), sessionId: e.active ? e.session : null, prefers: [...preferences.get(e) ?? []].map(x => x.name) })) });
    },
    explain(event: PuckEvent) { live(); return traces.has(event.sequence) && log.some(e => e === event) ? { status: 'retained' as const, evidence: traces.get(event.sequence) } : { status: options.trace ? 'expired' as const : 'disabled' as const }; },
    recording(): PuckRecording { live(); if (!options.record) throw new Error('Recording was not enabled.'); return freeze({ version: 1, definition: copy(initialDefinition), timeline: copy(timeline), full }); },
    get recordingFull() { return full; },
    dispose(time?: number) {
      if (disposed) return;
      if (dispatching) { queue.push(() => api.dispose(time)); return; }
      api.interrupt('dispose', time); disposed = true; listeners.clear(); cursors.clear(); traces.clear(); log.length = 0;
    },
  };
  return api;
}
export type Puck = ReturnType<typeof createPuck>;
export function restoreControl(def: Control): Control {
  if (!def || typeof def !== 'object') throw new RangeError('Invalid control definition.');
  if (def.kind === 'continuous') return continuous(def.source, def.options);
  if (def.kind === 'gesture') return gesture(def.input, def.options);
  if (def.kind === 'interaction') return interaction(def.options);
  throw new RangeError('Unknown control kind.');
}
export function replayPuck(recording: PuckRecording) {
  if (!recording || recording.version !== 1 || !Array.isArray(recording.timeline) || recording.timeline.length > 1000000) throw new RangeError('Invalid Puck recording.');
  const d = recording.definition, handles = new Map<string, Control>();
  const group = (g: Record<string, Control>, prefix: string) => Object.fromEntries(Object.entries(g).map(([k, v]) => { const h = restoreControl(v); handles.set(`${prefix}.${k}`, h); return [k, h]; }));
  const controls = group(d.controls, 'controls'), contexts = Object.fromEntries(Object.entries(d.contexts).map(([k, v]) => [k, group(v, `contexts.${k}`)]));
  const handle = (name: string) => { const h = handles.get(name); if (!h) throw new RangeError('Unknown recorded handle.'); return h; };
  const puck = createPuck({ controls, contexts, context: d.context, conflicts: d.conflicts.map(r => ({ prefer: handle(r.prefer), over: r.over.map(handle) })), maxFrameMs: d.maxFrameMs, eventLimit: d.eventLimit, clock: () => recording.timeline[recording.timeline.length - 1]?.time ?? 0, trace: true });
  const events = puck.events(), occurrences: PuckEvent[] = [], frames: PuckFrame[] = [];
  for (const op of recording.timeline) {
    switch (op.type) {
      case 'feed': puck.feed(op.input, op.time); break;
      case 'advance': puck.advance(op.time); break;
      case 'frame': frames.push(puck.frame(op.time)); break;
      case 'interrupt': puck.interrupt(op.reason, op.time); break;
      case 'context': puck.setContext(op.context, op.time); break;
      case 'cancel': puck.cancel(handle(op.control) as AnyInteraction, op.time); break;
      case 'configure': puck.configure(handle(op.control), op.settings, op.time); break;
      default: throw new RangeError('Unknown timeline operation.');
    }
    occurrences.push(...events.drain());
  }
  return { puck, controls, contexts, events: freeze(occurrences), frames: Object.freeze(frames), complete: !recording.full };
}
