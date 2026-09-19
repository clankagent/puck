import { createGestures, calibrateGestures, calibrateTilts, calibratePressTilts } from '../../dist/index.js';
export function replayRecording(recording,overrides={}){
 const g=createGestures({...recording.options,...overrides}),events=[];
 for(const row of recording.timeline){
  if(row.type==='reset')g.reset();
  else events.push(...(row.type==='input'?g.update(row.input,row.t):g.advance(row.t)));
 }
 return {events,pendingAtStop:g.state.pending,phaseAtStop:g.state.phase};
}
function percentile(values,p){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*p)];}
export function analyzeRecording(recording){
 const reports=recording.timeline.filter(r=>r.type==='input');
 const axisStats={};
 for(const axis of ['x','y','z','rx','ry','rz']){
  const values=reports.map(r=>r.input[axis]),active=values.map(Math.abs).filter(v=>v>.02);
  axisStats[axis]={min:values.length?Math.min(...values):0,max:values.length?Math.max(...values):0,nontrivialReports:active.length,activeMagnitudeP25:percentile(active,.25),activeMagnitudeMedian:percentile(active,.5),activeMagnitudeP90:percentile(active,.9)};
 }
 const gaps=reports.slice(1).map((r,i)=>r.t-reports[i].t);
 const replay=replayRecording(recording);
 return {calibration:calibrateGestures(recording),standaloneTiltCalibration:calibrateTilts(recording),pressTiltCalibration:calibratePressTilts(recording),id:recording.id,source:recording.source,note:recording.note,durationMs:recording.durationMs,reports:reports.length,resets:recording.timeline.filter(r=>r.type==='reset').length,
  reportGapMs:{median:percentile(gaps,.5),p95:percentile(gaps,.95),max:gaps.length?Math.max(...gaps):0},axisStats,
  recordedEvents:recording.events,replayed:replay,
  thresholdComparisons:[.12,.2,.3,.4,.5].map(activation=>{const release=Math.min(recording.options.release??.12,activation*.4);const result=replayRecording(recording,{activation,release,pressActivation:activation,twistActivation:activation,pressRelease:release,twistRelease:release,clockwiseActivation:activation,counterclockwiseActivation:activation,pushActivation:activation,pullActivation:activation,clockwiseRelease:release,counterclockwiseRelease:release,pushRelease:release,pullRelease:release});return {activation,events:result.events};}),
  interpretation:'Freeform capture: gesture intent is inferred, not labeled ground truth. Magnitude statistics are report-weighted, not time-weighted. Threshold comparisons are diagnostics, not accuracy scores. Analyze z and rz separately; push/pull may need a lower activation threshold than rotation.'};
}
