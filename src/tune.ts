import type { GestureOptions } from './gestures.js';
export interface ForceBand { readonly center: number; readonly low: number; readonly high: number; readonly activation: number; readonly release: number }
export interface PressTiltTune {
  readonly force: ForceBand;
  readonly minMs: number; readonly armMs: number; readonly relaxMs: number; readonly maxMs: number; readonly dominance: number;
}
export interface GestureTuneData {
  readonly version: 1;
  readonly rotation: ForceBand;
  readonly push: ForceBand;
  readonly pull: ForceBand;
  readonly timing: { readonly minPulseMs: number; readonly maxPulseMs: number; readonly neutralMs: number; readonly doubleMs: number };
  readonly dominance: number;
  /** Optional for backward-compatible restoration of 0.2 tunes. Does not enable tilt mode by itself. */
  readonly pressTilt?: PressTiltTune;
}
export interface GestureTune extends GestureTuneData {
  soften(amount: number): GestureTune;
  harden(amount: number): GestureTune;
  narrow(amount: number): GestureTune;
  widen(amount: number): GestureTune;
  toOptions(): GestureOptions;
  toJSON(): GestureTuneData;
}
const base: GestureTuneData = {
  version: 1,
  rotation: { center: .465, low: .349, high: .57, activation: .25, release: .15 },
  push: { center: .314, low: .274, high: .354, activation: .20, release: .08 },
  pull: { center: .289, low: .18, high: .357, activation: .12, release: .06 },
  timing: { minPulseMs: 35, maxPulseMs: 650, neutralMs: 25, doubleMs: 400 },
  dominance: 1.4,
  pressTilt: {force:{center:.596,low:.401,high:.803,activation:.24,release:.115},minMs:25,armMs:450,relaxMs:180,maxMs:1000,dominance:1.25},
};
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** Restore a plain JSON tune; all nested objects are copied and frozen. */
export function createGestureTune(data: GestureTuneData = base): GestureTune {
  if (!data || data.version !== 1 || !finite(data.dominance) || data.dominance < 1) throw new RangeError('Invalid tune version or dominance.');
  for (const b of [data.rotation,data.push,data.pull,...(data.pressTilt?[data.pressTilt.force]:[])]) {
    if (!b || ![b.center,b.low,b.high,b.activation,b.release].every(finite)
      || b.low < 0 || b.low > b.center || b.center > b.high || b.high > 1
      || b.release < 0 || b.activation <= b.release || b.activation > 1 || b.center <= 0) throw new RangeError('Invalid force band.');
  }
  const t = data.timing;
  const p=data.pressTilt;
  if(p && (![p.minMs,p.armMs,p.relaxMs,p.maxMs,p.dominance].every(finite) || p.minMs<0 || p.armMs<p.minMs || p.relaxMs<0 || p.relaxMs>p.armMs || p.armMs>p.maxMs || p.maxMs>10000 || p.dominance<=1)) throw new RangeError('Invalid press-tilt tune.');
  if (!t || ![t.minPulseMs,t.maxPulseMs,t.neutralMs,t.doubleMs].every(v=>finite(v)&&v>=0)
    || t.minPulseMs > t.maxPulseMs || t.maxPulseMs > 10000 || t.doubleMs > 10000 || t.neutralMs > 1000) throw new RangeError('Invalid tune timing.');
  const value: GestureTuneData = Object.freeze({version:1,rotation:Object.freeze({...data.rotation}),push:Object.freeze({...data.push}),pull:Object.freeze({...data.pull}),timing:Object.freeze({...t}),dominance:data.dominance,...(p?{pressTilt:Object.freeze({...p,force:Object.freeze({...p.force})})}:{})});
  const amount = (x: number, subtract: boolean) => { if(!finite(x)||x<0||(subtract&&x>=1)||x>10)throw new RangeError('Amount must be a non-negative fraction; soften/narrow require less than 1.');return subtract?1-x:1+x; };
  function edit(factor: number, mode: 'force'|'spread'): GestureTune {
    function band(b:ForceBand):ForceBand {
      if(mode==='force'){
        // Scale each band uniformly; saturation preserves ordering and hysteresis.
        const f=Math.min(factor,1/Math.max(b.high,b.activation));
        return {center:b.center*f,low:b.low*f,high:b.high*f,activation:b.activation*f,release:b.release*f};
      }else{
        const activation=Math.max(.001,b.center-(b.center-b.activation)*factor);
        return {center:b.center,low:Math.max(0,b.center-(b.center-b.low)*factor),high:Math.min(1,b.center+(b.high-b.center)*factor),activation,release:activation*b.release/b.activation};
      }
    }
    return createGestureTune({...value,rotation:band(value.rotation),push:band(value.push),pull:band(value.pull),...(value.pressTilt?{pressTilt:{...value.pressTilt,force:band(value.pressTilt.force)}}:{})});
  }
  return Object.freeze({...value,
    soften(x:number){return edit(amount(x,true),'force');},harden(x:number){return edit(amount(x,false),'force');},
    narrow(x:number){return edit(amount(x,true),'spread');},widen(x:number){return edit(amount(x,false),'spread');},
    toJSON(){return value;},
    toOptions(){const p=value.pressTilt;return {twistActivation:value.rotation.activation,twistRelease:value.rotation.release,pushActivation:value.push.activation,pushRelease:value.push.release,pullActivation:value.pull.activation,pullRelease:value.pull.release,...value.timing,dominance:value.dominance,singleMode:'exclusive' as const,...(p?{tiltActivation:p.force.activation,tiltRelease:p.force.release,tiltMinMs:p.minMs,tiltArmMs:p.armMs,tiltRelaxMs:p.relaxMs,tiltMaxMs:p.maxMs,tiltDominance:p.dominance}:{})};},
  });
}
export const defaultGestureTune = createGestureTune();
export const gesturePresets = Object.freeze({default:defaultGestureTune,soft:defaultGestureTune.soften(.2),hard:defaultGestureTune.harden(.2)});
