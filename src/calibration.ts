import type { GestureDirection } from './gestures.js';
import { createGestureTune } from './tune.js';
import type { ForceBand, GestureTune } from './tune.js';
import { validateGestureRecording } from './recording.js';
import type { GestureRecording } from './recording.js';
export const gestureDirections = ['clockwise','counterclockwise','push','pull'] as const;
export type GestureActionName = `${GestureDirection}.${'single'|'double'}`;
export interface CalibrationPulse { direction:GestureDirection;start:number;end:number;peak:number;peakTime:number;valleyBefore:number;recording:number;segment:number }
export interface CalibrationAction { direction:GestureDirection;kind:'single'|'double';start:number;end:number;pulses:CalibrationPulse[];recording:number }
export interface CalibrationStats { count:number;center:number;low:number;high:number;min:number;max:number }
export interface GestureCalibration {
  status:'ready'|'incomplete'|'ambiguous';tune:GestureTune|null;
  counts:Record<GestureActionName,number>;missing:GestureActionName[];
  pulses:CalibrationPulse[];actions:CalibrationAction[];
  stats:Partial<Record<GestureDirection,CalibrationStats>>;issues:string[];
}
const quantile=(values:number[],p:number)=>{const a=[...values].sort((x,y)=>x-y);const at=(a.length-1)*p,lo=Math.floor(at),hi=Math.ceil(at);return a[lo]+(a[hi]-a[lo])*(at-lo);};
const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
interface Point {t:number;v:number;other:number;tilt:number}
/** Infer actions from raw shape and timing, independent of event labels and action order.
 * Closely spaced singles can be indistinguishable from doubles: inferred counts are not ground truth.
 */
export function calibrateGestures(input:GestureRecording|readonly GestureRecording[], settings:{minimumPerAction?:number;detectionFloor?:number;pairGapMs?:number}={}):GestureCalibration {
  const recordings=Array.isArray(input)?input:[input as GestureRecording];
  const minimum=settings.minimumPerAction??3,floor=settings.detectionFloor??.025,pairGap=settings.pairGapMs??250;
  if(!Number.isInteger(minimum)||minimum<3||minimum>100||!Number.isFinite(floor)||floor<=0||floor>.1||!Number.isFinite(pairGap)||pairGap<50||pairGap>500)throw new RangeError('Invalid calibration limits; at least three examples per action are required.');
  if(recordings.length<1||recordings.length>20)throw new RangeError('Use one to twenty recordings.');
  const pulses:CalibrationPulse[]=[],issues:string[]=[];
  function episode(points:Point[],direction:GestureDirection,recording:number,segment:number){
    if(points.length<3||points[0].v>floor||points[points.length-1].v>floor)return;
    if((direction==='push'||direction==='pull')&&points.some(p=>p.tilt>=.25)){issues.push('Excluded a press with tilt; use calibratePressTilts for combined gestures.');return;}
    const peaks:number[]=[];
    for(let i=1;i<points.length-1;i++)if(points[i].v>=Math.max(.06,floor*2.5)&&points[i].v>=points[i-1].v&&points[i].v>points[i+1].v)peaks.push(i);
    const selected:number[]=[];
    for(const peak of peaks){
      if(!selected.length){selected.push(peak);continue;}
      const prev=selected[selected.length-1];let valley=Infinity;for(let j=prev;j<=peak;j++)valley=Math.min(valley,points[j].v);
      // Ignore tiny ripples on one excursion. A clear relaxation separates pulses.
      if(valley>Math.min(points[prev].v,points[peak].v)*.45||points[peak].t-points[prev].t<70){if(points[peak].v>points[prev].v)selected[selected.length-1]=peak;}
      else selected.push(peak);
    }
    const bounds=[0];for(let i=1;i<selected.length;i++){let index=selected[i-1];for(let j=index;j<=selected[i];j++)if(points[j].v<points[index].v)index=j;bounds.push(index);}bounds.push(points.length-1);
    selected.forEach((peak,i)=>{
      const from=points[bounds[i]],to=points[bounds[i+1]],top=points[peak],duration=to.t-from.t;
      if(top.v<top.other*1.4)return; // Incidental pressure while twisting, or vice versa.
      if(duration<45||duration>1000){issues.push(`Excluded ${direction} excursion outside 45–1000 ms.`);return;}
      pulses.push({direction,start:from.t,end:to.t,peak:top.v,peakTime:top.t,valleyBefore:from.v,recording,segment});
    });
  }
  recordings.forEach((recording,index)=>{
    validateGestureRecording(recording);
    for(const direction of gestureDirections){
      const vertical=direction==='push'||direction==='pull',sign=direction==='push'||direction==='clockwise'?1:-1;
      let run:Point[]=[],previous:Point|undefined,segment=0;
      for(const row of recording.timeline){
        if(row.type==='reset'){run=[];previous=undefined;segment++;continue;}
        if(row.type!=='input')continue;
        const point={t:row.t,v:Math.max(0,sign*(vertical?row.input.z:row.input.rz)),other:Math.abs(vertical?row.input.rz:row.input.z),tilt:Math.max(Math.abs(row.input.rx),Math.abs(row.input.ry))};
        if(point.v>floor){if(!run.length)run=previous?[{...previous,t:point.t}]:[];run.push(point);}
        else if(run.length){run.push(point);episode(run,direction,index,segment);run=[];}
        previous=point;
      }
      if(run.length)issues.push(`Unfinished ${direction} excursion at recording end.`);
    }
  });
  pulses.sort((a,b)=>a.recording-b.recording||a.start-b.start);
  const actions:CalibrationAction[]=[],counts={} as Record<GestureActionName,number>;
  for(const d of gestureDirections)for(const kind of ['single','double'] as const)counts[`${d}.${kind}`]=0;
  const paired=(a:CalibrationPulse,b:CalibrationPulse)=>a.recording===b.recording&&a.segment===b.segment&&a.direction===b.direction&&b.start-a.end<=pairGap&&b.end-a.end<=650;
  let ambiguous=false;
  for(let i=0;i<pulses.length;){
    let end=i+1;while(end<pulses.length&&paired(pulses[end-1],pulses[end]))end++;
    if(end-i>2){ambiguous=true;issues.push(`Ambiguous run of ${end-i} ${pulses[i].direction} pulses near ${(pulses[i].start/1000).toFixed(1)} s; leave a longer pause between actions.`);i=end;continue;}
    const group=pulses.slice(i,end),kind=group.length===2?'double':'single';
    const action:CalibrationAction={direction:group[0].direction,kind,start:group[0].start,end:group[group.length-1].end,pulses:group,recording:group[0].recording};actions.push(action);counts[`${action.direction}.${kind}`]++;i=end;
  }
  const stats:GestureCalibration['stats']={};
  for(const d of gestureDirections){const values=pulses.filter(p=>p.direction===d).map(p=>p.peak);if(values.length)stats[d]={count:values.length,center:mean(values),low:quantile(values,.1),high:quantile(values,.9),min:Math.min(...values),max:Math.max(...values)};}
  const missing=(Object.keys(counts) as GestureActionName[]).filter(key=>counts[key]<minimum);
  let tune:GestureTune|null=null;
  if(!missing.length&&!ambiguous){
    function band(d:GestureDirection):ForceBand{const s=stats[d]!;const activation=clamp(s.low*.7,.04,s.min*.85);const returns=pulses.filter(p=>p.direction===d).map(p=>p.valleyBefore);const release=clamp(Math.max(activation*.5,...returns.map(v=>v*1.2)),.01,activation*.8);return {center:s.center,low:s.low,high:s.high,activation,release};}
    const cw=band('clockwise'),ccw=band('counterclockwise');
    const rotation={center:(cw.center+ccw.center)/2,low:(cw.low+ccw.low)/2,high:(cw.high+ccw.high)/2,activation:(cw.activation+ccw.activation)/2,release:Math.max(cw.release,ccw.release)};
    // Equal rotation gates, while still accommodating the shallower inter-pulse return.
    rotation.release=Math.min(rotation.release,rotation.activation*.85);
    const lengths=pulses.map(p=>p.end-p.start),doubles=actions.filter(a=>a.kind==='double').map(a=>a.pulses[1].end-a.pulses[0].end);
    tune=createGestureTune({version:1,rotation,push:band('push'),pull:band('pull'),dominance:1.4,timing:{minPulseMs:Math.round(clamp(quantile(lengths,.1)*.2,15,60)),maxPulseMs:Math.round(clamp(quantile(lengths,.9)*2,350,1000)),neutralMs:20,doubleMs:Math.round(clamp(Math.max(...doubles)+40,200,650))}});
  }
  return {status:ambiguous?'ambiguous':missing.length?'incomplete':'ready',tune,counts,missing,pulses,actions,stats,issues:[...new Set(issues)]};
}
