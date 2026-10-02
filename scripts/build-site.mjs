import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url), out = new URL('../site/', import.meta.url);
const { version: packageVersion } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
await mkdir(new URL('lab/', out), { recursive: true });
await mkdir(new URL('dist/', out), { recursive: true });
// Explicit asset lists keep server code, recordings and local files out of publication.
for (const file of ['index.html', 'style.css', 'app.js', 'model.js', 'movement.js', 'controls.html', 'controls.css', 'controls-app.js', 'navigation.js', 'showcase-code.js']) {
  let text = await readFile(new URL('examples/playground/' + file, root), 'utf8');
  text = text.replaceAll('../../dist/', './dist/').replaceAll('../camera.mjs', './camera.mjs');
  if (file.endsWith('.html')) text = text.replace('Puck · library defaults', packageVersion.includes('-dev.') ? `Unreleased preview · SDK ${packageVersion}` : `SDK ${packageVersion}`);
  await writeFile(new URL(file, out), text);
}
await copyFile(new URL('index.html', out), new URL('legacy.html', out));
await copyFile(new URL('controls.html', out), new URL('index.html', out));
await copyFile(new URL('examples/camera.mjs', root), new URL('camera.mjs', out));
for (const file of ['index.html', 'style.css', 'app.js', 'settings.js', 'recorder.js', 'calibration-panel.js', 'storage.js']) {
  let text = await readFile(new URL('examples/gestures/' + file, root), 'utf8');
  text = text.replaceAll('../../dist/', '../dist/').replaceAll('../playground/model.js', '../model.js');
  if (file === 'index.html') text = text.replace('<head>', '<head><meta name="puck-storage" content="browser">').replace('href="#"', 'href="../"').replace('Saves six-axis input, timing, settings, and recognized gestures to this VM.', 'Saves six-axis input, timing, settings, and recognized gestures in this browser. No input is uploaded.').replace('Simulator recordings are labeled separately.', 'Simulator recordings are labeled separately. <a href="?source=simulator">Enable simulator recording</a>.');
  await writeFile(new URL('lab/' + file, out), text);
}
// TypeScript emits the embedded WASM module below dist/generated/. Publish only
// compiled JavaScript, including nested modules; declarations, maps and data stay out.
async function javascriptFiles(folder, prefix = '') {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...await javascriptFiles(new URL(entry.name + '/', folder), prefix + entry.name + '/'));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(prefix + entry.name);
  }
  return files;
}
for (const file of await javascriptFiles(new URL('dist/', root))) {
  const destination = new URL('dist/' + file, out);
  await mkdir(new URL('./', destination), { recursive: true });
  await copyFile(new URL('dist/' + file, root), destination);
}
await writeFile(new URL('.nojekyll', out), '');
// Version all module and stylesheet requests together so a deployed page cannot
// combine new HTML with old JavaScript from the Pages/browser cache.
const publicFiles = [];
for (const folder of ['', 'lab/']) for (const file of await readdir(new URL(folder, out))) if (/\.(?:html|css|m?js)$/.test(file)) publicFiles.push(folder + file);
publicFiles.push(...(await javascriptFiles(new URL('dist/', out))).map(file => 'dist/' + file));
const contents = new Map(await Promise.all(publicFiles.sort().map(async file => [file, await readFile(new URL(file, out), 'utf8')])));
const version = createHash('sha256').update([...contents.values()].join('\n')).digest('hex').slice(0, 12);
for (const [file, original] of contents) {
  let content = original;
  if (/\.m?js$/.test(file)) content = content.replace(/((?:from\s+|import\s*)['"])(\.{1,2}\/[^'"]+)(['"])/g, (_, before, specifier, after) => {
    const hashAt = specifier.indexOf('#'), fragment = hashAt < 0 ? '' : specifier.slice(hashAt);
    const pathAndQuery = hashAt < 0 ? specifier : specifier.slice(0, hashAt);
    const queryAt = pathAndQuery.indexOf('?'), path = queryAt < 0 ? pathAndQuery : pathAndQuery.slice(0, queryAt);
    const query = new URLSearchParams(queryAt < 0 ? '' : pathAndQuery.slice(queryAt + 1));
    query.set('v', version);
    return before + path + '?' + query + fragment + after;
  });
  if (file.endsWith('.html')) content = content.replace(/((?:src|href)="\.\/[^"?]+\.(?:js|css))"/g, `$1?v=${version}"`);
  await writeFile(new URL(file, out), content);
}
console.log('Static Puck playground built in site/');
