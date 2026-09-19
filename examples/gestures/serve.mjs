import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createRecordingApi } from './recording-api.mjs';
const directory=process.env.PUCK_RECORDINGS_DIR || join(process.env.LOCALAPPDATA || join(homedir(),'.local','share'),'Puck','recordings');
const api=createRecordingApi(directory);
const files = new Map([
 ['/',new URL('./index.html',import.meta.url)],['/style.css',new URL('./style.css',import.meta.url)],['/app.js',new URL('./app.js',import.meta.url)],['/recorder.js',new URL('./recorder.js',import.meta.url)],['/calibration-panel.js',new URL('./calibration-panel.js',import.meta.url)],
 ...['index','input','motion','gestures','webhid','tune','recording','calibration','press-tilt-calibration','graph'].map(name=>[`/dist/${name}.js`,new URL(`../../dist/${name}.js`,import.meta.url)])
]);
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(await api(req,res,path))return;
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 const file=files.get(path);if(!file){res.writeHead(404);res.end('Not found');return;}
 try{const body=await readFile(file);res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);}catch{res.writeHead(503);res.end('Run pnpm build first.');}
});
server.listen(Number(process.env.PORT||47826),'127.0.0.1',()=>console.log('Puck gesture lab: http://127.0.0.1:'+server.address().port));
