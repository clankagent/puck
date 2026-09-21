import { createPuck, control, recipes, motionDefaults, neutralInput, replayPuck } from '../../dist/index.js';
import { connectWebHid } from '../../dist/webhid.js';
import { projectCube, initialPose, advancePose } from './movement.js';
const $ = id => document.getElementById(id), axes = ['x','y','z','rx','ry','rz'];
let runtime, controls, contexts, handles, connection, run, pose = initialPose(), adjusted = 0, sample = { ...neutralInput }, history = [], samples = [], frozen = false, lastDraw = 0;
const counts = new Map();
const names = { single: 'Push · single', double: 'Pull · double', clockwise: 'Clockwise · single', counterclockwise: 'Counterclockwise · single', push: 'Push · selection', pull: 'Pull · selection', pushAdjust: 'Push · held adjustment', pullAdjust: 'Pull · held adjustment' };
function declaration() {
  return `import { createPuck, control, recipes } from '@clankagent/puck';\n\nconst controls = recipes.sixAxis(${JSON.stringify({ translationSpeed: +$('translationSpeed').value, rotationSpeed: +$('rotationSpeed').value * Math.PI / 180 })});\nconst contexts = {\n  commands: {\n    single: control.gesture('push'),\n    double: control.gesture('pull', { count: 2 }),\n    clockwise: control.gesture('cw'),\n    counterclockwise: control.gesture('ccw'),\n  },\n  selection: {\n    push: recipes.directionSelection({ activation: 'push', cancel: ${JSON.stringify(cancelOptions())}, ownership: { mode: 'exclusive', channels: 'all' } }),\n    pull: recipes.directionSelection({ activation: 'pull', cancel: ${JSON.stringify(cancelOptions())}, ownership: { mode: 'exclusive', channels: 'all' } }),\n  },\n  adjustment: {\n    pushAdjust: recipes.heldValue('push', 'twist'),\n    pullAdjust: recipes.heldValue('pull', 'twist'),\n  },\n};\nconst conflicts = [...Object.values(contexts.selection), ...Object.values(contexts.adjustment)]\n  .map(prefer => ({ prefer, over: Object.values(controls) }));\nconst puck = createPuck({ controls, contexts, context: '${$('context').value}', conflicts });\n\n// Feed input through @clankagent/puck/webhid connectPuck(puck),\n// or puck.feed(sample, timestamp). Your application owns rendering.\n// const frame = puck.frame(timestamp);\n// const translation = frame.integrate(controls.translation);\n// const rotation = frame.integrate(controls.rotation); // radians\n// puck.on(contexts.selection.pull, event => { /* application action */ });`;
}
function cancelOptions() { return $('cancelMode').value === 'double' ? { input:'twist', direction:'same', count:2 } : { input:'twist', direction:'either' }; }
function make() {
  if (runtime) runtime.dispose();
  controls = recipes.sixAxis({ translationSpeed: +$('translationSpeed').value, rotationSpeed: +$('rotationSpeed').value * Math.PI / 180 });
  contexts = {
    commands: { single: control.gesture('push'), double: control.gesture('pull', { count:2 }), clockwise:control.gesture('cw'), counterclockwise:control.gesture('ccw') },
    selection: Object.fromEntries(['push','pull'].map(activation => [activation, recipes.directionSelection({ activation, cancel:cancelOptions(), ownership:{mode:'exclusive',channels:'all'} })])),
    adjustment: { pushAdjust:recipes.heldValue('push','twist'), pullAdjust:recipes.heldValue('pull','twist') },
  };
  handles = new Map(Object.values(contexts).flatMap(Object.entries).map(([name,h]) => [h,name]));
  const conflicts = [...Object.values(contexts.selection), ...Object.values(contexts.adjustment)].map(prefer => ({prefer,over:Object.values(controls)}));
  runtime = createPuck({controls,contexts,context:$('context').value,conflicts,trace:true,record:true});
  for (const [h,name] of handles) runtime.on(h,e => {
    if (e.type === 'trigger' || e.type === 'begin') counts.set(name,(counts.get(name)??0)+1);
    history.push({name,...e}); history = history.slice(-150);
    $('outcome').textContent = e.type === 'trigger' ? `${names[name]} detected` : e.type === 'commit' ? `${names[name]} committed${typeof e.value === 'number' ? ' · '+e.value.toFixed(2) : ''}` : e.type === 'cancel' ? `${names[name]} canceled · ${e.reason}` : `${names[name]} ${e.type}`;
    paintCounts();
    $('events').replaceChildren(...history.slice(-30).reverse().map(row => {const li=document.createElement('li'); li.textContent=`${(row.timestamp/1000).toFixed(2)}s · ${names[row.name]} · ${row.type}${row.reason?' · '+row.reason:''}`;return li;}));
  });
  sample={...neutralInput}; if(connection)runtime.interrupt('configuration-change');else runtime.feed(sample); runtime.frame(performance.now());
  $('declaration').textContent=declaration(); paintCounts(); renderButtons();
}
function paintCounts(){ $('counts').replaceChildren(...[...handles].map(([h,name])=>{const d=document.createElement('div'),n=counts.get(name)??0;d.className=n?'detected':'';d.textContent=names[name];const s=document.createElement('strong');s.textContent=n;d.append(s);d.setAttribute('aria-label',`${names[name]}, ${n} detections`);return d;})); }
function feed(value,t=performance.now()){sample={...value};runtime.feed(sample,t);for(const a of axes){$('axis-'+a).value=sample[a];$('value-'+a).textContent=sample[a].toFixed(2);}}
function stop(reason='explicit'){run=null;runtime.interrupt(reason);sample={...neutralInput};if(!connection)feed(sample);for(const a of axes){$('axis-'+a).value=0;$('value-'+a).textContent='0.00';}}
function simulate(kind){
  if(connection)return;stop();const neutral={},z=kind.startsWith('pull')?-.75:.75;
  let rows;
  if(kind==='single')rows=[[0,neutral],[60,{z:.75}],[180,neutral]];
  else if(kind==='double')rows=[[0,neutral],[60,{z:-.75}],[180,neutral],[300,{z:-.75}],[420,neutral]];
  else if(kind==='clockwise'||kind==='counterclockwise')rows=[[0,neutral],[60,{rz:kind==='clockwise'?.75:-.75}],[180,neutral]];
  else if(kind.includes('Adjust'))rows=[[0,neutral],[60,{z}],[140,{z,rz:.75}],[850,neutral]];
  else if(kind.endsWith('Cancel'))rows=[[0,neutral],[60,{z}],[140,{z,rx:.75}],[250,{z,rx:.75,rz:.75}],[340,{z,rx:.75}],[460,{z,rx:.75,rz:.75}],[550,{z,rx:.75}],[720,neutral]];
  else rows=[[0,neutral],[60,{z}],[200,{z,rx:.75,ry:.75}],[550,{z,ry:.75}],[800,neutral]];
  run={start:performance.now(),rows,index:0};$('status').textContent=`Simulating ${kind}.`;
}
function renderButtons(){
  const mode=$('context').value,items=mode==='commands'?['single','double','clockwise','counterclockwise']:mode==='selection'?['push','pull','pushCancel','pullCancel']:['pushAdjust','pullAdjust'];
  $('simulations').replaceChildren(...items.map(kind=>{const b=document.createElement('button');b.textContent='Try '+(names[kind]??kind.replace('Cancel',' · cancel'));b.disabled=!!connection;b.onclick=()=>simulate(kind);return b;}));
  $('sessionTitle').textContent=mode==='commands'?'Commands':mode==='selection'?'Directional selection':'Held adjustment';
  $('radial').hidden=mode!=='selection';$('adjusted').hidden=mode!=='adjustment';
  $('instructions').textContent=mode==='commands'?'Short push, double pull, or twist. Commands share input with movement.':mode==='selection'?'Push or pull to open. Tilt to choose; release pressure to commit. Twist cancels. Selection captures movement until the cap returns to neutral.':'Push or pull and hold. Twist in either direction to adjust the value continuously; return twist to center to pause adjustment while keeping the session open.';
}
for(const axis of axes){const label=document.createElement('label');label.innerHTML=`${axis} <output id="value-${axis}">0.00</output><input id="axis-${axis}" aria-label="${axis} deflection" type="range" min="-1" max="1" step="0.01" value="0"><svg viewBox="0 0 360 90" aria-label="${axis} raw and effective rate graph" role="img"><path d="M0 45H360" stroke="#b4c3d4"/><path id="raw-${axis}" fill="none" stroke="#2355cb" stroke-width="2"/><path id="rate-${axis}" fill="none" stroke="#23754e" stroke-width="2"/></svg>`;$('sliders').append(label);$('axis-'+axis).oninput=()=>{run=null;feed(Object.fromEntries(axes.map(a=>[a,+$('axis-'+a).value])));};}
$('translationSpeed').value=motionDefaults.translationSpeed;$('rotationSpeed').value=motionDefaults.rotationSpeed*180/Math.PI;
for(const [id,h] of [['translationSpeed','translation'],['rotationSpeed','rotation']])$(id).onchange=()=>{const n=+$(id).value;if(!Number.isFinite(n)||n<0||n>+$(id).max){$('status').textContent='Enter a valid nonnegative speed.';return;}runtime.configure(controls[h],{speed:id==='rotationSpeed'?n*Math.PI/180:n});$('declaration').textContent=declaration();};
$('context').onchange=()=>{stop();runtime.setContext($('context').value);if(!connection)feed(neutralInput);renderButtons();$('declaration').textContent=declaration();};
$('cancelMode').onchange=()=>{stop();make();$('status').textContent='Cancellation policy changed. Started a fresh recording; counters retained.';};
$('neutral').onclick=()=>{run=null;feed(neutralInput);};
$('resetCounts').onclick=()=>{counts.clear();paintCounts();};
$('resetSession').onclick=()=>{stop();pose=initialPose();adjusted=0;$('outcome').textContent='Session reset. Counters retained.';};
$('resetView').onclick=()=>{pose=initialPose();};
$('freeze').onclick=()=>{frozen=!frozen;$('freeze').textContent=frozen?'Resume graphs':'Freeze graphs';};
function download(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').onclick=()=>download('puck-controls-recording.json',runtime.recording());
$('saveSettings').onclick=()=>download('puck-controls-settings.json',runtime.settings());
$('restoreSettings').onchange=async e=>{try{runtime.restoreSettings(JSON.parse(await e.target.files[0].text()));const s=runtime.settings().controls;$('translationSpeed').value=s['controls.translation'].speed;$('rotationSpeed').value=s['controls.rotation'].speed*180/Math.PI;$('status').textContent='Settings restored; release to neutral before starting an interaction.';$('declaration').textContent=declaration();}catch(error){$('status').textContent=error.message;}finally{e.target.value='';}};
$('replay').onchange=async e=>{try{const r=replayPuck(JSON.parse(await e.target.files[0].text()));$('replayStatus').textContent=`Replay ${r.complete?'complete':'partial (recording limit reached)'}: ${r.events.length} occurrences, ${r.frames.length} movement frames. Live controls unchanged.`;r.puck.dispose();}catch(error){$('replayStatus').textContent=`Replay failed: ${error.message}`;}finally{e.target.value='';}};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(declaration());$('status').textContent='SDK declaration copied.';}catch{$('status').textContent='Copy from the Application declaration below.';}};
$('connect').onclick=async()=>{try{stop();if(connection){const c=connection;connection=null;await c.close();}else connection=await connectWebHid({onInput(v){if(v!==neutralInput)feed(v);},onInterrupt:reason=>stop(reason),onDisconnect(){connection=null;connected();}});connected();}catch(error){$('status').textContent=error.message;}};
function connected(){runtime.interrupt('pause');$('connect').textContent=connection?'Disconnect':'Connect SpaceMouse';$('status').textContent=connection?'Device connected. Release to neutral to arm.':'Simulator ready.';for(const a of axes)$('axis-'+a).disabled=!!connection;$('neutral').disabled=!!connection;renderButtons();}
window.addEventListener('blur',()=>stop('blur'));document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('blur');});
function chart(t){const path=(axis,key)=>samples.map((s,i)=>`${i?'L':'M'}${((s.t-t+8000)/8000*360).toFixed(1)},${(45-s[key][axis]*38).toFixed(1)}`).join(' ');for(const a of axes){$('raw-'+a).setAttribute('d',path(a,'input'));$('rate-'+a).setAttribute('d',path(a,'rate'));}
  $('timeline').innerHTML='<text x="0" y="14" fill="#465870" font-size="12">Lifecycle · begin / update / commit / cancel / trigger</text>'+history.filter(e=>e.timestamp>=t-8000).map(e=>`<circle cx="${(e.timestamp-t+8000)/8000*800}" cy="${30+['begin','update','commit','cancel','trigger'].indexOf(e.type)*11}" r="3" fill="${e.type==='cancel'?'#ac3755':'#2355cb'}"/>`).join('');
}
function frame(){
  const t=performance.now();
  if(run){if(t-run.start>1800)stop();else if(run.index<run.rows.length&&t>=run.start+run.rows[run.index][0]){feed({...neutralInput,...run.rows[run.index++][1]},t);}if(run&&run.index===run.rows.length&&t-run.start>1200){run=null;$('status').textContent='Simulation finished.';}}
  const f=runtime.frame(t),translation=f.integrate(controls.translation),rotation=f.integrate(controls.rotation);advancePose(pose,{translation,rotation:rotation.map(v=>v*180/Math.PI)});
  for(const h of Object.values(contexts.adjustment))adjusted+=f.integrate(h);
  const active=[...handles].find(([h])=>h.kind==='interaction'&&runtime.read(h).status==='active');
  $('owner').textContent=active?`${names[active[1]]} owns its input`:'Movement available · release to neutral if rearming';document.querySelector('.session-view').classList.toggle('active',!!active);
  const selected=active&&$ ('context').value==='selection'?runtime.read(active[0]).value:null;$('selection').textContent=selected??'—';
  $('sectors').innerHTML=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4,x=150+100*Math.cos(a),y=150+100*Math.sin(a);return `<circle cx="${x}" cy="${y}" r="28" fill="${selected===i?'#2355cb':'#edf2f8'}" stroke="#71859e"/><text x="${x}" y="${y+5}" text-anchor="middle" fill="${selected===i?'white':'#35465f'}">${i}</text>`;}).join('');
  $('adjusted').textContent=`Adjusted value: ${adjusted.toFixed(2)}`;
  const vertices=projectCube(pose),faces=[[0,1,3,2],[4,5,7,6],[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5]];$('cube').innerHTML=faces.map(face=>`<polygon points="${face.map(i=>vertices[i].join(',')).join(' ')}" fill="#2355cb18" stroke="#2355cb" stroke-width="2"/>`).join('');$('pose').textContent=`Position: ${pose.position.map(v=>v.toFixed(1)).join(' / ')} · Rotation: ${pose.angles.map(v=>v.toFixed(1)+'°').join(' / ')}`;
  const linear=runtime.read(controls.translation),angular=runtime.read(controls.rotation),speed=+$('translationSpeed').value||1,rot=(+$('rotationSpeed').value*Math.PI/180)||1;
  samples.push({t,input:{...sample},rate:Object.fromEntries(axes.map((a,i)=>[a,i<3?linear[i]/speed:angular[i-3]/rot]))});while(samples.length&&samples[0].t<t-8000)samples.shift();
  if(t-lastDraw>100){if(!frozen)chart(t);if($('inspection').parentElement.open)$('inspection').textContent=JSON.stringify(runtime.inspect(),null,2);lastDraw=t;}
  if(runtime.recordingFull)$('replayStatus').textContent='Recording limit reached. Export the bounded recording, then change cancellation policy to start a fresh capture.';
  requestAnimationFrame(frame);
}
make();requestAnimationFrame(frame);
