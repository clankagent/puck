import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

test('site build ships nested runtime modules with consistent cache versions and no private data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'puck-site-test-'));
  const put = async (name, text) => {
    const path = join(root, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  };
  const build = () => {
    const result = spawnSync(process.execPath, [join(root, 'scripts/build-site.mjs')], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  const contents = name => readFile(join(root, 'site', name), 'utf8');
  try {
    await mkdir(join(root, 'scripts'), { recursive: true });
    await copyFile(new URL('../scripts/build-site.mjs', import.meta.url), join(root, 'scripts/build-site.mjs'));
    await put('package.json', JSON.stringify({ version: '2.0.0-test' }));
    for (const [folder, files] of [
      ['examples/playground/', ['index.html', 'style.css', 'app.js', 'model.js', 'movement.js', 'controls.html', 'controls.css', 'controls-app.js', 'navigation.js', 'showcase-code.js']],
      ['examples/gestures/', ['index.html', 'style.css', 'app.js', 'settings.js', 'recorder.js', 'calibration-panel.js', 'storage.js']],
    ]) for (const name of files) await put(folder + name, name.endsWith('.html') ? '<head></head>' : '');
    await put('examples/camera.mjs', '');
    await put('examples/playground/recordings/private.json', 'private capture');
    await put('dist/index.js', "export { value } from './generated/bridge.js';");
    await put('dist/input.js', 'export const input = 1;');
    await put('dist/generated/bridge.js', "import '../input.js?keep=yes&v=old#section'; export { value } from './wasm.js';");
    await put('dist/generated/wasm.js', 'export const value = 1;');
    for (const name of ['private.json', 'wasm.js.map', 'wasm.d.ts', 'puck-core.wasm']) await put('dist/generated/' + name, 'private or development-only artifact');
    build();
    assert.deepEqual((await readdir(join(root, 'site/dist/generated'))).sort(), ['bridge.js', 'wasm.js']);
    assert.ok(!(await readdir(join(root, 'site'))).includes('recordings'));
    assert.equal(await contents('dist/generated/wasm.js'), 'export const value = 1;');
    const version = (await contents('dist/index.js')).match(/\?v=([a-f0-9]{12})/)?.[1];
    assert.ok(version);
    const bridge = await contents('dist/generated/bridge.js');
    assert.ok(bridge.includes(`../input.js?keep=yes&v=${version}#section`));
    assert.ok(bridge.includes(`./wasm.js?v=${version}`));
    await put('dist/generated/wasm.js', 'export const value = 2;');
    build();
    const updatedVersion = (await contents('dist/index.js')).match(/\?v=([a-f0-9]{12})/)?.[1];
    assert.ok(updatedVersion);
    assert.notEqual(updatedVersion, version, 'nested runtime content must invalidate the shared cache version');
    assert.ok((await contents('dist/generated/bridge.js')).includes(`./wasm.js?v=${updatedVersion}`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
