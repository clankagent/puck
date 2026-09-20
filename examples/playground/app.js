import { createGestures, gesturePresets, neutralInput } from '../../dist/index.js';
import { movementDefaults, movementFields, createMovement, initialPose, advancePose, projectCube, panZoomOverrides } from './movement.js';
import { connectWebHid } from '../../dist/webhid.js';
import { applyMotion } from '../camera.mjs';
import { axes, gestures, labels, key, title, createCounts, deflection, sequence, enabledGesture } from './model.js';
const $ = id => document.getElementById(id);
let options, recognizer, connection = null, input = { ...neutralInput }, frozen = false;
let samples = [], events = [], lastDraw = 0, camera = { x: 400, y: 150, zoom: 1 }, run = null, held = null;
let motionOptions = { ...movementDefaults }, motion = createMovement(motionOptions), pose = initialPose();
const totals = createCounts(), tiles = new Map();
const gestureModes = document.createElement('div'); gestureModes.className = 'toolbar gesture-modes';
gestureModes.innerHTML = '<label>Push / pull mode<select id="pressMode"><option value="auto">Press or tilt · library default</option><option value="simple">Simple · combined tilts disabled</option><option value="tilt">Tilt + plain doubles</option></select></label><label><input type="checkbox" id="standaloneTilt" checked> Standalone tilt · enabled by default</label><button id="resetGestureDefaults">Restore gesture defaults</button><p id="gestureDefaults" class="hint">Library defaults: all 24 gesture types enabled.</p>';
$('tester').querySelector('.toolbar').after(gestureModes);
// Movement is the first-class entry point; gesture counting remains independent below.
$('tester').before($('motion'));
$('motion').querySelector('.overline').textContent = '01 / Continuous movement';
$('tester').querySelector('.overline').textContent = '02 / Gesture tester';
$('signals').querySelector('.overline').textContent = '03 / Signal monitor';
$('motion').querySelector('h2').textContent = 'Find your movement speed.';
$('motion').querySelector('h2').outerHTML = '<h1>Find your movement speed.</h1>';
$('tester').querySelector('h1').outerHTML = '<h2>Test every gesture.</h2>';
$('motion').querySelector('.hint').textContent = 'Slide, push, pull, tilt and twist. Adjust speed and response while moving. Use 2D pan / zoom or the six-axis 3D movement view.';
$('motion').querySelector('.section-title').after($('connection'));
const nav = document.querySelector('nav');
const movementLink = nav.querySelector('[href="#motion"]'); movementLink.textContent = '01   Continuous movement';
nav.querySelector('[href="#tester"]').before(movementLink);
nav.querySelector('[href="#tester"]').textContent = '02   Gesture tester';
nav.querySelector('[href="#signals"]').textContent = '03   Signal monitor';
const settings = document.createElement('div'); settings.className = 'movement-settings';
settings.innerHTML = '<label>View<select id="movementView"><option value="planar">2D pan / zoom</option><option value="spatial">3D · all six axes</option></select></label><p class="hint">2D: slide to pan, twist or press to zoom. 3D: slide, push/pull and tilt/twist to move and rotate the object.</p><div id="movementFields"></div><div class="manual"><button id="resetMovement">Restore movement defaults</button><button id="copyMovement">Copy SDK setup</button></div><p id="movementStatus" role="status">Using createPanZoom() defaults. Changes apply immediately; gesture force profiles do not affect movement.</p>';
const workspace = document.createElement('div'); workspace.className = 'movement-workspace';
const visual = document.createElement('div'); visual.className = 'movement-visual';
$('viewport').before(workspace); workspace.append(settings, visual);
visual.append($('zoomInput').closest('label'), $('viewport'), $('camera'), $('motionGraph'));
// Keep the grid covering the viewport during arbitrarily long pans.
const gridSurface = $('world').querySelector('rect');
for (const [attr, value] of Object.entries({ x: 0, y: 0, width: 800, height: 300 })) gridSurface.setAttribute(attr, value);
$('world').before(gridSurface);
const spatialSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); spatialSvg.id = 'spatialViewport'; spatialSvg.setAttribute('viewBox', '0 0 800 300'); spatialSvg.setAttribute('role', 'img'); spatialSvg.setAttribute('aria-label', 'Six-axis object translation and rotation'); spatialSvg.hidden = true;
spatialSvg.innerHTML = '<path d="M100 150H700 M400 20V280" stroke="#c6d0dc" stroke-dasharray="4 5"/><text x="16" y="25" font-size="14" fill="#54647a">Isometric view · x / y / z translation + rx / ry / rz rotation</text><g id="cube"></g>';
$('viewport').after(spatialSvg);
for (const [id, label, min, max, step, unit, hint] of movementFields) {
  const field = document.createElement('div'); field.className = 'movement-field';
  field.dataset.mode = id.startsWith('rotation') || id === 'translationSpeed' ? 'spatial' : ['panSpeed', 'zoomSpeed', 'zoomDeadzone'].includes(id) ? 'planar' : 'both';
  field.innerHTML = `<label for="motion-${id}">${label} <span>${unit}</span></label><div class="movement-value"><input type="range" id="motion-${id}" min="${min}" max="${max}" step="${step}" value="${motionOptions[id]}"><input type="number" id="number-${id}" aria-label="${label} value" min="${min}" max="${max}" step="${step}" value="${motionOptions[id]}"></div><p class="hint">${hint}</p>`;
  $('movementFields').append(field);
  const change = e => {
    const value = e.target.valueAsNumber;
    if (!Number.isFinite(value) || value < min || value > max) { e.target.setAttribute('aria-invalid', 'true'); $('movementStatus').textContent = `${label} must be between ${min} and ${max}. Previous setting remains active.`; return; }
    e.target.removeAttribute('aria-invalid'); motionOptions[id] = value;
    $('motion-' + id).value = value; $('number-' + id).value = value;
    updateMovement(`${label}: ${value} ${unit}. Applied to live input.`);
  };
  $('motion-' + id).oninput = change; $('number-' + id).oninput = change;
}
function updateMovement(message) { motion = createMovement(motionOptions); motion.setInput(input); samples = []; $('movementStatus').textContent = message; }
function setView() {
  const spatial = $('movementView').value === 'spatial';
  $('viewport').style.display = spatial ? 'none' : 'block'; spatialSvg.style.display = spatial ? 'block' : 'none';
  $('zoomInput').closest('label').hidden = spatial;
  document.querySelectorAll('.movement-field').forEach(field => field.hidden = field.dataset.mode !== 'both' && field.dataset.mode !== $('movementView').value);
  document.querySelectorAll('[data-pan]').forEach(b => { b.textContent = b.dataset.pan.startsWith('zoom') ? (spatial ? (b.dataset.pan === 'zoom+' ? 'Test forward' : 'Test back') : (b.dataset.pan === 'zoom+' ? 'Test zoom in' : 'Test zoom out')) : b.dataset.label; b.hidden = !spatial && ['rx+', 'ry+', 'rz+'].includes(b.dataset.pan); });
}
$('movementView').onchange = setView;
$('resetMovement').onclick = () => { motionOptions = { ...movementDefaults }; for (const [id] of movementFields) { $('motion-' + id).value = motionOptions[id]; $('number-' + id).value = motionOptions[id]; $('number-' + id).removeAttribute('aria-invalid'); } $('zoomInput').value = motionOptions.zoomInput; updateMovement('Movement defaults restored. View position retained.'); };
$('copyMovement').onclick = async () => { const text = `import { createPanZoom } from '@clankagent/puck';\n\nconst motion = createPanZoom(${Object.keys(panZoomOverrides(motionOptions)).length ? JSON.stringify(panZoomOverrides(motionOptions), null, 2) : ''});`; try { await navigator.clipboard.writeText(text); $('movementStatus').textContent = 'SDK pan/zoom setup copied. 3D object settings belong to the demo.'; } catch { $('movementStatus').textContent = text; } };
const panControls = document.createElement('div'); panControls.className = 'manual';
for (const [direction, label] of [['x+', 'Test left'], ['x-', 'Test right'], ['y+', 'Test up'], ['y-', 'Test down'], ['zoom+', 'Test zoom in'], ['zoom-', 'Test zoom out'], ['rx+', 'Test rx rotation'], ['ry+', 'Test ry rotation'], ['rz+', 'Test rz rotation']]) {
  const b = document.createElement('button'); b.textContent = label; b.dataset.pan = direction; b.dataset.label = label;
  b.onclick = () => { if (connection || run || held) return; cancel(); const mapped = direction.startsWith('zoom') ? ($('movementView').value === 'spatial' || motionOptions.zoomInput === 'press' ? (direction === 'zoom+' ? 'push' : 'pull') : (direction === 'zoom+' ? 'clockwise' : 'counterclockwise')) : direction; run = { start: performance.now(), index: 0, end: performance.now() + 1200, rows: [{ t: 0, input: neutralInput }, { t: 60, input: deflection(mapped, Number($('force').value)) }, { t: 1060, input: neutralInput }] }; b.classList.add('running'); };
  panControls.append(b);
}
visual.append(panControls);
const movementManual = document.createElement('details'); movementManual.innerHTML = '<summary>Hold manual input / combine axes</summary><p class="hint">These sliders hold a continuous simulated deflection. Combine axes freely; press Release all to stop. They reset on focus loss and are disabled while a device is connected.</p><div id="heldAxes"></div><button id="releaseAxes">Release all</button>';
visual.append(movementManual);
for (const axis of axes) {
  const label = document.createElement('label'); label.innerHTML = `${axis}<output id="heldValue-${axis}">0.00</output><input type="range" id="held-${axis}" aria-label="Hold ${axis} deflection" min="-1" max="1" step="0.01" value="0">`;
  $('heldAxes').append(label);
  $('held-' + axis).oninput = () => { if (connection) return; run = null; document.querySelectorAll('.running').forEach(el => el.classList.remove('running')); const value = Object.fromEntries(axes.map(a => [a, Number($('held-' + a).value)])); feed(value); $('heldValue-' + axis).textContent = value[axis].toFixed(2); };
}
$('releaseAxes').onclick = cancel;
setView();
const chapters = [...document.querySelectorAll('nav a[href^="#"]')];
const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) for (const link of chapters) { if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); } }, { rootMargin: '-5% 0px -65% 0px' });
observer.observe($('tester')); observer.observe($('signals')); observer.observe($('motion'));
const colors = ['#2355cb', '#9b4b13', '#23754e', '#814bad', '#ac3755', '#007481'];
let reports = 0;
for (const group of ['Twist & press', 'Standalone tilt', 'Press + tilt']) {
  const heading = document.createElement('h3'); heading.textContent = group;
  const grid = document.createElement('div'); grid.className = 'tile-grid';
  for (const gesture of gestures.filter(g => g.group === group)) {
    const tile = document.createElement('button'); tile.className = 'gesture'; tile.dataset.gesture = key(gesture);
    tile.innerHTML = `<span>${title(gesture)}</span><strong class="number">0</strong><span class="state">Not detected</span>`;
    tile.onclick = () => simulate(gesture); grid.append(tile); tiles.set(key(gesture), tile);
  }
  $('tiles').append(heading, grid);
}
for (const [i, axis] of axes.entries()) {
  const panel = document.createElement('div'); panel.className = 'trace';
  panel.innerHTML = `<div class="trace-head"><strong>${axis} · ${['slide X', 'slide Y', 'push / pull', 'tilt X', 'tilt Y', 'twist'][i]}</strong><output id="value-${axis}">0.00</output></div><svg viewBox="0 0 400 100" preserveAspectRatio="none" role="img" aria-label="${axis} input over the last eight seconds"><path d="M0 10H400 M0 50H400 M0 90H400" fill="none" stroke="#c5cfdb" stroke-dasharray="3 4"/><path id="trace-${axis}" fill="none" stroke="${colors[i]}" stroke-width="2"/></svg><small>+1 &nbsp; / &nbsp; 0 &nbsp; / &nbsp; −1</small>`;
  $('axisGraphs').append(panel);
}
function repaintCounts() {
  let detected = 0, enabled = 0;
  for (const [id, tile] of tiles) {
    const gesture = gestures.find(g => key(g) === id), available = enabledGesture(gesture, options);
    const n = totals.counts[id]; if (available) { enabled++; if (n) detected++; }
    tile.classList.toggle('detected', n > 0); tile.querySelector('.number').textContent = n;
    tile.disabled = Boolean(connection) || !available;
    tile.classList.toggle('mode-disabled', !available);
    tile.querySelector('.state').textContent = available ? (n ? 'Detected' : 'Not detected') : 'Off in selected mode';
    tile.setAttribute('aria-label', `${title(gesture)}, ${n} detections${!available ? '. Off in selected mode' : connection ? '' : '. Simulate'}`);
  }
  $('coverage').textContent = `${detected} / ${enabled}`;
}
function receive(batch) {
  if (!batch.length) return;
  const source = connection ? 'device' : 'simulator';
  if ($('countSource').value === source) totals.add(batch);
  for (const e of batch) {
    events.push({ ...e, source }); $('last').textContent = title(e);
    $('testStatus').textContent = `${title(e)} · ${Math.round(e.durationMs)} ms · ${source}${$('countSource').value !== source ? ' · excluded from counts' : ''}`;
  }
  events = events.slice(-200); repaintCounts();
  $('history').replaceChildren(...events.slice(-40).reverse().map(e => { const li = document.createElement('li'); li.textContent = `${(e.timestamp / 1000).toFixed(2)}s · ${title(e)} · ${Math.round(e.durationMs)} ms · ${e.source}`; return li; }));
}
function feed(value, t = performance.now()) { input = { ...value }; motion.setInput(input); receive(recognizer.update(input, t)); }
function cancel() {
  run = null; held = null; input = { ...neutralInput }; recognizer.reset(); motion.reset();
  if (!connection) feed(neutralInput);
  document.querySelectorAll('.running,.held').forEach(el => el.classList.remove('running', 'held'));
  for (const axis of axes) { $('held-' + axis).value = 0; $('heldValue-' + axis).textContent = '0.00'; }
}
function apply() {
  const defaults = $('preset').value === 'default' && $('pressMode').value === 'auto' && $('standaloneTilt').checked;
  options = { ...gesturePresets[$('preset').value].toOptions(), pressMode: $('pressMode').value, standaloneTilt: $('standaloneTilt').checked };
  recognizer = defaults ? createGestures() : createGestures(options);
  cancel(); repaintCounts(); $('thresholds').textContent = JSON.stringify(options, null, 2);
  $('gestureDefaults').textContent = defaults ? 'Using createGestures() with no overrides. All 24 gesture types enabled.' : 'Custom gesture configuration. Counts include only enabled types. Restore gesture defaults to match createGestures().';
}
function simulate(gesture) {
  if (connection || run || held) return;
  cancel(); const t = performance.now();
  run = { rows: sequence(gesture, Number($('force').value)), start: t, index: 0, end: t + 1100 };
  tiles.get(key(gesture)).classList.add('running'); $('testStatus').textContent = `Simulating ${title(gesture)} at ${$('force').value} force…`;
}
function start(direction, modifier) {
  if (connection || run || held) return;
  held = direction; const value = deflection(direction, Number($('force').value));
  if (modifier && direction.startsWith('r')) value.z = (modifier === 'pull' ? -1 : 1) * Number($('force').value);
  feed(value); document.querySelector(`[data-direction="${direction}"]`)?.classList.add('held');
}
function stop() { if (!held) return; held = null; feed(neutralInput); document.querySelectorAll('.held').forEach(el => el.classList.remove('held')); }
for (const direction of [...Object.keys(labels), 'x+', 'x-', 'y+', 'y-']) {
  const b = document.createElement('button'); b.dataset.direction = direction; b.textContent = labels[direction] ?? `Pan ${direction}`;
  b.onpointerdown = e => { e.preventDefault(); b.focus(); b.setPointerCapture(e.pointerId); start(direction, e.altKey ? 'pull' : e.shiftKey ? 'push' : null); };
  b.onpointerup = stop; b.onpointercancel = stop; b.onlostpointercapture = () => { if (held === direction) stop(); };
  b.onkeydown = e => { if ([' ', 'Enter'].includes(e.key) && !e.repeat) { e.preventDefault(); start(direction); } };
  b.onkeyup = e => { if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); stop(); } }; b.onblur = stop; $('manual').append(b);
}
const keys = { ArrowLeft: 'counterclockwise', ArrowRight: 'clockwise', ArrowDown: 'push', ArrowUp: 'pull', w: 'rx+', s: 'rx-', a: 'ry-', d: 'ry+', i: 'y+', k: 'y-', j: 'x+', l: 'x-' };
window.addEventListener('keydown', e => { if (e.target.closest('input,select,textarea,button,a,summary') || e.ctrlKey || e.metaKey || connection) return; const d = keys[e.key] ?? keys[e.key.toLowerCase()]; if (d) { e.preventDefault(); if (!e.repeat) start(d, e.altKey ? 'pull' : e.shiftKey ? 'push' : null); } });
window.addEventListener('keyup', e => { if ((keys[e.key] ?? keys[e.key.toLowerCase()]) === held) stop(); });
window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
$('preset').onchange = () => { apply(); $('testStatus').textContent = 'Profile changed; counts retained. Reset for a fresh comparison.'; };
$('pressMode').onchange = apply; $('standaloneTilt').onchange = apply;
$('resetGestureDefaults').onclick = () => { $('preset').value = 'default'; $('pressMode').value = 'auto'; $('standaloneTilt').checked = true; apply(); };
$('force').oninput = () => $('forceValue').textContent = Number($('force').value).toFixed(2);
$('reset').onclick = () => { cancel(); totals.reset(); events = []; samples = []; frozen = false; $('freeze').textContent = 'Freeze graphs'; repaintCounts(); $('last').textContent = 'Ready when you are'; $('history').innerHTML = '<li>No events yet.</li>'; $('testStatus').textContent = 'All counters and traces reset. Release the cap to neutral to begin.'; };
$('countSource').onchange = () => { $('reset').click(); $('testStatus').textContent = `Fresh test: counting ${$('countSource').value === 'device' ? 'device input only' : 'simulator input only'}.`; };
$('freeze').onclick = () => { frozen = !frozen; $('freeze').textContent = frozen ? 'Resume graphs' : 'Freeze graphs'; };
$('resetCamera').onclick = () => { camera = { x: 400, y: 150, zoom: 1 }; pose = initialPose(); motion.reset(); motion.setInput(input); };
$('zoomInput').onchange = () => { motionOptions.zoomInput = $('zoomInput').value; updateMovement('Zoom input changed. Applied to live input.'); };
$('download').onclick = () => {
  const blob = new Blob([JSON.stringify({ version: 1, source: $('countSource').value, counts: totals.counts, options, recentEvents: events, note: 'Counts persist for this page session; recentEvents is limited to the latest 200 events.' }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'puck-test-results.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function connectedUI() { $('connect').textContent = connection ? 'Disconnect' : 'Connect SpaceMouse'; $('source').textContent = connection ? 'Live device' : 'Simulator'; document.querySelectorAll('#manual button,#force,[data-pan],#heldAxes input').forEach(el => el.disabled = Boolean(connection)); repaintCounts(); }
$('connect').onclick = async () => {
  $('connect').disabled = true; cancel();
  try {
    if (connection) { const device = connection; connection = null; await device.close(); $('connection').textContent = 'Disconnected. Select Simulator to count simulated gestures.'; }
    else { reports = 0; connection = await connectWebHid({ onInput(value) { if (value === neutralInput) cancel(); else { reports++; feed(value); } }, onReset: cancel, onDisconnect() { connection = null; cancel(); connectedUI(); $('connection').textContent = 'Device disconnected. Device counts retained.'; } });
      if (connection) { $('countSource').value = 'device'; $('reset').click(); $('connection').textContent = 'Connected. Release the cap to neutral, then try each gesture. Counting device input only.'; }
      else $('connection').textContent = 'No device selected. Simulator is ready.';
    }
  } catch (error) { $('connection').textContent = `${error.message} You can still use the simulator.`; }
  finally { $('connect').disabled = false; connectedUI(); }
};
function path(points, getter, t, scale = 40, center = 50, width = 400) { return points.map((s, i) => `${i ? 'L' : 'M'}${((s.t - t + 8000) / 8000 * width).toFixed(1)},${(center - getter(s) * scale).toFixed(1)}`).join(' '); }
function draw(t) {
  for (const axis of axes) { $('trace-' + axis).setAttribute('d', path(samples, s => s.input[axis], t)); $('value-' + axis).textContent = input[axis].toFixed(2); }
  const recent = events.filter(e => e.timestamp >= t - 8000);
  $('eventGraph').innerHTML = `<svg viewBox="0 0 800 85" role="img" aria-label="Recognized single, double and combined event timeline"><text x="0" y="14" fill="#54647a" font-size="12">Recognition · last 8 seconds</text>${['single', 'double', 'combined'].map((name, i) => `<text x="0" y="${34 + i * 20}" fill="#54647a" font-size="11">${name}</text><path d="M85 ${30 + i * 20}H800" stroke="#d4dde7"/>`).join('')}${recent.map(e => `<circle cx="${85 + (e.timestamp - t + 8000) / 8000 * 715}" cy="${e.tilt ? 70 : e.kind === 'double' ? 50 : 30}" r="4" fill="${e.source === 'device' ? '#23754e' : '#2355cb'}"><title>${title(e)}</title></circle>`).join('')}</svg>`;
  const spatial = $('movementView').value === 'spatial', cap = motionOptions.maxFrameMs / 1000;
  const channels = spatial ? axes.map((axis, i) => ({ name: axis, get: s => s.delta[i < 3 ? 'translation' : 'rotation'][i % 3], limit: (i < 3 ? motionOptions.translationSpeed : motionOptions.rotationSpeed) * cap })) : ['panX', 'panY', 'logZoom'].map((axis, i) => ({ name: axis, get: s => s.delta[axis], limit: (i === 2 ? motionOptions.zoomSpeed : motionOptions.panSpeed) * cap }));
  $('motionGraph').innerHTML = `<p class="hint">Processed movement / frame · ${channels.map(c => `${c.name} ±${c.limit.toFixed(2)}`).join(' · ')}. Scales follow your speed and frame cap.</p><svg viewBox="0 0 800 100" role="img" aria-label="Processed continuous movement output"><path d="M0 50H800" stroke="#c5cfdb"/>${channels.map((c, i) => `<path d="${path(samples, s => c.get(s) / (c.limit || 1), t, 40, 50, 800)}" fill="none" stroke="${colors[i]}" stroke-width="2"><title>${c.name}</title></path>`).join('')}</svg>`;
}
function frame() {
  const t = performance.now();
  $('source').textContent = connection ? (document.hidden || !document.hasFocus() ? 'Device paused · focus this page' : `Live device · ${reports} reports`) : 'Simulator';
  // Use actual dispatch time; stalled/background frames must not manufacture successful gestures.
  if (run) {
    if (t - run.start > 1500) cancel();
    else if (run.index < run.rows.length && t >= run.start + run.rows[run.index].t) { feed(run.rows[run.index++].input, t); }
    if (run && t >= run.end && run.index === run.rows.length) { run = null; document.querySelectorAll('.running').forEach(el => el.classList.remove('running')); }
  }
  receive(recognizer.advance(t)); const delta = motion.step(t);
  if ($('movementView').value === 'spatial') advancePose(pose, delta);
  else { const scale = 800 / ($('viewport').clientWidth || 800); camera = applyMotion(camera, { ...delta, panX: delta.panX * scale, panY: delta.panY * scale }, { x: 400, y: 150 }); }
  const vertices = projectCube(pose), faces = [[0,1,3,2],[4,5,7,6],[0,1,5,4],[2,3,7,6],[0,2,6,4],[1,3,7,5]];
  $('cube').innerHTML = faces.map((face, i) => `<polygon points="${face.map(v => vertices[v].join(',')).join(' ')}" fill="${['#2355cb22','#23754e22','#9b4b1322'][i % 3]}" stroke="${colors[i]}" stroke-width="2"/>`).join('') + `<text x="${vertices[7][0] + 8}" y="${vertices[7][1]}" font-size="14" fill="#35465f">+x +y +z</text>`;
  $('world').setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`);
  $('grid').setAttribute('patternTransform', `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`);
  $('camera').textContent = $('movementView').value === 'spatial' ? `Position x/y/z: ${pose.position.map(v => v.toFixed(1)).join(' / ')} · Rotation rx/ry/rz: ${pose.angles.map(v => v.toFixed(1) + '°').join(' / ')}` : `Zoom ${camera.zoom.toFixed(2)}× · offset ${camera.x.toFixed(0)}, ${camera.y.toFixed(0)} view units`;
  samples.push({ t, input: { ...input }, delta: { ...delta, logZoom: Math.log(delta.zoomFactor) } }); while (samples.length && samples[0].t < t - 8000) samples.shift();
  if (!frozen && t - lastDraw > 80) { draw(t); lastDraw = t; }
  const state = recognizer.state; $('phase').textContent = `${state.pending ? 'Waiting for double' : state.phase === 'blocked' ? 'Release to arm' : state.phase}${connection ? ' · ' + reports + ' reports' : ''}`;
  requestAnimationFrame(frame);
}
apply(); repaintCounts(); connectedUI(); requestAnimationFrame(frame);
