import { createGestureRecorder } from '../../dist/index.js';
const $=id=>document.getElementById(id);
export function createRecorder({snapshot,begin,onSaved=()=>{}}){
 const pressMove=new URLSearchParams(location.search).get('capture')==='press-move';
 const tiltOnly=new URLSearchParams(location.search).get('capture')==='tilt';
 if(tiltOnly){
  $('recordTitle').textContent='Record standalone tilts';
  $('recordTitle').closest('.section-head').nextElementSibling.textContent='Tilt naturally in each of the four directions, without deliberately pushing down, pulling up or twisting. Aim for at least three singles and three doubles per direction. Any order; groups are fine. Use your normal speed and leave a pause between separate actions.';
  $('recordStatus').textContent='Freeform capture for standalone tilt analysis. Connect and move the cap once, then record.';
  $('calibrationStatus').textContent='Standalone tilt timing and thresholds will be analyzed from this recording in chat.';
 }
 if(pressMove){
  $('recordTitle').textContent='Record push-move & pull-move';
  $('recordTitle').closest('.section-head').nextElementSibling.textContent='Move naturally: push down or pull up, then rotate or tilt in the direction that feels comfortable. Aim for three examples of each combination, plus ordinary single and double presses. Any order; groups are fine. Relax pressure however feels normal, and leave a short pause between separate actions.';
  $('recordStatus').textContent='Freeform capture. Connect, record, then stop & save. No prompts or fixed sequence.';
  $('calibrationStatus').textContent='Combined tilt calibration uses the raw six-axis recording. At least three examples of each push/pull + tilt direction are required.';
 }
 // Simulator capture is an explicit test mode; never silently substitute it for hardware.
 const simulator=new URLSearchParams(location.search).get('source')==='simulator';
 const health=document.createElement('p');health.id='recordHealth';health.setAttribute('role','status');
 $('recordStart').parentElement.before(health);
 let active=null,started=0,last=null,saving=false,timer=null,reports=0,movingReports=0;
 let connected=false,deviceMotion=false,lastReportAt=0,captureSource=null,stopReason='';
 const status=text=>{$('recordStatus').textContent=text;};
 function readiness(){
  $('recordStart').disabled=Boolean(active)||saving||!(connected?deviceMotion:simulator);
  if(!active)health.textContent=connected?(deviceMotion?'Device input verified. Ready to record.':'Connected — move the cap once to verify reports before recording.'):(simulator?'SIMULATOR TEST MODE — this does not record your physical device.':'Device not connected. Use “Connect SpaceMouse” above before recording.');
 }
 function lock(value){document.querySelectorAll('aside input, aside select, #restore, #connect, #calibrationPanel button, #calibrationPanel select, #calibrationPanel input').forEach(el=>{if(value)el.dataset.beforeRecordDisabled=String(el.disabled);el.disabled=value?true:el.dataset.beforeRecordDisabled==='true';});$('recordNote').disabled=value;$('recordStop').disabled=!value;readiness();}
 function refreshCount(){if(active){
  const now=performance.now();$('recordClock').textContent=`${Math.floor((now-started)/1000)}s / 120s · ${reports} input reports · ${movingReports} with movement`;
  health.textContent=!movingReports?'No movement captured yet. Move the cap and check that the report count rises.':now-lastReportAt>3000?'No new reports for 3 seconds. Move the cap to check input; a steady hold can also be silent.':`Receiving ${captureSource==='device'?'device':'simulator'} input — ${reports} reports captured.`;
 }}
 async function history(){
  try{const response=await fetch('/api/recordings');if(!response.ok)throw Error();const rows=await response.json();$('recordings').replaceChildren();for(const r of rows){const li=document.createElement('li');li.textContent=`${new Date(r.savedAt).toLocaleString()} · ${r.source} · ${Math.round(r.durationMs/1000)}s · ${r.reports} reports · ${r.id.slice(0,8)}${r.note?' · '+r.note:''}`;$('recordings').append(li);}if(!rows.length)$('recordings').textContent='No saved recordings yet.';}catch{$('recordings').textContent='Saved recordings could not be loaded.';}
 }
 async function save(){
  if(!last||saving)return;saving=true;$('recordStart').disabled=true;$('recordRetry').disabled=true;status('Saving recording to the VM…');
  try{
   const session=await fetch('/api/session');if(!session.ok)throw Error('Session unavailable');const {token}=await session.json();
   const response=await fetch('/api/recordings',{method:'POST',headers:{'Content-Type':'application/json','X-Puck-Token':token},body:JSON.stringify(last)});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Save failed');
   status(`Saved ${result.id.slice(0,8)} · ${last.source} · ${reports} input reports. ${stopReason?stopReason+'. ':''}${pressMove||tiltOnly?'Tell me “analyze my latest recording” in chat; no upload needed.':'Automatic analysis appears below; I can also read it directly.'}`);$('recordRetry').hidden=true;await history();onSaved(last,result);
  }catch(error){status(`Not saved: ${error.message}. Your capture is still here. Retry or download a backup before leaving.`);$('recordRetry').hidden=false;}
  finally{saving=false;readiness();$('recordRetry').disabled=false;}
 }
 async function stop(reason=''){
  if(!active)return;last=active.snapshot(performance.now());active=null;stopReason=reason;clearInterval(timer);lock(false);$('recordClock').textContent=`${Math.round(last.durationMs/1000)}s captured${reason?' · '+reason:''}`;$('recordDownload').hidden=false;
  if(!movingReports){status('No movement was captured. This is not a usable recording and has not been saved. Check the device connection; a diagnostic backup is available.');return;}
  await save();
 }
 $('recordStart').onclick=()=>{
  if(active||saving||!(connected?deviceMotion:simulator)){readiness();return;}
  const current=snapshot();captureSource=connected?'device':'simulator';started=performance.now();active=createGestureRecorder({startTimeMs:started,options:current.options,source:captureSource,note:((tiltOnly?'[tilt] ':pressMove?'[press-move] ':'')+$('recordNote').value).slice(0,500)});reports=0;movingReports=0;lastReportAt=started;stopReason='';
  last=null;$('recordDownload').hidden=true;$('recordRetry').hidden=true;lock(true);begin();status(`Recording ${captureSource==='device'?'SpaceMouse input':'SIMULATOR input'}. ${tiltOnly?'Use standalone tilt singles and doubles. All six raw axes are being saved.':pressMove?'Use natural push-move, pull-move and ordinary presses. All six raw axes are being saved.':'Aim for at least three singles and three doubles in each direction, in any order.'}`);refreshCount();timer=setInterval(()=>{refreshCount();if(performance.now()-started>=120000||active?.full)void stop('Recording limit reached');},250);
 };
 $('recordStop').onclick=()=>void stop();$('recordRetry').onclick=()=>void save();$('recordRefresh').onclick=()=>void history();
 $('recordDownload').onclick=()=>{if(!last)return;const url=URL.createObjectURL(new Blob([JSON.stringify(last,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='puck-recording.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 window.addEventListener('beforeunload',e=>{if(active||saving||!$('recordRetry').hidden){e.preventDefault();e.returnValue='';}});
 void history();readiness();
 return {
  connected(value){connected=value;if(!value)deviceMotion=false;if(active&&captureSource==='device'&&!value)void stop('Device disconnected — partial recording');readiness();},
  input(input,t,physical=false){
   const moving=Object.values(input).some(v=>v!==0);
   if(physical&&moving){deviceMotion=true;readiness();}
   if(active&&(physical===(captureSource==='device'))){active.input(input,t);reports++;if(moving)movingReports++;lastReportAt=t;refreshCount();}
  },advance(t){active?.advance(t);},reset(t){active?.reset(t);},events(events){active?.events(events);}
 };
}
