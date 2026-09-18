import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { createGestures } from '../../dist/index.js';
export const MAX_DURATION = 120000;
const axes = ['x','y','z','rx','ry','rz'];
const directions = ['clockwise','counterclockwise','push','pull'];
const number = (v,min,max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
function requireValue(ok) { if (!ok) throw new Error('Invalid recording format.'); }
export function validateRecording(data) {
 requireValue(data && data.version===1 && ['device','simulator'].includes(data.source));
 requireValue(typeof data.note==='string' && data.note.length<=500);
 requireValue(number(data.durationMs,0,MAX_DURATION+2000));
 requireValue(Array.isArray(data.timeline) && data.timeline.length<=60000);
 requireValue(Array.isArray(data.events) && data.events.length<=10000);
 requireValue(data.options && typeof data.options==='object' && !Array.isArray(data.options));
 const allowed=['activation','release','clockwiseActivation','clockwiseRelease','counterclockwiseActivation','counterclockwiseRelease','pushActivation','pushRelease','pullActivation','pullRelease','pressActivation','pressRelease','twistActivation','twistRelease','minPulseMs','maxPulseMs','neutralMs','doubleMs','singleMode','dominance'];
 requireValue(Object.keys(data.options).every(key=>allowed.includes(key)));
 createGestures(data.options);
 let previous=0;
 for(const row of data.timeline){
  requireValue(row && number(row.t,previous,data.durationMs));previous=row.t;
  requireValue(['input','advance','reset'].includes(row.type));
  if(row.type==='input')requireValue(row.input && axes.every(axis=>number(row.input[axis],-1,1)));
 }
 for(const event of data.events)requireValue(directions.includes(event.direction) && ['single','double'].includes(event.kind) && number(event.timestamp,0,data.durationMs) && number(event.durationMs,0,MAX_DURATION));
 // Construct only the documented schema; never persist arbitrary extra fields.
 return {version:1,source:data.source,note:data.note,durationMs:data.durationMs,options:data.options,
  timeline:data.timeline.map(r=>r.type==='input'?{t:r.t,type:r.type,input:Object.fromEntries(axes.map(a=>[a,r.input[a]]))}:{t:r.t,type:r.type}),
  events:data.events.map(e=>({direction:e.direction,kind:e.kind,timestamp:e.timestamp,durationMs:e.durationMs}))};
}
export function createRecordingApi(directory) {
 const token=randomBytes(32).toString('hex');
 const reply=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 return async(req,res,path)=>{
  if(!path.startsWith('/api/'))return false;
  try{
   if(path==='/api/session' && req.method==='GET'){reply(res,200,{token});return true;}
   if(path==='/api/recordings' && req.method==='POST'){
    if(req.headers['x-puck-token']!==token){reply(res,403,{error:'Refresh the page and try saving again.'});return true;}
    if(!req.headers['content-type']?.startsWith('application/json')){reply(res,415,{error:'JSON required.'});return true;}
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024){reply(res,413,{error:'Recording exceeds 8 MB.'});return true;}chunks.push(chunk);}
    let recording;try{recording=validateRecording(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reply(res,400,{error:'Recording is invalid or exceeds the recording limits.'});return true;}
    const id=randomUUID();const savedAt=new Date().toISOString();await mkdir(directory,{recursive:true});
    await writeFile(join(directory,id+'.json'),JSON.stringify({...recording,id,savedAt}),{flag:'wx'});
    reply(res,201,{id,savedAt});return true;
   }
   if(path==='/api/recordings' && req.method==='GET'){
    let files;try{files=await readdir(directory);}catch(e){if(e.code!=='ENOENT')throw e;files=[];}
    const list=[];for(const file of files.filter(f=>/^[a-f0-9-]{36}\.json$/.test(f))){try{const r=JSON.parse(await readFile(join(directory,file),'utf8'));list.push({id:r.id,savedAt:r.savedAt,source:r.source,note:r.note,durationMs:r.durationMs,reports:r.timeline.filter(e=>e.type==='input').length,events:r.events.length});}catch{}}
    reply(res,200,list.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)).slice(0,20));return true;
   }
   const match=path.match(/^\/api\/recordings\/([a-f0-9-]{36})$/);
   if(match && req.method==='GET'){try{reply(res,200,JSON.parse(await readFile(join(directory,match[1]+'.json'),'utf8')));}catch(e){if(e.code==='ENOENT')reply(res,404,{error:'Recording not found.'});else throw e;}return true;}
   reply(res,404,{error:'Not found.'});return true;
  }catch{reply(res,500,{error:'Could not save or read the recording. Retry saving or download a backup.'});return true;}
 };
}
