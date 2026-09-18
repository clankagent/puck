import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { analyzeRecording } from './analyze.mjs';
const directory=process.env.PUCK_RECORDINGS_DIR || join(process.env.LOCALAPPDATA || join(homedir(),'.local','share'),'Puck','recordings');
let file=process.argv[2];
if(!file){
 const names=await readdir(directory).catch(()=>[]);
 const recordings=[];
 for(const name of names.filter(n=>/^[a-f0-9-]{36}\.json$/.test(n))){const r=JSON.parse(await readFile(join(directory,name),'utf8'));if(r.source==='device')recordings.push({name,savedAt:r.savedAt});}
 recordings.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
 if(!recordings.length){console.error('No device recordings saved yet.');process.exit(1);}
 file=join(directory,recordings[0].name);
}
console.log(JSON.stringify(analyzeRecording(JSON.parse(await readFile(file,'utf8'))),null,2));
