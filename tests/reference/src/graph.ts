import type { PulseDirection as GestureDirection, TiltDirection } from './gestures.js';
import type { PressTiltAction } from './press-tilt-calibration.js';
import type { TiltCalibrationAction } from './tilt-calibration.js';
import { defaultGestureTune } from './tune.js';
import type { GestureTune } from './tune.js';
import { validateGestureRecording } from './recording.js';
import type { GestureRecording } from './recording.js';
import type { CalibrationAction } from './calibration.js';
export interface GestureGraphLane {direction:GestureDirection|TiltDirection;label:string;center:number;low:number;high:number;activation:number;release:number;points:{t:number;value:number}[];actions:{start:number;end:number;kind:'single'|'double';label?:string}[]}
export interface GestureGraph {start:number;end:number;lanes:GestureGraphLane[]}
const labels:Record<GestureDirection,string>={clockwise:'Clockwise',counterclockwise:'Counterclockwise',push:'Push down',pull:'Pull up'};
/** Renderer-neutral graph data. Use your charting library or the optional SVG renderer. */
export function createGestureGraph(recording:GestureRecording,tune:GestureTune=defaultGestureTune,config:{start?:number;end?:number;actions?:readonly CalibrationAction[];recordingIndex?:number}={}):GestureGraph {
  validateGestureRecording(recording);
  const start=config.start??0,end=config.end??Math.max(1,recording.durationMs);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw new RangeError('Invalid graph window.');
  const lanes=(Object.keys(labels) as GestureDirection[]).map(direction=>{
    const vertical=direction==='push'||direction==='pull',sign=direction==='clockwise'||direction==='push'?1:-1;
    const band=vertical?tune[direction as 'push'|'pull']:tune.rotation;
    const all:{t:number;value:number}[]=[];
    for(const row of recording.timeline){if(row.type==='input')all.push({t:row.t,value:Math.max(0,sign*row.input[vertical?'z':'rz'])});else if(row.type==='reset')all.push({t:row.t,value:0});}
    const preceding=[...all].reverse().find(p=>p.t<start);const points=[{t:start,value:preceding?.value??0},...all.filter(p=>p.t>=start&&p.t<=end)];points.push({t:end,value:points[points.length-1].value});
    return {direction,label:labels[direction],...band,points,actions:(config.actions??[]).filter(a=>a.recording===(config.recordingIndex??0)&&a.direction===direction&&a.end>=start&&a.start<=end).map(a=>({start:a.start,end:a.end,kind:a.kind}))};
  });
  return {start,end,lanes};
}
/** Pressure and tilt in six separate lanes, with each inferred combination labeled on both. */
export function createPressTiltGraph(recording:GestureRecording,tune:GestureTune=defaultGestureTune,config:{start?:number;end?:number;actions?:readonly PressTiltAction[];recordingIndex?:number}={}):GestureGraph {
  const graph=createGestureGraph(recording,tune,{start:config.start,end:config.end});
  const actions=(config.actions??[]).filter(a=>a.recording===(config.recordingIndex??0)&&a.end>=graph.start&&a.start<=graph.end);
  graph.lanes=graph.lanes.filter(l=>l.direction==='push'||l.direction==='pull');
  for(const direction of ['rx+','rx-','ry+','ry-'] as const){
    const axis=direction.startsWith('rx')?'rx':'ry',sign=direction.endsWith('+')?1:-1;
    const points:{t:number;value:number}[]=[];let held=0;
    for(const row of recording.timeline){
      if(row.t>graph.end)break;
      if(row.type==='input')held=Math.max(0,row.input[axis]*sign);else if(row.type==='reset')held=0;else continue;
      if(row.t<graph.start)continue;
      if(!points.length)points.push({t:graph.start,value:0});
      points.push({t:row.t,value:held});
    }
    // Seed the left edge with the held sample preceding the requested window.
    let before=0;for(const row of recording.timeline){if(row.t>=graph.start)break;if(row.type==='input')before=Math.max(0,row.input[axis]*sign);else if(row.type==='reset')before=0;}
    if(!points.length)points.push({t:graph.start,value:before});else points[0].value=before;
    points.push({t:graph.end,value:held});
    graph.lanes.push({direction,label:`Tilt ${direction} (device axis)`,...(tune.pressTilt??defaultGestureTune.pressTilt!).force,points,actions:[]});
  }
  for(const lane of graph.lanes)lane.actions=actions.filter(a=>a.direction===lane.direction||a.tilt===lane.direction).map(a=>({start:a.start,end:a.end,kind:'single',label:`${a.direction} + ${a.tilt}`}));
  return graph;
}
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Four standalone tilt lanes with independent rx/ry bands and single/double action spans. */
export function createTiltGraph(recording:GestureRecording,tune:GestureTune=defaultGestureTune,config:{start?:number;end?:number;actions?:readonly TiltCalibrationAction[];recordingIndex?:number}={}):GestureGraph {
  const graph=createPressTiltGraph(recording,tune,{start:config.start,end:config.end});
  const bands=tune.standaloneTilt??defaultGestureTune.standaloneTilt!;
  graph.lanes=graph.lanes.filter(l=>l.direction.startsWith('r')).map(l=>({...l,...(l.direction.startsWith('rx')?bands.rx:bands.ry),actions:(config.actions??[]).filter(a=>a.recording===(config.recordingIndex??0)&&a.direction===l.direction&&a.end>=graph.start&&a.start<=graph.end).map(a=>({start:a.start,end:a.end,kind:a.kind}))}));
  return graph;
}
/** Standalone accessible SVG. No DOM, canvas, frameworks or global listeners. */
export function renderGestureGraphSvg(graph:GestureGraph,options:{width?:number;title?:string}={}):string {
  const width=options.width??960;
  if(!Number.isFinite(width)||width<280||width>4000)throw new RangeError('SVG width must be between 280 and 4000.');
  const height=graph.lanes.length*150+64,left=45,right=20,plotWidth=width-left-right;
  const x=(t:number)=>left+(Math.max(graph.start,Math.min(graph.end,t))-graph.start)/(graph.end-graph.start)*plotWidth;
  const svg=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(options.title??'Gesture recording: independent input directions')}"><desc>Blue is input strength, green dashed is activation, gray dotted is release, pale blue is the typical peak range. Shaded time spans mark inferred actions. Stronger inputs remain accepted above the typical range.</desc><rect width="100%" height="100%" fill="white"/><g font-family="Segoe UI,Arial,sans-serif" font-size="12" fill="#283c55">`];
  graph.lanes.forEach((lane,index)=>{
    const top=30+index*150,y=(v:number)=>top+100-Math.max(0,Math.min(1,v))*76;
    svg.push(`<text x="${left}" y="${top}" font-size="15" font-weight="600">${escape(lane.label)}</text><text x="${width-right}" y="${top}" text-anchor="end" font-size="11">peak ${lane.center.toFixed(2)}</text><text x="${left}" y="${top+19}">Activate ${lane.activation.toFixed(2)} · release ${lane.release.toFixed(2)}</text>`);
    svg.push(`<rect x="${left}" y="${y(lane.high)}" width="${plotWidth}" height="${y(lane.low)-y(lane.high)}" fill="#edf3fc"/>`);
    for(const a of lane.actions){svg.push(`<rect x="${x(a.start)}" y="${top+24}" width="${Math.max(2,x(a.end)-x(a.start))}" height="76" fill="#cfdfef" opacity=".45"><title>${escape(a.label??a.kind)}</title></rect>`);if(x(a.end)-x(a.start)>(a.label?90:42))svg.push(`<text x="${x(a.start)+3}" y="${top+116}" font-size="11">${escape(a.label??a.kind)}</text>`);}
    for(const [v,color,dash] of [[0,'#afbac8',''],[lane.activation,'#237442','6 4'],[lane.release,'#68778b','2 4']] as const)svg.push(`<line x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}" stroke="${color}" stroke-dasharray="${dash}"/>`);
    svg.push(`<text x="12" y="${y(1)+4}">1</text><text x="12" y="${y(0)+4}">0</text>`);
    // Steps preserve held input and report silence; no invented sloping interpolation.
    let path='';lane.points.forEach((p,i)=>{path+=i?`H${x(p.t).toFixed(2)}V${y(p.value).toFixed(2)}`:`M${x(p.t).toFixed(2)},${y(p.value).toFixed(2)}`;});
    svg.push(`<path d="${path}" fill="none" stroke="#1b4fce" stroke-width="1.8"/>`);
  });
  for(let i=0;i<=4;i++){const t=graph.start+(graph.end-graph.start)*i/4;svg.push(`<text x="${x(t)}" y="${height-24}" text-anchor="${i===0?'start':i===4?'end':'middle'}">${(t/1000).toFixed(2)} s</text>`);}
  svg.push('</g></svg>');return svg.join('');
}
export { createControlGraph } from './control-graph.js';
