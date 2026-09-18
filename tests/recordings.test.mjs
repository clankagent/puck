import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { createRecordingApi, validateRecording } from '../examples/gestures/recording-api.mjs';
import { replayRecording, analyzeRecording } from '../examples/gestures/analyze.mjs';
const neutral={x:0,y:0,z:0,rx:0,ry:0,rz:0};
const capture=()=>({version:1,source:'simulator',note:'Synthetic fixture',durationMs:800,options:{activation:.35,release:.12,neutralMs:35,doubleMs:320},timeline:[{type:'input',t:0,input:neutral},{type:'input',t:10,input:{...neutral,z:.7}},{type:'input',t:90,input:neutral},{type:'advance',t:130},{type:'advance',t:500}],events:[{direction:'push',kind:'single',timestamp:445,durationMs:80}]});
test('recording validation rejects invalid time, axis values, format and extra option fields',()=>{
 assert.equal(validateRecording(capture()).timeline.length,5);
 for(const mutate of [r=>r.timeline[1].t=-1,r=>r.timeline[1].input.z=2,r=>r.durationMs=999999,r=>r.options.path='../secrets',r=>r.events[0].timestamp=900]){const r=capture();mutate(r);assert.throws(()=>validateRecording(r));}
 const r=capture();r.extra='not stored';assert.equal(validateRecording(r).extra,undefined);
});
test('recorded timing replays recognition and exposes separate vertical/rotation magnitudes',()=>{
 const r=capture();assert.deepEqual(replayRecording(r).events,r.events);
 const report=analyzeRecording(r);assert.equal(report.axisStats.z.max,.7);assert.equal(report.axisStats.rz.max,0);assert.equal(report.thresholdComparisons.length,5);
 r.timeline.push({type:'reset',t:600});assert.equal(replayRecording(r).pendingAtStop,null);
});
test('recording API requires session token, saves, lists and reads exact capture',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'puck-record-test-'));const api=createRecordingApi(dir);const server=createServer((req,res)=>api(req,res,new URL(req.url,'http://localhost').pathname));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(base+'/api/recordings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(capture())})).status,403);
  const {token}=await (await fetch(base+'/api/session')).json();const headers={'Content-Type':'application/json','X-Puck-Token':token};
  assert.equal((await fetch(base+'/api/recordings',{method:'POST',headers,body:'{}'})).status,400);
  const response=await fetch(base+'/api/recordings',{method:'POST',headers,body:JSON.stringify(capture())});assert.equal(response.status,201);const saved=await response.json();
  const list=await (await fetch(base+'/api/recordings')).json();assert.equal(list[0].id,saved.id);assert.equal(list[0].reports,3);
  const read=await (await fetch(base+'/api/recordings/'+saved.id)).json();assert.deepEqual(read.timeline,capture().timeline);assert.deepEqual(replayRecording(read).events,read.events);
  assert.equal((await readdir(dir)).length,1);
  assert.equal((await fetch(base+'/api/recordings/not-a-recording')).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));const target=await realpath(dir);const within=relative(await realpath(tmpdir()),target);if(isAbsolute(within)||within.startsWith('..')||!within.startsWith('puck-record-test-'))throw Error('Unsafe test cleanup path');await rm(target,{recursive:true,force:true});}
});
