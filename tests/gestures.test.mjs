import test from 'node:test';
import assert from 'node:assert/strict';
import { createGestures, neutralInput as n } from '../dist/index.js';
const axis={clockwise:{rz:.7},counterclockwise:{rz:-.7},push:{z:.7},pull:{z:-.7}};
function pulse(g,d,t,duration=80){return [...g.update({...n,...axis[d]},t),...g.update(n,t+duration),...g.advance(t+duration+35)];}
for(const direction of Object.keys(axis)){
 test(`${direction}: exclusive single and double pulses`,()=>{
  let g=createGestures({activation:.35,release:.12,neutralMs:35,doubleMs:320});g.update(n,0);assert.deepEqual(pulse(g,direction,10),[]);assert.deepEqual(g.advance(446).map(e=>[e.kind,e.direction,e.durationMs]),[['single',direction,80]]);
  g=createGestures({activation:.35,release:.12,neutralMs:35,doubleMs:320});g.update(n,0);pulse(g,direction,10);assert.deepEqual(pulse(g,direction,200).map(e=>[e.kind,e.direction]),[['double',direction]]);assert.deepEqual(g.advance(1000),[]);
 });
}
test('immediate is explicitly additive; triple produces double then single',()=>{const g=createGestures({singleMode:'immediate',pressMode:'simple'});g.update(n,0);assert.equal(pulse(g,'push',10)[0].kind,'single');assert.equal(pulse(g,'push',200)[0].kind,'double');assert.equal(pulse(g,'push',390)[0].kind,'single');});
test('noise, long holds, neutral dwell chatter and direct reversals do not count',()=>{
 const g=createGestures({activation:.35,release:.12,neutralMs:35,doubleMs:320});g.update(n,0);g.update({...n,z:.2},10);g.update(n,20);assert.deepEqual(g.advance(500),[]);
 assert.deepEqual(pulse(g,'push',510,10),[]);assert.deepEqual(g.advance(1000),[]);
 g.update({...n,z:.7},1010);assert.deepEqual(g.advance(1700),[]);assert.equal(g.state.phase,'blocked');g.update(n,1710);
 g.update({...n,z:.7},1800);g.update({...n,z:-.7},1900);g.update(n,2000);assert.deepEqual(g.advance(2400),[]);
 g.update({...n,z:.7},2500);g.update(n,2600);g.update({...n,z:.7},2620);g.update(n,2700);assert.deepEqual(g.advance(2720),[]);g.advance(2735);assert.equal(g.advance(3100)[0].durationMs,200);
});
test('with press-rotate disabled, dominant axis wins; ambiguous diagonal waits',()=>{const g=createGestures({pressRotate:false,activation:.35,release:.12,neutralMs:35,doubleMs:320});g.update(n,0);g.update({...n,z:.5,rz:.5},10);assert.equal(g.state.phase,'neutral');g.update({...n,z:.7,rz:.2},20);assert.equal(g.state.direction,'push');});
test('different directions emit separate singles; reset cancels pending and requires neutral',()=>{const g=createGestures({activation:.35,release:.12,neutralMs:35,doubleMs:320});g.update(n,0);pulse(g,'push',10);assert.equal(pulse(g,'pull',200)[0].direction,'push');g.reset();g.update({...n,z:.8},400);assert.equal(g.state.phase,'blocked');assert.deepEqual(g.advance(1000),[]);g.update(n,1010);assert.equal(g.state.phase,'neutral');});
test('double completion boundary is inclusive; beyond it two singles',()=>{
 for(const delta of [320,321]){const g=createGestures({activation:.35,release:.12,neutralMs:35,doubleMs:320});g.update(n,0);pulse(g,'push',10);const events=pulse(g,'push',10+delta).concat(g.advance(1000));assert.deepEqual(events.map(e=>e.kind),delta===320?['double']:['single','single']);}
});
test('report bursts between frames retain pulses; render rate does not change results',()=>{
 const reports=[[0,n],[10,{...n,rz:.8}],[90,n],[210,{...n,rz:.8}],[290,n]];
 function run(hz){const g=createGestures({activation:.35,release:.12,neutralMs:35,doubleMs:320});const schedule=reports.map(([t,input])=>({t,input}));for(let t=0;t<800;t+=1000/hz)schedule.push({t});schedule.sort((a,b)=>a.t-b.t);return schedule.flatMap(({t,input})=>input?g.update(input,t):g.advance(t));}
 assert.deepEqual(run(30),run(144));assert.equal(run(30)[0].kind,'double');
});
test('options, input and clock validation',()=>{
 for(const o of [{activation:.1,release:.2},{dominance:.5},{doubleMs:NaN},{singleMode:'other'},{maxPulseMs:1}])assert.throws(()=>createGestures(o),RangeError);
 const g=createGestures({activation:.35,release:.12,neutralMs:35,doubleMs:320});g.update(n,100);assert.throws(()=>g.advance(99),RangeError);assert.throws(()=>g.advance(Infinity),RangeError);assert.throws(()=>g.update({...n,z:NaN},110),RangeError);assert.deepEqual(g.advance(100),[]);
});
test('held input is not turned into repeated taps by report silence',()=>{const g=createGestures({activation:.35,release:.12,neutralMs:35,doubleMs:320});g.update(n,0);g.update({...n,rz:.8},10);for(let t=20;t<3000;t+=20)assert.deepEqual(g.advance(t),[]);g.update(n,3000);assert.deepEqual(g.advance(4000),[]);});

test('separate vertical and twist gates detect gentle push without lowering the twist gate',()=>{
 const g=createGestures({pressActivation:.14,pressRelease:.08,twistActivation:.26,twistRelease:.18,doubleMs:320});
 g.update(n,0);g.update({...n,z:.17},10);g.update(n,110);g.advance(145);assert.equal(g.advance(500)[0].direction,'push');
 g.update({...n,rz:.22},510);g.update(n,610);assert.deepEqual(g.advance(1000),[]);
});
test('twist release permits partial return and dominant twist excludes vertical cross-talk',()=>{
 const g=createGestures({pressActivation:.14,pressRelease:.08,twistActivation:.26,twistRelease:.18,doubleMs:400});
 g.update(n,0);g.update({...n,rz:.6,z:.2},10);g.update({...n,rz:.15},110);g.advance(145);
 g.update({...n,rz:.5,z:.15},210);g.update(n,310);assert.deepEqual(g.advance(345).map(e=>[e.direction,e.kind]),[['clockwise','double']]);assert.deepEqual(g.advance(1000),[]);
});
test('axis-specific gates reject invalid bounds and preserve reversal cancellation',()=>{
 for(const o of [{pressActivation:.05,pressRelease:.08},{twistRelease:-1},{twistActivation:NaN},{pressActivation:2}])assert.throws(()=>createGestures(o),RangeError);
 const g=createGestures({pressActivation:.14,pressRelease:.08});g.update(n,0);g.update({...n,z:.2},10);g.update({...n,z:-.1},100);assert.equal(g.state.phase,'blocked');
});

test('each signed direction can use its own gate',()=>{
 const g=createGestures({clockwiseActivation:.4,counterclockwiseActivation:.25,pushActivation:.2,pullActivation:.12,pullRelease:.06,release:.08,singleMode:'immediate',pressMode:'simple'});
 g.update(n,0);g.update({...n,rz:.3},10);g.update(n,100);assert.deepEqual(g.advance(135),[]);
 g.update({...n,rz:-.3},200);g.update(n,300);assert.equal(g.advance(335)[0].direction,'counterclockwise');
 g.update({...n,z:.15},700);g.update(n,800);assert.deepEqual(g.advance(835),[]);
 g.update({...n,z:-.15},900);g.update(n,1000);assert.equal(g.advance(1035)[0].direction,'pull');
 assert.throws(()=>createGestures({pullActivation:.1,pullRelease:.12}),RangeError);
});
