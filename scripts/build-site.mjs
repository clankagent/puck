import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url), out = new URL('../site/', import.meta.url);
await mkdir(new URL('lab/', out), { recursive: true });
await mkdir(new URL('dist/', out), { recursive: true });
// Explicit asset lists keep server code, recordings and local files out of publication.
for (const file of ['index.html', 'style.css', 'app.js', 'model.js']) {
  let text = await readFile(new URL('examples/playground/' + file, root), 'utf8');
  text = text.replaceAll('../../dist/', './dist/').replaceAll('../camera.mjs', './camera.mjs');
  await writeFile(new URL(file, out), text);
}
await copyFile(new URL('examples/camera.mjs', root), new URL('camera.mjs', out));
for (const file of ['index.html', 'style.css', 'app.js', 'settings.js', 'recorder.js', 'calibration-panel.js', 'storage.js']) {
  let text = await readFile(new URL('examples/gestures/' + file, root), 'utf8');
  text = text.replaceAll('../../dist/', '../dist/').replaceAll('../playground/model.js', '../model.js');
  if (file === 'index.html') text = text.replace('<head>', '<head><meta name="puck-storage" content="browser">').replace('href="#"', 'href="../"').replace('Saves six-axis input, timing, settings, and recognized gestures to this VM.', 'Saves six-axis input, timing, settings, and recognized gestures in this browser. No input is uploaded.').replace('Simulator recordings are labeled separately.', 'Simulator recordings are labeled separately. <a href="?source=simulator">Enable simulator recording</a>.');
  await writeFile(new URL('lab/' + file, out), text);
}
for (const file of await readdir(new URL('dist/', root))) if (file.endsWith('.js')) await copyFile(new URL('dist/' + file, root), new URL('dist/' + file, out));
await writeFile(new URL('.nojekyll', out), '');
console.log('Static Puck playground built in site/');
