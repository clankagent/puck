import type { InputState } from './input.js';
import type { GestureEvent, GestureOptions } from './gestures.js';
import { defaultGestureTune } from './tune.js';
import type { GestureTune } from './tune.js';
export type RecordingEntry = {type:'input';t:number;input:InputState} | {type:'advance'|'reset';t:number};
export interface GestureRecording {
  version: 1; source: 'device'|'simulator'; note: string; durationMs: number;
  options: GestureOptions; timeline: RecordingEntry[]; events: GestureEvent[];
}
export interface GestureRecorder {
  readonly full: boolean;
  input(input: Readonly<InputState>, timestampMs: number): void;
  advance(timestampMs: number): void;
  reset(timestampMs: number): void;
  events(events: readonly GestureEvent[]): void;
  snapshot(timestampMs: number): GestureRecording;
}
/** Transport-independent bounded recording. The app owns clock, saving and storage. */
export function createGestureRecorder(config: {startTimeMs:number;tune?:GestureTune;options?:GestureOptions;source?:'device'|'simulator';note?:string;maxDurationMs?:number;maxEntries?:number}): GestureRecorder {
  const start=config.startTimeMs,max=config.maxDurationMs??120000,limit=config.maxEntries??50000;
  if(!Number.isFinite(start)||!Number.isFinite(max)||max<=0||max>120000||!Number.isInteger(limit)||limit<1||limit>60000)throw new RangeError('Invalid recording bounds.');
  const options={...(config.options??(config.tune??defaultGestureTune).toOptions())};
  const timeline:RecordingEntry[]=[],events:GestureEvent[]=[];let last=start,full=false;
  function time(t:number){if(!Number.isFinite(t)||t<last)throw new RangeError('Recording clock must be finite and monotonic.');last=t;return t-start;}
  function add(row:RecordingEntry){if(full)return;if(row.t>max||timeline.length>=limit){full=true;return;}timeline.push(row);}
  const copyInput=(input:Readonly<InputState>)=>{const copy={} as InputState;for(const key of ['x','y','z','rx','ry','rz'] as const){if(!Number.isFinite(input[key])||Math.abs(input[key])>1)throw new RangeError('Recording axes must be in [-1,1].');copy[key]=input[key];}return copy;};
  return {
    get full(){return full;},
    input(input,t){const copied=copyInput(input);add({type:'input',t:time(t),input:copied});},
    advance(t){add({type:'advance',t:time(t)});},reset(t){add({type:'reset',t:time(t)});},
    events(values){for(const e of values){const timestamp=e.timestamp-start;if(!full&&timestamp>=0&&timestamp<=max&&events.length<10000)events.push({...e,timestamp});}},
    snapshot(t){const durationMs=Math.min(max,time(t));return {version:1,source:config.source??'device',note:(config.note??'').slice(0,500),durationMs,options:{...options},timeline:timeline.map(row=>row.type==='input'?{...row,input:{...row.input}}:{...row}),events:events.filter(e=>e.timestamp<=durationMs).map(e=>({...e}))};},
  };
}
/** Validate data before calibration or graphing; recordings contain untrusted input. */
export function validateGestureRecording(recording: GestureRecording): void {
  if(!recording||recording.version!==1||!Number.isFinite(recording.durationMs)||recording.durationMs<0||recording.durationMs>122000||!Array.isArray(recording.timeline)||recording.timeline.length>60000)throw new RangeError('Invalid recording.');
  let last=0;
  for(const row of recording.timeline){if(!row||!Number.isFinite(row.t)||row.t<last||row.t>recording.durationMs||!['input','advance','reset'].includes(row.type))throw new RangeError('Invalid recording timeline.');last=row.t;if(row.type==='input')for(const k of ['x','y','z','rx','ry','rz'] as const)if(!row.input||!Number.isFinite(row.input[k])||Math.abs(row.input[k])>1)throw new RangeError('Invalid recording input.');}
}
