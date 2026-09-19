import { calibrateGestures, calibratePressTilts, createGestureTune, defaultGestureTune } from '../../dist/index.js';
import { createGestureGraph, createPressTiltGraph, renderGestureGraphSvg } from '../../dist/graph.js';
const $=id=>document.getElementById(id);
const labels={clockwise:'Clockwise',counterclockwise:'Counterclockwise',push:'Push down',pull:'Pull up'};
export function createCalibrationPanel({applyTune}){
 let recording=null,result=null,tune=null,original=null,captures=[],combined=false;
 function draw(){
  if(!recording)return;const index=Number($('inspectAction').value);const action=index>=0?result.actions[index]:null;
  const recordingIndex=action?.recording??captures.length-1;const displayed=captures[recordingIndex].value;const model=(combined?createPressTiltGraph:createGestureGraph)(displayed,tune??defaultGestureTune,{recordingIndex,actions:result.actions,start:action?Math.max(0,action.start-200):0,end:action?Math.min(displayed.durationMs,action.end+350):Math.max(1,displayed.durationMs)});
  $('calibrationGraph').innerHTML=renderGestureGraphSvg(model,{width:Math.max(280,$('calibrationGraph').clientWidth),title:action?`${labels[action.direction]} ${action.tilt??action.kind} detail`:'Recorded gestures by direction'});
 }
 function renderTune(){
  $('applyTune').disabled=!tune;document.querySelectorAll('[data-tune-edit],#resetTune,#downloadTune').forEach(b=>b.disabled=!tune);
  $('tuneSummary').replaceChildren();if(tune)for(const [name,band] of [['Rotation (both directions)',tune.rotation],['Push down',tune.push],['Pull up',tune.pull],...(tune.pressTilt?[['Combined tilt',tune.pressTilt.force]]:[])]){const row=document.createElement('tr');for(const v of [name,band.center.toFixed(3),`${band.low.toFixed(2)}–${band.high.toFixed(2)}`,band.activation.toFixed(2),band.release.toFixed(2)]){const cell=document.createElement('td');cell.textContent=v;row.append(cell);}$('tuneSummary').append(row);}
  $('tuneJson').textContent=tune?JSON.stringify(tune,null,2):'A tune becomes available when all eight actions have at least three clear examples.';
  draw();
 }
 function show(value,meta={}){
  if(value.note?.startsWith('[tilt] ')){
   recording=null;result=null;tune=null;original=null;captures=[];
   $('calibrationStatus').textContent='Standalone tilts saved for analysis in chat. These will not be calibrated as push/pull combinations.';
   $('coverage').replaceChildren();$('calibrationIssues').textContent='Single and double tilts are separate actions. Raw pressure and rotation are retained for checking cross-axis interference.';
   $('inspectAction').replaceChildren(new Option('Awaiting standalone tilt analysis','-1'));$('inspectAction').disabled=true;
   $('calibrationGraph').textContent='Standalone tilt analysis is pending this recording.';renderTune();$('tuneJson').textContent='Standalone tilt tuning is not available yet.';return;
  }
  try{recording=value;if(!$('combineRecordings').checked)captures=[];const id=meta.id??value.id??'unsaved';const existing=captures.findIndex(c=>c.id===id);if(existing>=0)captures[existing]={id,value};else captures.push({id,value});const tiltResult=calibratePressTilts(captures.map(c=>c.value));combined=captures.some(c=>c.value.note?.startsWith('[press-move] '))||tiltResult.actions.length>=3;result=combined?tiltResult:calibrateGestures(captures.map(c=>c.value));tune=result.tune;original=tune;
   $('calibrationStatus').textContent=`${meta.id?meta.id.slice(0,8)+' · ':''}${value.source==='simulator'?'Simulator · ':''}${result.status==='ready'?'Calibration ready':result.status==='ambiguous'?'Ambiguous actions need a clearer recording':'More examples needed'} · ${result.actions.length} inferred actions across ${captures.length} recording(s)`;
   $('coverage').replaceChildren();for(const [key,count] of Object.entries(result.counts)){const [d,k]=key.split('.');const li=document.createElement('li');li.className=count>=3?'complete':'missing';li.textContent=`${labels[d]} ${k}: ${count} / 3`;$('coverage').append(li);}
   $('calibrationIssues').textContent=(combined?'Combined tilt analysis. Plain single/double settings stay at the base tune. ':'')+(result.issues.join(' ')||(result.missing.length?'Record the missing examples and enable “Combine with loaded recordings” to combine them.':'All eight action types have enough evidence. Counts describe inferred intent.'));
   $('inspectAction').replaceChildren(new Option('Entire latest recording','-1'));result.actions.forEach((a,i)=>$('inspectAction').add(new Option(`${captures.length>1?`Recording ${a.recording+1} · `:""}${(a.start/1000).toFixed(2)}s · ${labels[a.direction]} ${a.tilt??a.kind}`,String(i))));
   $('inspectAction').disabled=false;renderTune();
  }catch(error){$('calibrationStatus').textContent=`Could not analyze recording: ${error.message}`;tune=null;$('applyTune').disabled=true;}
 }
 async function load(){
  $('loadRecording').disabled=true;
  try{const response=await fetch('/api/recordings');if(!response.ok)throw Error('Recordings unavailable');const rows=await response.json();const selected=$('recordingChoice').value;const item=rows.find(r=>r.id===selected)||rows.find(r=>r.source==='device')||rows[0];
   $('recordingChoice').replaceChildren(new Option('Latest device recording',''));for(const r of rows)$('recordingChoice').add(new Option(`${r.id.slice(0,8)} · ${r.source} · ${Math.round(r.durationMs/1000)}s`,r.id));
   if(!item){$('calibrationStatus').textContent='Record some input to begin.';return;}const data=await fetch('/api/recordings/'+item.id);if(!data.ok)throw Error('Recording could not be read');show(await data.json(),item);$('recordingChoice').value=item.id;
  }catch(error){$('calibrationStatus').textContent=error.message;}finally{$('loadRecording').disabled=false;}
 }
 $('loadRecording').onclick=load;$('recordingChoice').onchange=load;$('inspectAction').onchange=draw;
 $('applyTune').onclick=()=>{if(tune){applyTune(tune,combined);$('calibrationIssues').textContent='Tune applied to live input. The original calibration is unchanged.';}};
 for(const button of document.querySelectorAll('[data-tune-edit]'))button.onclick=()=>{if(tune){tune=tune[button.dataset.tuneEdit](.1);renderTune();}};
 $('resetTune').onclick=()=>{tune=original;renderTune();};
 $('downloadTune').onclick=()=>{if(!tune)return;const url=URL.createObjectURL(new Blob([JSON.stringify(tune,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='puck-tune.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 new ResizeObserver(()=>{if(recording)draw();}).observe($('calibrationGraph'));
 return {show};
}
