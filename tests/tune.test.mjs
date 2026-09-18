import test from 'node:test';
import assert from 'node:assert/strict';
import {createGestureTune,defaultGestureTune,gesturePresets,createGestures,createGestureRecorder,calibrateGestures,neutralInput as neutral} from '../dist/index.js';
import {createGestureGraph,renderGestureGraphSvg} from '../dist/graph.js';
const directions=['clockwise','counterclockwise','push','pull'];
function capture(actions){
 const recorder=createGestureRecorder({startTimeMs:0});let t=0;recorder.input(neutral,t);
 for(const [direction,kind] of actions){
  const key=direction==='push'||direction==='pull'?'z':'rz',sign=['push','clockwise'].includes(direction)?1:-1;
  const peak=key==='z'?.3:.5;
  for(let pulse=0;pulse<(kind==='double'?2:1);pulse++){
   t+=80;recorder.input({...neutral,[key]:sign*.05},t);
   t+=40;recorder.input({...neutral,[key]:sign*peak*.7},t);
   t+=40;recorder.input({...neutral,[key]:sign*peak},t);
   t+=40;recorder.input({...neutral,[key]:sign*peak*.6},t);
   t+=40;recorder.input(neutral,t);
  }
  t+=800;recorder.advance(t);
 }
 return recorder.snapshot(t+100);
}
const full=()=>directions.flatMap(d=>['single','double'].flatMap(k=>Array.from({length:3},()=>[d,k])));
test('default recognizer accepts the immutable tune object; presets are distinct',()=>{
 const a=createGestures(),b=createGestures(defaultGestureTune);assert.deepEqual(a.update(neutral,0),b.update(neutral,0));assert.deepEqual(a.update({...neutral,z:.25},10),b.update({...neutral,z:.25},10));assert.equal(a.state.direction,'push');
 assert.ok(gesturePresets.soft.push.activation<defaultGestureTune.push.activation);assert.ok(gesturePresets.hard.push.activation>defaultGestureTune.push.activation);
 assert.throws(()=>{defaultGestureTune.push.center=.9;},TypeError);
});
test('chainable tune edits preserve originals, centers for spread edits, and JSON round trips',()=>{
 const original=JSON.stringify(defaultGestureTune);const soft=defaultGestureTune.soften(.1),wide=soft.widen(.2),narrow=soft.narrow(.2);
 assert.equal(soft.push.center,defaultGestureTune.push.center*.9);assert.equal(wide.push.center,soft.push.center);assert.ok(wide.push.activation<soft.push.activation);assert.ok(narrow.push.activation>soft.push.activation);assert.deepEqual(wide.timing,soft.timing);assert.equal(JSON.stringify(defaultGestureTune),original);
 assert.deepEqual(createGestureTune(JSON.parse(JSON.stringify(wide))).toOptions(),wide.toOptions());
 for(const x of [-1,NaN,Infinity])assert.throws(()=>defaultGestureTune.harden(x),RangeError);assert.throws(()=>defaultGestureTune.narrow(1),RangeError);assert.throws(()=>createGestureTune({...defaultGestureTune.toJSON(),version:2}),RangeError);
});
test('calibration requires three of every action and ignores order and old event labels',()=>{
 const a=capture(full());a.events=[{direction:'push',kind:'double',timestamp:1,durationMs:1}];a.options={activation:.99};
 const grouped=calibrateGestures(a),shuffled=calibrateGestures(capture(full().filter((_,i)=>i%2).reverse().concat(full().filter((_,i)=>i%2===0))));
 assert.equal(grouped.status,'ready');assert.deepEqual(Object.values(grouped.counts),Array(8).fill(3));assert.deepEqual(grouped.counts,shuffled.counts);assert.deepEqual(grouped.tune.toJSON(),shuffled.tune.toJSON());assert.equal(grouped.tune.rotation.center,.5);assert.equal(grouped.tune.push.center,.3);
 const partial=calibrateGestures(capture(full().slice(1)));assert.equal(partial.status,'incomplete');assert.equal(partial.tune,null);assert.deepEqual(partial.missing,['clockwise.single']);assert.throws(()=>calibrateGestures(a,{minimumPerAction:2}),RangeError);
});
test('recording copies values, bounds duration, and rejects clock reversal',()=>{
 const r=createGestureRecorder({startTimeMs:100,maxDurationMs:100});const sample={...neutral,z:.2};r.input(sample,100);sample.z=.9;assert.equal(r.snapshot(150).timeline[0].input.z,.2);assert.throws(()=>r.advance(149),RangeError);r.advance(201);assert.equal(r.full,true);assert.equal(r.snapshot(202).durationMs,100);
});
test('calibration combines recordings without pairing across session boundaries',()=>{
 const actions=full(),result=calibrateGestures([capture(actions.slice(0,12)),capture(actions.slice(12))]);assert.equal(result.status,'ready');assert.deepEqual(Object.values(result.counts),Array(8).fill(3));
});
test('ambiguous rapid trains do not produce a tune',()=>{
 const r=capture([['push','double'],['push','single']]);const inputRows=r.timeline.filter(r=>r.type==='input');const shift=800;for(const row of inputRows.slice(11))row.t-=shift;
 r.timeline=inputRows;const result=calibrateGestures(r);assert.equal(result.status,'ambiguous');assert.equal(result.tune,null);
});
test('graph has four independent directions, shared rotation thresholds, and escaped labels',()=>{
 const r=capture(full()),c=calibrateGestures(r),model=createGestureGraph(r,c.tune,{actions:c.actions,start:0,end:1200});assert.equal(model.lanes.length,4);assert.equal(model.lanes[0].activation,model.lanes[1].activation);assert.ok(model.lanes.every(l=>l.points.every(p=>p.value>=0)));
 const svg=renderGestureGraphSvg(model,{title:'<script>bad</script>'});assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('Counterclockwise'));assert.ok(svg.includes('Release')||svg.includes('release'));assert.throws(()=>createGestureGraph(r,c.tune,{start:100,end:50}),RangeError);
});

test('empty option object and no argument use the same complete default tune',()=>{
 const a=createGestures(),b=createGestures({});for(const [input,t] of [[neutral,0],[{...neutral,z:.21},10],[neutral,100]])assert.deepEqual(a.update(input,t),b.update(input,t));assert.deepEqual(a.advance(600),b.advance(600));
});
test('reset between two pulses prevents them from becoming a calibration double',()=>{
 const r=capture([['push','double']]);r.timeline.push({type:'reset',t:250});r.timeline.push({type:'input',t:250,input:{...neutral}});r.timeline.sort((a,b)=>a.t-b.t);
 const c=calibrateGestures(r);assert.equal(c.counts['push.double'],0);assert.equal(c.counts['push.single'],2);
});
