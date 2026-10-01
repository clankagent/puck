import {calibrateGestures} from './calibration.js';
import type {CalibrationStats} from './calibration.js';
import type {PulseDirection,TiltDirection} from './gestures.js';
import type {GestureRecording,RecordingEntry} from './recording.js';
import {validateGestureRecording} from './recording.js';
import {createGestureTune,defaultGestureTune} from './tune.js';
import type {ForceBand,GestureTune} from './tune.js';

export type TiltActionName = `${TiltDirection}.${'single'|'double'}`;
export interface TiltCalibrationAction {direction:TiltDirection;kind:'single'|'double';start:number;end:number;recording:number}
export interface TiltCalibration {
  status:'ready'|'incomplete'|'ambiguous';tune:GestureTune|null;
  counts:Record<TiltActionName,number>;missing:TiltActionName[];
  actions:TiltCalibrationAction[];stats:Partial<Record<TiltDirection,CalibrationStats>>;issues:string[];
}
const names:Record<PulseDirection,TiltDirection>={clockwise:'rx+',counterclockwise:'rx-',push:'ry+',pull:'ry-'};
/** Reuse the raw pulse parser on rx/ry; never pair across capture/reset boundaries. */
export function calibrateTilts(input:GestureRecording|readonly GestureRecording[],settings:{baseTune?:GestureTune;minimumPerAction?:number}={}):TiltCalibration {
  const captures:readonly GestureRecording[]=Array.isArray(input)?input:[input as GestureRecording];
  const base=settings.baseTune??defaultGestureTune;
  const mapped=captures.map(c=>{
    validateGestureRecording(c);let pressureOwned=false;
    const timeline:RecordingEntry[]=c.timeline.map(row=>{
      if(row.type==='reset'){pressureOwned=false;return row;}
      if(row.type!=='input')return row;
      const v=row.input;
      if(Math.max(Math.abs(v.z),Math.abs(v.rz),Math.abs(v.rx),Math.abs(v.ry))<=.06)pressureOwned=false;
      if(Math.max(Math.abs(v.rx),Math.abs(v.ry))<.15 && (v.z>=base.push.activation||-v.z>=base.pull.activation||Math.abs(v.rz)>=base.rotation.activation))pressureOwned=true;
      if(pressureOwned)return {type:'reset',t:row.t};
      return {...row,input:{x:0,y:0,z:v.ry,rz:v.rx,rx:0,ry:0}};
    });
    return {...c,timeline};
  });
  const result=calibrateGestures(mapped,{minimumPerAction:settings.minimumPerAction,detectionFloor:.06});
  const rename=(key:string)=>{const [direction,kind]=key.split('.');return `${names[direction as PulseDirection]}.${kind}` as TiltActionName;};
  const counts=Object.fromEntries(Object.entries(result.counts).map(([k,v])=>[rename(k),v])) as Record<TiltActionName,number>;
  let tune:GestureTune|null=null;
  if(result.tune){
    const t=result.tune;
    const rxActivation=Math.min(t.rotation.activation,Math.min(result.stats.clockwise!.min,result.stats.counterclockwise!.min)*.85);
    const rx={...t.rotation,activation:rxActivation,release:Math.min(t.rotation.release,rxActivation*.8)};
    const ry=Object.fromEntries((['center','low','high','activation','release'] as const).map(k=>[k,(t.push[k]+t.pull[k])/2])) as unknown as ForceBand;
    tune=createGestureTune({...base.toJSON(),standaloneTilt:{rx,ry,timing:{...t.timing,minPulseMs:Math.min(25,t.timing.minPulseMs),neutralMs:10}}});
  }
  return {status:result.status,tune,counts,missing:result.missing.map(rename),
    actions:result.actions.map(a=>({direction:names[a.direction],kind:a.kind,start:a.start,end:a.end,recording:a.recording})),
    stats:Object.fromEntries(Object.entries(result.stats).map(([k,v])=>[names[k as PulseDirection],v])),
    issues:result.issues.map(issue=>issue.replace(/counterclockwise|clockwise|push|pull/g,k=>names[k as PulseDirection])),
  };
}
