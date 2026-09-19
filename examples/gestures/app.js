import { createGestures, neutralInput, defaultGestureTune, gesturePresets, createGestureTune } from '../../dist/index.js';
import { presetOptions, applyFamilyTune } from './settings.js';
import { connectWebHid } from '../../dist/webhid.js';
import { createRecorder } from './recorder.js';
import { createCalibrationPanel } from './calibration-panel.js';
import { createGestureGraph, createPressTiltGraph, createTiltGraph, renderGestureGraphSvg } from '../../dist/graph.js';
const $ = id => document.getElementById(id);
const presets=Object.fromEntries(Object.entries(gesturePresets).map(([key,tune])=>[key,tune.toOptions()]));
let currentTune=defaultGestureTune;
const directionAxes={twist:'twist',push:'press',pull:'press'};
const specs = [
  ['twistActivation','Rotation activation',.08,.8,.01,'','Same gate for clockwise and counterclockwise.'],
  ['pushActivation','Push activation',.06,.7,.01,'','Downward force needed to begin a pulse.'],
  ['pullActivation','Pull activation',.06,.7,.01,'','Upward force needed to begin a pulse.'],
  ['twistRelease','Rotation release',.02,.4,.01,'','Same return threshold in both directions.'],
  ['pushRelease','Push release',.02,.3,.01,'','Downward return threshold.'],
  ['pullRelease','Pull release',.02,.3,.01,'','Upward return threshold.'],
  ['minPulseMs','Minimum pulse',0,150,5,' ms','Ignore brief spikes.'],
  ['maxPulseMs','Maximum pulse',200,1200,25,' ms','Longer holds are continuous movement, not taps.'],
  ['neutralMs','Neutral dwell',0,120,5,' ms','Require a stable release before counting.'],
  ['doubleMs','Double window',100,650,10,' ms','Time between completed pulses.'],
  ['dominance','Axis dominance',1,2.5,.1,'×','Strongest axis ÷ other axis at activation.'],
  ['tiltXActivation','Standalone rx activation',.06,.8,.01,'','Shared threshold for positive and negative rx.'],
  ['tiltYActivation','Standalone ry activation',.06,.8,.01,'','Shared threshold for positive and negative ry.'],
  ['standaloneDoubleMs','Standalone double window',100,650,10,' ms','Time between completed tilt pulses.'],
  ['tiltActivation','Tilt activation',.08,.8,.01,'','Tilt on rx/ry after push or pull.'],
  ['tiltRelease','Tilt release',.02,.3,.01,'','Tilt must return below this to complete.'],
  ['tiltMinMs','Tilt noise filter',0,100,5,' ms','Minimum sustained tilt, not a target gesture speed.'],
  ['tiltArmMs','Time to begin tilt',100,800,25,' ms','Maximum allowance after pressure begins.'],
  ['tiltRelaxMs','Pressure relaxation allowance',0,300,10,' ms','Brief full release may still belong to the same combination.'],
];
const names = {clockwise:'Clockwise',counterclockwise:'Counterclockwise',push:'Push down',pull:'Pull up','rx+':'Tilt rx+','rx-':'Tilt rx−','ry+':'Tilt ry+','ry-':'Tilt ry−'};
let options = presetOptions(defaultGestureTune), recognizer = createGestures(options), input = {...neutralInput};
let connection = null, held = null, log = [], samples = [], comparison = null;
let reportCount=0,lastReportAt=null;
const calibration=createCalibrationPanel({applyTune(tune,family){const next=applyFamilyTune(currentTune,tune,family,options);currentTune=next.tune;options=next.options;apply();}});
const recorder=createRecorder({onSaved:calibration.show,snapshot:()=>({source:connection?'device':'simulator',options}),begin(){recognizer.reset();}});
try { const saved = JSON.parse(localStorage.getItem('puck-gesture-comparison')); if(saved){createGestures(saved);comparison=saved;} } catch {}
for (const [id,label,min,max,step,unit,hint] of specs) {
  const node=document.createElement('div');
  node.innerHTML=`<label for="${id}">${label}<output id="${id}Value"></output></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}"><p class="hint">${hint}</p>`;
  $('controls').append(node);
  $(id).step=id.includes('Ms')?'1':'.001';
  $(id).oninput=()=>{options[id]=Number($(id).value);for(const axis of Object.keys(directionAxes)){if(options[axis+'Release']>=options[axis+'Activation'])options[axis+'Release']=+(options[axis+'Activation']-.01).toFixed(2);}apply();};
}
for(const [direction,symbol] of [['counterclockwise','↶'],['clockwise','↷'],['push','↓'],['pull','↑']]){
 const b=document.createElement('button');b.dataset.direction=direction;b.innerHTML=`<strong aria-hidden="true">${symbol}</strong>${names[direction]}`;
 b.onpointerdown=e=>{if(connection||held)return;e.preventDefault();b.focus();b.setPointerCapture(e.pointerId);start(direction);};
 b.onpointerup=()=>stop();b.onpointercancel=()=>stop();b.onlostpointercapture=()=>{if(held===direction)stop();};
 b.onkeydown=e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();start(direction);}};
 b.onkeyup=e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();stop();}};
 b.onblur=()=>{if(held===direction)stop();};$('directions').append(b);
}
function received(events){recorder.events(events);
 for(const e of events){
  $('result').textContent=`${names[e.direction]}${e.tilt?' + '+e.tilt:''} · ${e.kind}`;
  $('detail').textContent=`${Math.round(e.durationMs)} ms pulse · ${options.singleMode==='exclusive'?'exclusive':'additive'} behavior`;
  log.unshift({...e,delay:Math.max(0,performance.now()-e.timestamp)});
 }
 if(events.length){log=log.slice(0,40);$('events').replaceChildren();for(const e of log){const row=document.createElement('tr');for(const value of [names[e.direction]+(e.tilt?' + '+e.tilt:''),e.kind,`${Math.round(e.durationMs)} ms`,`${Math.round(e.delay)} ms`]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}$('events').append(row);}}
}
function feed(value,physical=false){const t=performance.now();input={...value};if(physical){reportCount++;lastReportAt=t;}recorder.input(input,t,physical);received(recognizer.update(input,t));}
function clearInput(){recorder.reset(performance.now());held=null;input={...neutralInput};recognizer.reset();document.querySelectorAll('.held').forEach(b=>b.classList.remove('held'));if(!connection)feed(input);}
function start(direction){if(connection||held)return;held=direction;const v={...neutralInput};if(direction==='push')v.z=.75;if(direction==='pull')v.z=-.75;if(direction==='clockwise')v.rz=.75;if(direction==='counterclockwise')v.rz=-.75;feed(v);document.querySelector(`[data-direction="${direction}"]`).classList.add('held');}
function stop(){if(!held)return;held=null;feed(neutralInput);document.querySelectorAll('.held').forEach(b=>b.classList.remove('held'));}
const keyMap={ArrowLeft:'counterclockwise',ArrowRight:'clockwise',ArrowDown:'push',ArrowUp:'pull'};
window.addEventListener('keydown',e=>{if(!keyMap[e.key]||e.target.closest('input,select,textarea')||connection)return;e.preventDefault();if(!e.repeat)start(keyMap[e.key]);});
window.addEventListener('keyup',e=>{if(keyMap[e.key]===held){e.preventDefault();stop();}});
window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInput();});
function apply(){
 options={...defaultGestureTune.toOptions(),...options};
 for(const axis of ['X','Y'])options['tilt'+axis+'Release']=Math.min(options['tilt'+axis+'Release'],options['tilt'+axis+'Activation']-.01);
 options.tiltRelease=Math.min(options.tiltRelease,options.tiltActivation-.01);
 options.tiltRelaxMs=Math.min(options.tiltRelaxMs,options.tiltArmMs);
 if(options.pressMode&&options.pressMode!=='simple')options.singleMode='exclusive';
 for(const axis of Object.keys(directionAxes)){options[axis+'Activation']??=options[directionAxes[axis]+'Activation']??options.activation;options[axis+'Release']??=options[directionAxes[axis]+'Release']??options.release;}
 recognizer=createGestures(options);clearInput();
 for(const [id,,,,,unit] of specs){$(id).value=options[id];$(id+'Value').textContent=Number(options[id].toFixed(3))+unit;}
 for(const axis of Object.keys(directionAxes))$(axis+'Release').max=(options[axis+'Activation']-.01).toFixed(2);$('standaloneTilt').checked=Boolean(options.standaloneTilt);$('singleMode').value=options.singleMode;$('pressMode').value=options.pressMode??'simple';$('singleMode').disabled=Boolean(options.pressMode&&options.pressMode!=='simple');
 $('modeHelp').textContent=options.singleMode==='exclusive'?`Singles wait ${options.doubleMs} ms after release confirmation. Doubles emit once.`:'Singles fire on release confirmation. A second pulse also emits double; the first single is not undone.';
 $('activeModes').textContent=`Enabled: twist and plain doubles · push/pull ${options.pressMode??'simple'} · standalone tilt ${options.standaloneTilt?'on':'off'}. Combined push/lift + tilt emits a single on release.`;
 $('result').textContent='Ready when you are';$('detail').textContent='Settings applied. Pending gestures cleared.';
 $('restore').disabled=!comparison;
 const match=Object.entries(presets).find(([,value])=>Object.entries(value).every(([key,v])=>options[key]===v)&&Object.keys(directionAxes).every(axis=>(value[axis+'Activation']??value[directionAxes[axis]+'Activation']??value.activation)===options[axis+'Activation']&&(value[axis+'Release']??value[directionAxes[axis]+'Release']??value.release)===options[axis+'Release']));
 if(!match&&!$('preset').querySelector('[value="custom"]'))$('preset').add(new Option('Custom','custom'));
 $('preset').value=match?.[0]??'custom';
}
$('preset').onchange=()=>{if(presets[$('preset').value]){currentTune=gesturePresets[$('preset').value];options=presetOptions(currentTune,options);apply();}};
$('singleMode').onchange=()=>{options.singleMode=$('singleMode').value;apply();};
$('standaloneTilt').onchange=()=>{options.standaloneTilt=$('standaloneTilt').checked;apply();};
$('pressMode').onchange=()=>{options.pressMode=$('pressMode').value;apply();};
$('save').onclick=()=>{comparison={...options};$('restore').disabled=false;try{localStorage.setItem('puck-gesture-comparison',JSON.stringify(comparison));$('saved').textContent='Comparison A saved in this browser.';}catch{$('saved').textContent='Comparison A saved for this session.';}};
$('restore').onclick=()=>{options={...comparison};apply();$('saved').textContent='Comparison A restored.';};
$('export').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(options,null,2));$('feedback').textContent='Settings copied.';}catch{$('feedback').textContent=JSON.stringify(options);}};
$('clear').onclick=()=>{log=[];$('events').innerHTML='<tr><td colspan="4" class="muted">History cleared. Try another gesture.</td></tr>';};
function connectionUI(){const connected=Boolean(connection);recorder.connected(connected);$('connect').textContent=connected?'Disconnect':'Connect SpaceMouse';$('source').textContent=connected?'Live device':'Simulator';document.querySelectorAll('[data-direction]').forEach(b=>b.disabled=connected);}
$('connect').onclick=async()=>{
 $('connect').disabled=true;
 try{
  if(connection){const closing=connection;connection=null;await closing.close();$('connection').textContent='Disconnected. Simulator ready.';}
  else{reportCount=0;lastReportAt=null;clearInput();connection=await connectWebHid({onInput(value){if(value===neutralInput)clearInput();else feed(value,true);},onReset:clearInput,onDisconnect(){connection=null;clearInput();connectionUI();$('connection').textContent='Device disconnected. Simulator ready.';}});$('connection').textContent=connection?'Live input. Release the cap to neutral to arm the recognizer.':'No device selected. Simulator ready.';if(connection)recognizer.reset();}
 }catch(error){$('connection').textContent=error.message;}finally{$('connect').disabled=false;connectionUI();}
};
let lastGraph=0;
function graphTune(){
 const data=currentTune.toJSON(),p=data.pressTilt??defaultGestureTune.pressTilt;const st=data.standaloneTilt??defaultGestureTune.standaloneTilt;return createGestureTune({...data,standaloneTilt:{...st,rx:{...st.rx,activation:options.tiltXActivation,release:options.tiltXRelease},ry:{...st.ry,activation:options.tiltYActivation,release:options.tiltYRelease},timing:{...st.timing,doubleMs:options.standaloneDoubleMs}},pressTilt:{...p,force:{...p.force,activation:options.tiltActivation,release:options.tiltRelease},minMs:options.tiltMinMs,armMs:options.tiltArmMs,relaxMs:options.tiltRelaxMs},rotation:{...data.rotation,activation:options.twistActivation,release:options.twistRelease},push:{...data.push,activation:options.pushActivation,release:options.pushRelease},pull:{...data.pull,activation:options.pullActivation,release:options.pullRelease},timing:{minPulseMs:options.minPulseMs,maxPulseMs:options.maxPulseMs,neutralMs:options.neutralMs,doubleMs:options.doubleMs}});
}
function frame(){
 const t=performance.now();recorder.advance(t);received(recognizer.advance(t));samples.push({t,input:{...input}});while(samples.length&&samples[0].t<t-4000)samples.shift();
 if(t-lastGraph>125){lastGraph=t;const origin=Math.max(0,t-4000);const r={version:1,source:'simulator',note:'',durationMs:Math.min(4000,t),options,timeline:samples.map(s=>({type:'input',t:s.t-origin,input:s.input})),events:[]};$('liveGraph').innerHTML=renderGestureGraphSvg((options.pressMode&&options.pressMode!=='simple'?createPressTiltGraph:options.standaloneTilt?createTiltGraph:createGestureGraph)(r,graphTune()),{width:Math.max(280,$('liveGraph').clientWidth),title:'Live input by axis direction'});}
 $('inputStatus').textContent=!connection?'Simulator — connect the device for live input.':document.hidden||!document.hasFocus()?'Device paused: focus this page to receive input.':lastReportAt===null?'Connected; no movement report received yet. Move the cap.':`${reportCount} device reports · last ${Math.max(0,Math.round((t-lastReportAt)/1000))}s ago · lift ${Math.max(0,-input.z).toFixed(2)} · tilt rx ${input.rx.toFixed(2)} / ry ${input.ry.toFixed(2)}`;
 const state=recognizer.state;$('phase').textContent=state.phase==='blocked'?'Release to arm':state.direction?`${names[state.direction]} · ${state.phase}`:state.pending?`${names[state.pending]} · waiting`:'Neutral';
 $('values').textContent=`Blue = input. Cross green to start; return below gray to release. Twist ${input.rz.toFixed(2)} · vertical ${input.z.toFixed(2)} · rx ${input.rx.toFixed(2)} · ry ${input.ry.toFixed(2)}.`;
 requestAnimationFrame(frame);
}
apply();if(comparison)$('saved').textContent='Comparison A available from this browser.';requestAnimationFrame(frame);
