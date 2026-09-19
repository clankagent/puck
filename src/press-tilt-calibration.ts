import type { TiltDirection } from './gestures.js';
import type { InputState } from './input.js';
import { validateGestureRecording } from './recording.js';
import type { GestureRecording } from './recording.js';
import { createGestureTune, defaultGestureTune } from './tune.js';
import type { GestureTune } from './tune.js';

export const tiltDirections = ['rx+','rx-','ry+','ry-'] as const;
export type PressTiltActionName = `${'push'|'pull'}.${TiltDirection}`;
export interface PressTiltAction {
  direction:'push'|'pull'; tilt:TiltDirection; kind:'single'; recording:number;
  start:number; end:number; pressurePeak:number; tiltPeak:number; pressureAtTiltPeak:number; onsetDelayMs:number;
}
export interface PressTiltCalibration {
  status:'ready'|'incomplete'|'ambiguous'; tune:GestureTune|null;
  counts:Record<PressTiltActionName,number>; missing:PressTiltActionName[];
  actions:PressTiltAction[]; issues:string[];
}
const quantile=(v:number[],p:number)=>{const a=[...v].sort((x,y)=>x-y),at=(a.length-1)*p,i=Math.floor(at);return a[i]+(a[Math.ceil(at)]-a[i])*(at-i);};
type Sample={t:number;input:InputState};
/** Infer combined single excursions from raw z/rx/ry. Preserves the base simple/double tune.
 * Coverage is inferred evidence, not ground-truth labels or measured classification accuracy.
 */
export function calibratePressTilts(input:GestureRecording|readonly GestureRecording[], settings:{baseTune?:GestureTune;minimumPerAction?:number}={}):PressTiltCalibration {
  const recordings:readonly GestureRecording[]=Array.isArray(input)?input:[input as GestureRecording];
  const minimum=settings.minimumPerAction??3,base=settings.baseTune??defaultGestureTune;
  if(!Number.isInteger(minimum)||minimum<3||minimum>100||recordings.length<1||recordings.length>20)throw new RangeError('Use 1–20 recordings and at least three examples per action.');
  const counts={} as Record<PressTiltActionName,number>;
  for(const d of ['push','pull'] as const)for(const tilt of tiltDirections)counts[`${d}.${tilt}`]=0;
  const actions:PressTiltAction[]=[],issues:string[]=[];let ambiguous=false;
  function finish(rows:Sample[],recording:number){
    if(!rows.length)return;
    const peak=(k:'z'|'rx'|'ry')=>rows.reduce((a,b)=>Math.abs(b.input[k])>Math.abs(a.input[k])?b:a);
    const px=peak('rx'),py=peak('ry'),pz=peak('z');
    const axis=Math.abs(px.input.rx)>=Math.abs(py.input.ry)?'rx':'ry',top=axis==='rx'?px:py;
    const strength=Math.abs(top.input[axis]),other=Math.max(...rows.map(r=>Math.abs(r.input[axis==='rx'?'ry':'rx'])));
    if(strength<.25)return; // Plain presses are evidence for the separate simple/double calibration.
    const direction=pz.input.z>0?'push':'pull',sign=direction==='push'?1:-1;
    const pressure=rows.find(r=>r.input.z*sign>=base[direction].activation);
    const onset=rows.find(r=>Math.abs(r.input[axis])>=.25);
    if(!pressure||!onset||onset.t<pressure.t||rows[rows.length-1].t-rows[0].t>1500||rows.some(r=>r.input.z*sign < -base[direction==='push'?'pull':'push'].activation)||strength<other*1.25){
      ambiguous=true;issues.push('Excluded a tilt with ambiguous direction, pressure order, reversal or duration.');return;
    }
    const tilt=(axis+(top.input[axis]>0?'+':'-')) as TiltDirection;
    actions.push({direction,tilt,kind:'single',recording,start:pressure.t,end:rows[rows.length-1].t,pressurePeak:Math.abs(pz.input.z),tiltPeak:strength,pressureAtTiltPeak:Math.abs(top.input.z),onsetDelayMs:onset.t-pressure.t});
    counts[`${direction}.${tilt}`]++;
  }
  recordings.forEach((recording,index)=>{
    validateGestureRecording(recording);
    let run:Sample[]=[],quietAt:number|null=null,armed=false;
    for(const row of recording.timeline){
      if(row.type==='reset'){if(run.length)issues.push('Discarded an interrupted excursion.');run=[];quietAt=null;armed=false;continue;}
      if(row.type!=='input')continue;
      const magnitude=Math.max(Math.abs(row.input.z),Math.abs(row.input.rx),Math.abs(row.input.ry));
      if(magnitude<=.06){armed=true;quietAt??=row.t;continue;}
      if(run.length&&quietAt!==null&&row.t-quietAt>180){finish(run,index);run=[];}
      if(armed)run.push(row);
      quietAt=null;
    }
    const inputs=recording.timeline.filter(r=>r.type==='input'),last=inputs[inputs.length-1];
    if(run.length){
      if(last?.type==='input'&&Math.max(Math.abs(last.input.z),Math.abs(last.input.rx),Math.abs(last.input.ry))<=.06)finish(run,index);
      else issues.push('Discarded an unfinished excursion at recording end.');
    }
  });
  const missing=(Object.keys(counts) as PressTiltActionName[]).filter(k=>counts[k]<minimum);
  let tune:GestureTune|null=null;
  if(!missing.length&&!ambiguous){
    const peaks=actions.map(a=>a.tiltPeak),activation=Math.min(.25,Math.min(...peaks)*.8);
    const center=peaks[0]+peaks.reduce((sum,v)=>sum+v-peaks[0],0)/peaks.length;
    tune=createGestureTune({...base.toJSON(),pressTilt:{
      force:{center,low:Math.min(center,quantile(peaks,.1)),high:Math.max(center,quantile(peaks,.9)),activation,release:activation*.48},
      minMs:25,armMs:Math.max(450,Math.ceil((Math.max(...actions.map(a=>a.onsetDelayMs))+80)/50)*50),relaxMs:180,
      maxMs:Math.max(1000,Math.ceil(Math.max(...actions.map(a=>a.end-a.start))*1.5/50)*50),dominance:1.25,
    }});
  }
  return {status:ambiguous?'ambiguous':missing.length?'incomplete':'ready',tune,counts,missing,actions,issues:[...new Set(issues)]};
}
