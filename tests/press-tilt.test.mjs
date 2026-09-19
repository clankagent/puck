import test from 'node:test';
import assert from 'node:assert/strict';
import {createGestures,createGestureTune,defaultGestureTune,calibratePressTilts,neutralInput as n} from '../dist/index.js';
import {createPressTiltGraph,renderGestureGraphSvg} from '../dist/graph.js';
import {validateRecording} from '../examples/gestures/recording-api.mjs';
const sides=['rx+','rx-','ry+','ry-'];
const sample=(d,s,value=.6,z=.3)=>({...n,z:d==='push'?z:-z,...(s?{[s.slice(0,2)]:s.endsWith('+')?value:-value}:{})});
function run(rows,options={pressMode:'auto'},hz=0){
 const g=createGestures(options),scheduled=rows.map(([t,input])=>({t,input}));
 if(hz)for(let t=0;t<=1200;t+=1000/hz)scheduled.push({t});
 scheduled.sort((a,b)=>a.t-b.t);const events=scheduled.flatMap(({t,input})=>input?g.update(input,t):g.advance(t));
 return events.concat(g.advance(2000));
}
for(const d of ['push','pull'])for(const s of sides)test(`${d} + ${s}: fast relaxed press-tilt emits one combined action`,()=>{
 const rows=[[0,n],[10,sample(d)],[30,sample(d,s,.6,.02)],[65,n]];
 const events=run(rows);assert.equal(events.length,1);assert.equal(events[0].direction,d);assert.equal(events[0].tilt,s);assert.equal(events[0].kind,'single');assert.equal(events[0].timestamp,90);
 assert.deepEqual(run(rows,{pressMode:'auto'},30),run(rows,{pressMode:'auto'},144));
});
test('plain double presses survive all modes and per-sign choices',()=>{
 for(const pressMode of ['simple','auto','tilt']){
  const rows=[[0,n],[10,sample('push')],[80,n],[200,sample('push')],[270,n]];
  assert.deepEqual(run(rows,{pressMode}).map(e=>[e.kind,e.tilt]),[['double',undefined]]);
 }
 assert.deepEqual(run([[0,n],[10,sample('push')],[80,n]],{pressMode:'tilt'}),[]);
 assert.equal(run([[0,n],[10,sample('pull')],[80,n]],{pushMode:'tilt',pullMode:'simple'})[0].kind,'single');
});
test('full pressure relaxation can resume, but an expired arm cannot',()=>{
 const rows=[[0,n],[10,sample('push')],[90,n],[180,sample('push','ry+',.6,0)],[230,n]];
 const events=run(rows);assert.equal(events.length,1);assert.equal(events[0].tilt,'ry+');assert.equal(events[0].durationMs,220);
 const expired=run([[0,n],[10,sample('push')],[90,n],[400,sample('push','ry+',.6,0)],[450,n]]);
 assert.equal(expired.length,1);assert.equal(expired[0].tilt,undefined);
});
test('partial relaxation into a second pressure excursion consumes the pending single',()=>{
 const e=run([[0,n],[10,sample('push')],[90,n],[180,sample('push')],[195,sample('push','rx+')],[250,n]]);
 assert.equal(e.length,1);assert.equal(e[0].tilt,'rx+');
});
test('pre-existing tilt, ambiguous diagonals and short spikes do not trigger a combined action',()=>{
 for(const rows of [
  [[0,n],[5,{...n,rx:.6}],[10,sample('push','rx+')],[100,n]],
  [[0,n],[10,sample('push')],[50,{...n,z:.3,rx:.6,ry:.6}],[100,n]],
  [[0,n],[10,sample('push')],[50,sample('push','rx+')],[60,n]],
 ])assert.ok(run(rows).every(e=>!e.tilt));
});
test('stronger sustained final direction wins over a preparatory tilt',()=>{
 const e=run([[0,n],[10,sample('push')],[40,sample('push','rx-',.3)],[80,sample('push','ry-',.8)],[160,n]]);
 assert.equal(e.length,1);assert.equal(e[0].tilt,'ry-');
});
test('reset, reversal and long holds cancel; held reports never repeat',()=>{
 for(const rows of [ [[0,n],[10,sample('push')],[40,sample('push','rx+')],[80,sample('pull','rx+')],[100,n]], [[0,n],[10,sample('push')],[40,sample('push','rx+')],[1100,n]] ])assert.deepEqual(run(rows),[]);
 const g=createGestures({pressMode:'auto'});g.update(n,0);g.update(sample('pull'),10);g.update(sample('pull','ry+'),40);g.advance(80);g.reset();assert.deepEqual(g.update(n,100),[]);assert.deepEqual(g.advance(1000),[]);
});
test('candidate starting at arm boundary may finish its short noise dwell',()=>{
 const e=run([[0,n],[10,sample('push')],[460,sample('push','rx+')],[500,n]]);assert.equal(e[0].tilt,'rx+');
});
test('press-tilt tune is immutable, editable, portable and optional in old data',()=>{
 const data=JSON.parse(JSON.stringify(defaultGestureTune));const tune=createGestureTune(data);data.pressTilt.force.activation=.99;
 assert.equal(tune.toOptions().tiltActivation,.24);assert.equal(tune.soften(.1).pressTilt.force.activation,.24*.9);
 assert.deepEqual(createGestureTune(JSON.parse(JSON.stringify(tune))).toOptions(),tune.toOptions());
 delete data.pressTilt;assert.equal(createGestureTune(data).pressTilt,undefined);
 for(const options of [{pressMode:'bad'},{pressMode:'auto',singleMode:'immediate'},{tiltMinMs:-1},{tiltActivation:.1,tiltRelease:.2},{tiltArmMs:Infinity}])assert.throws(()=>createGestures(options),RangeError);
 const g=createGestures({pressMode:'auto'});assert.throws(()=>g.update({...n,rx:NaN},0),RangeError);
});
function recording(){
 let t=0;const timeline=[{type:'input',t,input:{...n}}];
 for(const d of ['push','pull'])for(const s of sides)for(let i=0;i<3;i++){
  t+=300;timeline.push({type:'input',t,input:sample(d)});t+=50;timeline.push({type:'input',t,input:sample(d,s)});t+=50;timeline.push({type:'input',t,input:sample(d,s,.7,.1)});t+=50;timeline.push({type:'input',t,input:{...n}});
 }
 return {version:1,source:'simulator',note:'',durationMs:t+300,options:{},events:[],timeline};
}
test('combined calibration is order independent, requires every combination, and preserves plain tune',()=>{
 const r=recording(),a=calibratePressTilts(r);assert.equal(a.status,'ready');assert.deepEqual(Object.values(a.counts),Array(8).fill(3));assert.deepEqual(a.tune.push,defaultGestureTune.push);assert.deepEqual(a.tune.timing,defaultGestureTune.timing);
 const partial={...r,timeline:r.timeline.slice(0,-4)};assert.equal(calibratePressTilts(partial).tune,null);
 r.events=[{direction:'push',kind:'double',timestamp:0,durationMs:0}];r.options={activation:.99};assert.deepEqual(calibratePressTilts(r).counts,a.counts);
 assert.throws(()=>calibratePressTilts(r,{minimumPerAction:2}),RangeError);
});
test('combined graph has pressure and tilt lanes, holds samples at window edges, and labels actions',()=>{
 const r=recording(),c=calibratePressTilts(r),model=createPressTiltGraph(r,c.tune,{actions:c.actions,start:370,end:395});
 assert.equal(model.lanes.length,6);assert.equal(model.lanes.find(l=>l.direction==='rx+').points[0].value,.6);
 assert.ok(renderGestureGraphSvg(model).includes('push + rx+'));
});
test('recording server preserves combined events and accepts the exact tune options',()=>{
 const r=recording();r.options={...defaultGestureTune.toOptions(),pressMode:'auto'};
 r.events=[{direction:'push',tilt:'rx+',kind:'single',timestamp:500,durationMs:150}];
 assert.deepEqual(validateRecording(r).events,r.events);
 r.events[0].kind='double';assert.throws(()=>validateRecording(r));
});
