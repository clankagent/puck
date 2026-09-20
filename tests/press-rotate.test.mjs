import test from 'node:test';
import assert from 'node:assert/strict';
import {createGestures, neutralInput as n, createGestureRecorder} from '../dist/index.js';
import {validateRecording} from '../examples/gestures/recording-api.mjs';
const sample=(direction,rotation)=>({...n,z:direction==='push'?.65:-.65,rz:rotation==='clockwise'?.7:-.7});
for(const direction of ['push','pull'])for(const rotation of ['clockwise','counterclockwise']) {
 test(`${direction} + ${rotation}: tap and unlimited hold have exclusive outcomes`,()=>{
  const g=createGestures();g.update(n,0);g.update({...sample(direction,rotation),rz:0},10);
  assert.deepEqual(g.update(sample(direction,rotation),50),[]);
  const tap=g.update(n,150);assert.deepEqual(tap,[{direction,rotation,kind:'single',timestamp:150,durationMs:100}]);
  assert.deepEqual(g.advance(2000),[]);
  g.update(sample(direction,rotation),2010);assert.deepEqual(g.advance(2259),[]);
  assert.equal(g.advance(2260)[0].kind,'holdstart');assert.equal(g.state.hold.rotation,rotation);
  assert.deepEqual(g.advance(12000),[]);assert.equal(g.state.hold.strength,.7);
  const end=g.update(n,12010);assert.equal(end.length,1);assert.equal(end[0].kind,'holdend');
  assert.equal(g.state.hold,null);assert.deepEqual(g.advance(15000),[]);
 });
}
test('either axis release stops immediately; reversal and reset cancel, without a trailing single',()=>{
 for(const released of [{...n,z:.65},{...n,rz:.7},n,{...n,z:-.65,rz:.7},{...n,z:.65,rz:-.7}]){
  const g=createGestures();g.update(n,0);g.update(sample('push','clockwise'),10);g.advance(300);
  assert.equal(g.update(released,310)[0].kind,released.z<0||released.rz<0?'holdcancel':'holdend');
  assert.equal(g.state.hold,null);g.update(n,400);assert.deepEqual(g.advance(2000),[]);
 }
 const g=createGestures();g.update(n,0);g.update(sample('pull','counterclockwise'),10);g.advance(300);
 assert.equal(g.reset(400)[0].kind,'holdcancel');assert.equal(g.state.hold,null);
 assert.deepEqual(g.update(sample('pull','counterclockwise'),410),[]);assert.deepEqual(g.advance(900),[]);
 g.update(n,1000);g.update(sample('pull','counterclockwise'),1010);assert.equal(g.advance(1300)[0].kind,'holdstart');
});
test('hold deadlines are frame independent and long pressure-first arming works',()=>{
 const rows=[[0,n],[10,{...n,z:.65}],[2010,sample('push','clockwise')],[15000,n]];
 function run(hz){const g=createGestures(),schedule=rows.map(([t,input])=>({t,input}));for(let t=0;t<16000;t+=1000/hz)schedule.push({t});schedule.sort((a,b)=>a.t-b.t);return schedule.flatMap(({t,input})=>input?g.update(input,t):g.advance(t));}
 assert.deepEqual(run(30),run(144));assert.deepEqual(run(30).map(e=>e.kind),['holdstart','holdend']);
});
test('noise, twist-first and tilt-first input do not create pressure-rotation actions',()=>{
 const g=createGestures();g.update(n,0);g.update(sample('push','clockwise'),10);assert.deepEqual(g.update(n,20),[]);assert.deepEqual(g.advance(1000),[]);
 for(const first of [{...n,rz:.7},{...n,rx:.7}]){
  const h=createGestures();h.update(n,0);h.update(first,10);
  const events=h.update({...sample('push','clockwise'),rx:first.rx},60).concat(h.advance(400),h.update(n,500),h.advance(1500));
  assert.ok(events.every(e=>!e.rotation));
 }
});
test('explicit opt-out, custom hold delay, live strength, clock and option validation',()=>{
 for(const options of [{pressRotate:'yes'},{rotateHoldMs:NaN},{rotateMinMs:-1},{rotateHoldMs:10,rotateMinMs:20}])assert.throws(()=>createGestures(options),RangeError);
 const g=createGestures({rotateHoldMs:100});g.update(n,0);g.update(sample('push','clockwise'),10);
 assert.equal(g.advance(110)[0].kind,'holdstart');g.update({...n,z:.5,rz:.4},120);assert.equal(g.state.hold.strength,.4);
 assert.throws(()=>g.reset(100),RangeError);assert.throws(()=>g.update({...n,rz:NaN},130),RangeError);
 const h=createGestures({pressRotate:false});h.update(n,0);h.update(sample('push','clockwise'),10);assert.deepEqual(h.advance(400),[]);assert.equal(h.state.hold,null);
});
test('recording preserves rotation tap and hold lifecycle with explicit options',()=>{
 const g=createGestures(),r=createGestureRecorder({startTimeMs:0,options:{pressRotate:true,rotateMinMs:25,rotateHoldMs:250}});
 for(const [t,input] of [[0,n],[10,sample('push','clockwise')],[400,sample('push','clockwise')],[600,n]]){r.input(input,t);r.events(g.update(input,t));}
 const data=r.snapshot(1000);assert.deepEqual(validateRecording(data).events,data.events);
 assert.deepEqual(data.events.map(e=>e.kind),['holdstart','holdend']);
 for(const bad of [{...data.events[0],rotation:'invalid'},{...data.events[0],rotation:undefined},{...data.events[0],tilt:'rx+'}])assert.throws(()=>validateRecording({...data,events:[bad]}));
});

test('starting a combination preserves an earlier independent pending single',()=>{
 const g=createGestures();g.update(n,0);g.update({...n,rz:.7},10);g.update(n,80);g.advance(110);
 g.update(sample('push','clockwise'),200);
 const events=g.advance(500).concat(g.update(n,700),g.advance(2000));
 assert.deepEqual(events.map(e=>[e.direction,e.rotation,e.kind]),[['push','clockwise','holdstart'],['clockwise',undefined,'single'],['push','clockwise','holdend']]);
});

test('gradual pressure can cross the activation gate before twisting',()=>{
 const g=createGestures();g.update(n,0);
 for(const [t,z] of [[10,.08],[20,.1],[30,.15],[40,.3]])g.update({...n,z},t);
 g.update({...n,z:.3,rz:.7},50);
 assert.equal(g.advance(300)[0].kind,'holdstart');
});
