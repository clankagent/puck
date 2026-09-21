import { createGestures } from './gestures.js';
import type { GestureOptions, TiltDirection } from './gestures.js';
import type { InputState } from './input.js';
import { defaultGestureTune } from './tune.js';

export type Axis = keyof InputState;
export type Source = 'slide' | 'tilt' | 'translation' | 'rotation' | 'pressure' | 'twist' | 'push' | 'pull' | 'axes';
/** Semantic tilt vectors are [horizontal, vertical], right/down positive: [-ry, rx]. Raw rotation/axes stay in device order. */
export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type SourceValue<S extends Source> = S extends 'axes' ? Readonly<InputState> : S extends 'slide' | 'tilt' ? Vec2 : S extends 'translation' | 'rotation' ? Vec3 : number;
export type Interpretation = 'deflection' | 'velocity' | 'direction';
declare const velocity: unique symbol;
export type Velocity<T> = T & { readonly [velocity]: true };
export type ContinuousValue<S extends Source, A extends Interpretation> = A extends 'direction' ? number | null : A extends 'velocity' ? Velocity<SourceValue<S>> : SourceValue<S>;
export type Ownership = 'shared' | 'exclusive' | 'observe' | { readonly mode: 'shared' | 'exclusive' | 'observe'; readonly channels?: 'used' | 'all' | readonly Axis[] };
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
export type Activation = 'push' | 'pull' | 'cw' | 'ccw' | TiltDirection;
export type GestureInput = Activation | 'twist' | { readonly pressure: 'push' | 'pull'; readonly tilt: TiltDirection } | { readonly pressure: 'push' | 'pull'; readonly twist: 'cw' | 'ccw' };
export interface CommandOptions extends GestureOptions { count?: 1 | 2; direction?: 'cw' | 'ccw' | 'either'; ownership?: Ownership }
export interface CancelGesture { input: Activation | 'twist'; direction?: 'cw' | 'ccw' | 'either' | 'same'; count?: 1 | 2 }
export interface InteractionOptions<V extends Source | AnyContinuous = Source | AnyContinuous> {
  activation: Activation;
  value: V;
  lifetime?: 'activation' | 'combination';
  completion?: 'release';
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
export interface ContinuousControl<S extends Source = Source, A extends Interpretation = Interpretation> {
  readonly kind: 'continuous'; readonly source: S; readonly options: Readonly<ContinuousOptions<A>>;
  readonly [output]: ContinuousValue<S, A>;
}
export interface GestureControl {
  readonly kind: 'gesture'; readonly input: GestureInput; readonly options: Readonly<CommandOptions>;
}
export interface InteractionControl<T = unknown, C = T> {
  readonly kind: 'interaction'; readonly options: Readonly<InteractionOptions>;
  readonly [output]: { value: T; commit: C };
}
export type AnyContinuous = ContinuousControl<any, any>;
export type AnyInteraction = InteractionControl<any, any>;
export type Control = AnyContinuous | GestureControl | AnyInteraction;
export type ControlGroup = Readonly<Record<string, Control>>;
export type ValueOf<C> = C extends AnyContinuous ? C[typeof output] : C extends AnyInteraction ? C[typeof output]['value'] : never;
type InteractionValue<V> = V extends Source ? SourceValue<V> : V extends AnyContinuous ? ValueOf<V> : never;

export const sourceAxes: Readonly<Record<Source, readonly Axis[]>> = Object.freeze({
  slide: ['x', 'y'], tilt: ['ry', 'rx'], translation: ['x', 'y', 'z'], rotation: ['rx', 'ry', 'rz'],
  pressure: ['z'], twist: ['rz'], push: ['z'], pull: ['z'], axes: ['x', 'y', 'z', 'rx', 'ry', 'rz'],
});
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
const continuousKeys = ['as','speed','deadzone','responseMs','curve','scale','ownership','sectors','hysteresis','sticky'];
const gestureKeys = ['count','direction','ownership','pressRotate','rotateMinMs','rotateHoldMs','standaloneTilt','tiltXActivation','tiltXRelease','tiltYActivation','tiltYRelease','standaloneMinPulseMs','standaloneMaxPulseMs','standaloneNeutralMs','standaloneDoubleMs','pressMode','pushMode','pullMode','tiltActivation','tiltRelease','tiltMinMs','tiltArmMs','tiltRelaxMs','tiltMaxMs','tiltDominance','activation','release','pressActivation','pressRelease','twistActivation','twistRelease','clockwiseActivation','clockwiseRelease','counterclockwiseActivation','counterclockwiseRelease','pushActivation','pushRelease','pullActivation','pullRelease','minPulseMs','maxPulseMs','neutralMs','doubleMs','singleMode','dominance'];
function keys(value: object, allowed: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) throw new RangeError('Unknown or invalid option.');
}
export function finite(value: unknown, label: string, min = 0, max = Infinity): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new RangeError(`Invalid ${label}.`);
}
export function activationAxis(a: Activation): Axis { return a === 'push' || a === 'pull' ? 'z' : a === 'cw' || a === 'ccw' ? 'rz' : a.slice(0, 2) as Axis; }
export function activationSign(a: Activation): number { return a === 'pull' || a === 'ccw' || a.endsWith('-') ? -1 : 1; }
export function activationGates(a: Activation): { enter: number; leave: number } {
  const band = a === 'push' ? defaultGestureTune.push : a === 'pull' ? defaultGestureTune.pull : a === 'cw' || a === 'ccw' ? defaultGestureTune.rotation : a.startsWith('rx') ? defaultGestureTune.standaloneTilt!.rx : defaultGestureTune.standaloneTilt!.ry;
  return { enter: band.activation, leave: band.release };
}
export function validActivation(a: unknown): asserts a is Activation {
  if (!['push', 'pull', 'cw', 'ccw', 'rx+', 'rx-', 'ry+', 'ry-'].includes(a as string)) throw new RangeError('Unknown activation.');
}
export function ownership(control: Control): { mode: 'shared' | 'exclusive' | 'observe'; channels: readonly Axis[] } {
  const o = control.options.ownership ?? (control.kind === 'interaction' ? 'exclusive' : 'shared');
  const mode = typeof o === 'string' ? o : o.mode;
  if (!['shared', 'exclusive', 'observe'].includes(mode)) throw new RangeError('Invalid ownership mode.');
  const channels = typeof o === 'string' ? 'used' : o.channels ?? 'used';
  // Command recognition uses cross-axis arbitration, so its physical dependencies
  // include every axis inspected by that recognizer, not just the matched outcome.
  const used: Axis[] = control.kind === 'continuous' ? [...sourceAxes[control.source as Source]] : control.kind === 'gesture' ? ['z', 'rx', 'ry', 'rz'] : [activationAxis(control.options.activation), ...sourceAxes[typeof control.options.value === 'string' ? control.options.value : control.options.value.source as Source], ...(control.options.cancel ? gestureAxes(control.options.cancel.input) : [])];
  const result = channels === 'used' ? used : channels === 'all' ? [...sourceAxes.axes] : channels;
  if (!Array.isArray(result) || !result.length || result.some(a => !sourceAxes.axes.includes(a))) throw new RangeError('Invalid ownership channels.');
  return { mode, channels: [...new Set(result)] };
}
export function gestureAxes(input: GestureInput): Axis[] {
  if (typeof input === 'object') return ['z', ...('tilt' in input ? [activationAxis(input.tilt)] : ['rz' as const])];
  return [input === 'twist' ? 'rz' : activationAxis(input)];
}
export function continuous<S extends Source>(source: S, options: ContinuousOptions<'velocity'> & { as: 'velocity' }): ContinuousControl<S, 'velocity'>;
export function continuous<S extends 'slide' | 'tilt'>(source: S, options: ContinuousOptions<'direction'> & { as: 'direction' }): ContinuousControl<S, 'direction'>;
export function continuous<S extends Source>(source: S, options?: ContinuousOptions<'deflection'>): ContinuousControl<S, 'deflection'>;
export function continuous<S extends Source, A extends Interpretation>(source: S, options: ContinuousOptions<A>): ContinuousControl<S, A>;
export function continuous<S extends Source, A extends Interpretation = 'deflection'>(source: S, options: ContinuousOptions<A> = {}): ContinuousControl<S, A> {
  keys(options, continuousKeys);
  if (!Object.prototype.hasOwnProperty.call(sourceAxes, source)) throw new RangeError('Unknown continuous source.');
  const o = { as: 'deflection', deadzone: .05, curve: 1, responseMs: 25, speed: source === 'axes' ? { translation: 1, rotation: 1 } : 1, sectors: 8, hysteresis: .08, sticky: false, ...copy(options) };
  if (!['deflection', 'velocity', 'direction'].includes(o.as) || (o.as === 'direction' && !['slide', 'tilt'].includes(source))) throw new RangeError('Invalid continuous interpretation.');
  finite(o.deadzone, 'deadzone', 0, .999999); finite(o.curve, 'curve', .01, 100); finite(o.responseMs, 'responseMs');
  finite(o.hysteresis, 'hysteresis', 0, Math.PI); finite(o.sectors, 'sectors', 1, 360);
  if (!Number.isInteger(o.sectors) || typeof o.sticky !== 'boolean') throw new RangeError('Invalid direction options.');
  if (typeof o.speed === 'number') finite(o.speed, 'speed');
  else { if (source !== 'axes' || !o.speed) throw new RangeError('Separate speeds require six axes.'); finite(o.speed.translation, 'translation speed'); finite(o.speed.rotation, 'rotation speed'); }
  for (const [key, value] of Object.entries(o.scale ?? {})) { if (!sourceAxes.axes.includes(key as Axis)) throw new RangeError('Unknown scale axis.'); finite(value, 'axis scale', -100, 100); }
  const result = { kind: 'continuous', source, options: o } as unknown as ContinuousControl<S, A>;
  ownership(result); return freeze(result);
}
export function gesture(input: GestureInput, options: CommandOptions = {}): GestureControl {
  keys(options, gestureKeys);
  if (typeof input === 'string') { if (input !== 'twist') validActivation(input); }
  else if (input && (input.pressure === 'push' || input.pressure === 'pull')) {
    keys(input, 'tilt' in input ? ['pressure','tilt'] : ['pressure','twist']);
    if ('tilt' in input) { if (!['rx+', 'rx-', 'ry+', 'ry-'].includes(input.tilt)) throw new RangeError('Invalid tilt direction.'); }
    else if (!('twist' in input) || !['cw', 'ccw'].includes(input.twist)) throw new RangeError('Invalid twist combination.');
  } else throw new RangeError('Invalid gesture input.');
  if (options.count !== undefined && options.count !== 1 && options.count !== 2) throw new RangeError('Gesture count must be 1 or 2.');
  if (typeof input === 'object' && options.count === 2) throw new RangeError('Combined doubles are not supported.');
  if (options.direction && !['cw', 'ccw', 'either'].includes(options.direction)) throw new RangeError('Invalid gesture direction.');
  if (options.direction && input !== 'twist') throw new RangeError('Direction is only valid for twist input.');
  createGestures(options);
  const result = { kind: 'gesture', input: copy(input), options: { count: 1, ...copy(options) } } as GestureControl;
  ownership(result); return freeze(result);
}
export function interaction<V extends Source | AnyContinuous>(options: InteractionOptions<V> & { requireValue: true }): InteractionControl<InteractionValue<V>, NonNullable<InteractionValue<V>>>;
export function interaction<V extends Source | AnyContinuous>(options: InteractionOptions<V>): InteractionControl<InteractionValue<V>>;
export function interaction(options: InteractionOptions): AnyInteraction {
  keys(options, ['activation','value','lifetime','completion','cancel','ownership','enter','leave','holdMs','releaseMs','requireValue','valueOptions']);
  validActivation(options.activation);
  const value = typeof options.value === 'string' ? continuous(options.value) : options.value?.kind === 'continuous' ? continuous(options.value.source, options.value.options) : undefined;
  if (!value || value.kind !== 'continuous') throw new RangeError('Interaction value must be a continuous source or definition.');
  const o = { ...activationGates(options.activation), lifetime: 'activation', completion: 'release', holdMs: 0, releaseMs: 25, requireValue: false, ...copy(options) };
  if (!['activation', 'combination'].includes(o.lifetime) || o.completion !== 'release') throw new RangeError('Unsupported interaction lifetime/completion.');
  finite(o.enter, 'enter', .000001, 1); finite(o.leave, 'leave', 0, o.enter - .000001); finite(o.holdMs, 'holdMs'); finite(o.releaseMs, 'releaseMs');
  if (typeof o.requireValue !== 'boolean') throw new RangeError('Invalid requireValue.');
  if (o.cancel) {
    const c = o.cancel;
    keys(c, ['input','direction','count']);
    gesture(c.input, { count: c.count, direction: c.direction === 'same' ? 'either' : c.direction });
    if (c.direction === 'same' && c.count !== 2) throw new RangeError('Same-direction cancellation requires two pulses.');
  }
  if (o.valueOptions) { keys(o.valueOptions, continuousKeys.filter(k => !['as','ownership'].includes(k))); continuous(value.source, { ...value.options, ...o.valueOptions }); }
  const result = { kind: 'interaction', options: o } as AnyInteraction;
  ownership(result); return freeze(result);
}
export const control = Object.freeze({ continuous, gesture, interaction });
