import { createGestureRecorder } from '../../dist/index.js';
const $=id=>document.getElementById(id);
export function createRecorder({snapshot,begin,onSaved=()=>{}}){
 let active=null,started=0,last=null,saving=false,timer=null,reports=0;
 const status=text=>{$('recordStatus').textContent=text;};
 function lock(value){document.querySelectorAll('aside input, aside select, #restore, #connect, #calibrationPanel button, #calibrationPanel select, #calibrationPanel input').forEach(el=>{if(value)el.dataset.beforeRecordDisabled=String(el.disabled);el.disabled=value?true:el.dataset.beforeRecordDisabled==='true';});$('recordNote').disabled=value;$('recordStart').disabled=value||saving;$('recordStop').disabled=!value;}
 function refreshCount(){if(active)$('recordClock').textContent=`${Math.floor((performance.now()-started)/1000)}s / 120s · ${reports} input reports`;}
 async function history(){
  try{const response=await fetch('/api/recordings');if(!response.ok)throw Error();const rows=await response.json();$('recordings').replaceChildren();for(const r of rows){const li=document.createElement('li');li.textContent=`${new Date(r.savedAt).toLocaleString()} · ${r.source} · ${Math.round(r.durationMs/1000)}s · ${r.reports} reports · ${r.id.slice(0,8)}${r.note?' · '+r.note:''}`;$('recordings').append(li);}if(!rows.length)$('recordings').textContent='No saved recordings yet.';}catch{$('recordings').textContent='Saved recordings could not be loaded.';}
 }
 async function save(){
  if(!last||saving)return;saving=true;$('recordStart').disabled=true;$('recordRetry').disabled=true;status('Saving recording to the VM…');
  try{
   const session=await fetch('/api/session');if(!session.ok)throw Error('Session unavailable');const {token}=await session.json();
   const response=await fetch('/api/recordings',{method:'POST',headers:{'Content-Type':'application/json','X-Puck-Token':token},body:JSON.stringify(last)});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Save failed');
   status(`Saved ${result.id.slice(0,8)}. Automatic analysis appears below; I can also read it directly.`);$('recordRetry').hidden=true;await history();onSaved(last,result);
  }catch(error){status(`Not saved: ${error.message}. Your capture is still here. Retry or download a backup before leaving.`);$('recordRetry').hidden=false;}
  finally{saving=false;$('recordStart').disabled=false;$('recordRetry').disabled=false;}
 }
 async function stop(reason=''){
  if(!active)return;last=active.snapshot(performance.now());active=null;clearInterval(timer);lock(false);$('recordClock').textContent=`${Math.round(last.durationMs/1000)}s captured${reason?' · '+reason:''}`;$('recordDownload').hidden=false;await save();
 }
 $('recordStart').onclick=()=>{
  const current=snapshot();started=performance.now();active=createGestureRecorder({startTimeMs:started,options:current.options,source:current.source,note:$('recordNote').value});reports=0;
  last=null;$('recordDownload').hidden=true;$('recordRetry').hidden=true;lock(true);begin();status(`Recording ${current.source==='device'?'SpaceMouse input':'SIMULATOR input'}. Aim for at least three singles and three doubles in each direction, in any order.`);refreshCount();timer=setInterval(()=>{refreshCount();if(performance.now()-started>=120000||active?.full)void stop('Recording limit reached');},250);
 };
 $('recordStop').onclick=()=>void stop();$('recordRetry').onclick=()=>void save();$('recordRefresh').onclick=()=>void history();
 $('recordDownload').onclick=()=>{if(!last)return;const url=URL.createObjectURL(new Blob([JSON.stringify(last,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='puck-recording.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 window.addEventListener('beforeunload',e=>{if(active||saving||!$('recordRetry').hidden){e.preventDefault();e.returnValue='';}});
 void history();
 return {input(input,t){if(active){active.input(input,t);reports++;}},advance(t){active?.advance(t);},reset(t){active?.reset(t);},events(events){active?.events(events);}};
}
