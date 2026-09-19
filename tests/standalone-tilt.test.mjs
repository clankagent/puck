import test from 'node:test';
import assert from 'node:assert/strict';
import {createGestures,calibrateTilts,createGestureTune,defaultGestureTune,neutralInput as n} from '../dist/index.js';
import {createTiltGraph} from '../dist/graph.js';
const dirs=['rx+','rx-','ry+','ry-'];
const sample=(d,force=.6)=>({...n,[d.slice(0,2)]:d.endsWith('+')?force:-force});
function run(rows,opts={}){const g=createGestures({standaloneTilt:true,...opts});const out=[];for(const [t,input]of rows)out.push(...g.update(input,t));return out.concat(g.advance(2000));}
for(const d of dirs)test(`${d} standalone single/double; opt-in only`,()=>{
 const rows=[[0,n],[10,sample(d)],[60,n]];
 assert.deepEqual(run(rows).map(e=>[e.direction,e.kind,e.tilt]),[[d,'single',undefined]]);
 assert.deepEqual(run(rows.concat([[200,sample(d)],[250,n]])).map(e=>e.kind),['double']);
 assert.deepEqual(run(rows,{standaloneTilt:false}),[]);
 assert.deepEqual(run(rows.concat([[200,sample(d)],[250,n]]),{singleMode:'immediate'}).map(e=>e.kind),['single','double']);
});
test('tilt-first keeps incidental pressure out of combined and plain press actions',()=>{
 const rows=[[0,n],[10,sample('rx+')],[40,{...sample('rx+'),z:-.2}],[100,{...n,z:-.1}],[130,n]];
 const events=run(rows,{pressMode:'auto'});assert.equal(events.length,1);assert.equal(events[0].direction,'rx+');
});
test('pressure-first chooses the combined gesture even with standalone enabled',()=>{
 const events=run([[0,n],[10,{...n,z:.3}],[50,{...sample('ry+'),z:.15}],[100,n]],{pressMode:'auto'});
 assert.equal(events.length,1);assert.equal(events[0].direction,'push');assert.equal(events[0].tilt,'ry+');
});
test('fast doubles keep a short neutral valley and do not need long recording-style movements',()=>{
 const events=run([[0,n],[10,sample('rx+')],[40,n],[55,sample('rx+')],[85,n]]);
 assert.equal(events.length,1);assert.equal(events[0].kind,'double');
});
test('standalone reversal, held input and reset cancel without repetitions',()=>{
 assert.deepEqual(run([[0,n],[10,sample('rx+')],[60,sample('rx-')],[100,n]]),[]);
 assert.deepEqual(run([[0,n],[10,sample('rx+')],[1000,n]]),[]);
 const g=createGestures({standaloneTilt:true});g.update(n,0);g.update(sample('ry+'),10);g.reset();g.update(n,80);assert.deepEqual(g.advance(1000),[]);
});
function capture(actions){let t=0;const timeline=[{type:'input',t,input:{...n}}];for(const [d,kind]of actions){for(let i=0;i<(kind==='double'?2:1);i++){t+=80;timeline.push({type:'input',t,input:sample(d,.1)});t+=40;timeline.push({type:'input',t,input:sample(d,.5)});t+=40;timeline.push({type:'input',t,input:sample(d,.7)});t+=40;timeline.push({type:'input',t,input:sample(d,.4)});t+=40;timeline.push({type:'input',t,input:{...n}});}t+=800;}return {version:1,source:'simulator',note:'',durationMs:t,options:{},timeline,events:[]};}
test('standalone calibration combines recordings, ignores order and labels, preserves other tune families',()=>{
 const actions=dirs.flatMap(d=>['single','double'].flatMap(k=>Array.from({length:3},()=>[d,k])));
 const a=capture(actions.slice(0,12)),b=capture(actions.slice(12));const c=calibrateTilts([a,b]);
 assert.equal(c.status,'ready');assert.deepEqual(Object.values(c.counts),Array(8).fill(3));
 assert.deepEqual(calibrateTilts(capture(actions.reverse())).counts,c.counts);
 assert.deepEqual(c.tune.pressTilt,defaultGestureTune.pressTilt);assert.deepEqual(c.tune.timing,defaultGestureTune.timing);
 assert.equal(calibrateTilts(a).tune,null);
 const graph=createTiltGraph(a,c.tune,{actions:c.actions});assert.equal(graph.lanes.length,4);assert.equal(graph.lanes[0].direction,'rx+');
 const data=JSON.parse(JSON.stringify(c.tune)),restored=createGestureTune(data);data.standaloneTilt.rx.activation=.99;
 assert.notEqual(restored.toOptions().tiltXActivation,.99);assert.ok(restored.soften(.1).standaloneTilt.rx.activation<restored.standaloneTilt.rx.activation);
});
