import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url), out = new URL('../site/', import.meta.url);
const { version: packageVersion } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
await mkdir(new URL('lab/', out), { recursive: true });
await mkdir(new URL('dist/', out), { recursive: true });
// Explicit asset lists keep server code, recordings and local files out of publication.
for (const file of ['index.html', 'style.css', 'app.js', 'model.js', 'movement.js']) {
  let text = await readFile(new URL('examples/playground/' + file, root), 'utf8');
  text = text.replaceAll('../../dist/', './dist/').replaceAll('../camera.mjs', './camera.mjs');
  if (file === 'index.html') text = text.replace('Puck · library defaults', `SDK ${packageVersion}`);
  await writeFile(new URL(file, out), text);
}
await copyFile(new URL('examples/camera.mjs', root), new URL('camera.mjs', out));
for (const file of ['index.html', 'style.css', 'app.js', 'settings.js', 'recorder.js', 'calibration-panel.js', 'storage.js']) {
  let text = await readFile(new URL('examples/gestures/' + file, root), 'utf8');
  text = text.replaceAll('../../dist/', '../dist/').replaceAll('../playground/model.js', '../model.js');
  if (file === 'settings.js') text = text.replace("Object.freeze({pressMode:'auto',standaloneTilt:true})", "Object.freeze({pressMode:'simple',standaloneTilt:false})");
  if (file === 'index.html') text = text.replace('<head>', '<head><meta name="puck-storage" content="browser">').replace('href="#"', 'href="../"').replace('Saves six-axis input, timing, settings, and recognized gestures to this VM.', 'Saves six-axis input, timing, settings, and recognized gestures in this browser. No input is uploaded.').replace('Simulator recordings are labeled separately.', 'Simulator recordings are labeled separately. <a href="?source=simulator">Enable simulator recording</a>.');
  await writeFile(new URL('lab/' + file, out), text);
}
for (const file of await readdir(new URL('dist/', root))) if (file.endsWith('.js')) await copyFile(new URL('dist/' + file, root), new URL('dist/' + file, out));
await writeFile(new URL('.nojekyll', out), '');
// Version all module and stylesheet requests together so a deployed page cannot
// combine new HTML with old JavaScript from the Pages/browser cache.
const publicFiles = [];
for (const folder of ['', 'lab/', 'dist/']) for (const file of await readdir(new URL(folder, out))) if (/\.(?:html|css|m?js)$/.test(file)) publicFiles.push(folder + file);
const contents = new Map(await Promise.all(publicFiles.sort().map(async file => [file, await readFile(new URL(file, out), 'utf8')])));
const version = createHash('sha256').update([...contents.values()].join('\n')).digest('hex').slice(0, 12);
for (const [file, original] of contents) {
  let content = original;
  if (/\.m?js$/.test(file)) content = content.replace(/((?:from\s+|import\s*)['"])(\.{1,2}\/[^'"]+)(['"])/g, `$1$2?v=${version}$3`);
  if (file.endsWith('.html')) content = content.replace(/((?:src|href)="\.\/[^"?]+\.(?:js|css))"/g, `$1?v=${version}"`);
  await writeFile(new URL(file, out), content);
}
console.log('Static Puck playground built in site/');
