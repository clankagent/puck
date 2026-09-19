import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecorder } from '../examples/gestures/recorder.js';
import { neutralInput } from '../dist/index.js';

test('lab requires physical movement, rejects empty captures, and preserves partial device input', async () => {
 const names=['document','location','window','performance','fetch','setInterval','clearInterval'];
 const original=names.map(name=>Object.getOwnPropertyDescriptor(globalThis,name));
 const elements=new Map();
 function element(id){if(!elements.has(id))elements.set(id,{id,disabled:false,hidden:true,value:'',dataset:{},textContent:'',parentElement:{before(){}},setAttribute(){},append(){},replaceChildren(){}});return elements.get(id);}
 let now=0,started=0;const posted=[];
 const values=[{getElementById:element,createElement:()=>element('health'),querySelectorAll:()=>[]},{search:''},{addEventListener(){}},{now:()=>now},async(url,options)=>{
  if(url==='/api/session')return {ok:true,json:async()=>({token:'test'})};
  if(options?.method==='POST'){posted.push(JSON.parse(options.body));return {ok:true,json:async()=>({id:'test-recording'})};}
  return {ok:true,json:async()=>[]};
 },()=>1,()=>{}];
 names.forEach((name,i)=>Object.defineProperty(globalThis,name,{value:values[i],configurable:true}));
 try{
  const recorder=createRecorder({snapshot:()=>({options:{},source:'device'}),begin(){started++;}});
  assert.equal(element('recordStart').disabled,true);
  element('recordStart').onclick();assert.equal(started,0);
  recorder.connected(true);assert.equal(element('recordStart').disabled,true);
  recorder.input({...neutralInput,z:.3},1); // Synthetic input must not unlock hardware recording.
  assert.equal(element('recordStart').disabled,true);
  recorder.input(neutralInput,2,true);assert.equal(element('recordStart').disabled,true);
  recorder.input({...neutralInput,z:.3},3,true);assert.equal(element('recordStart').disabled,false);
  now=10;element('recordStart').onclick();assert.equal(started,1);
  now=100;recorder.advance(now);await element('recordStop').onclick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(posted.length,0);assert.match(element('recordStatus').textContent,/No movement was captured/);
  now=200;element('recordStart').onclick();
  recorder.input({...neutralInput,rz:.4},210); // Wrong source must not enter device capture.
  recorder.input({...neutralInput,z:.3,rx:.4},220,true);
  recorder.input({...neutralInput,z:.02,rx:.5},230,true); // Relaxed pressure is retained verbatim.
  now=300;recorder.connected(false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(posted.length,1);assert.equal(posted[0].source,'device');
  assert.equal(posted[0].timeline.length,2);
  assert.equal(posted[0].timeline[1].input.z,.02);
  assert.match(element('recordStatus').textContent,/Device disconnected — partial recording/);
  assert.equal(element('recordStart').disabled,true);
 }finally{names.forEach((name,i)=>original[i]?Object.defineProperty(globalThis,name,original[i]):delete globalThis[name]);}
});
