import { createGestures, createPanZoom, gesturePresets, neutralInput } from '../../dist/index.js';
import { connectWebHid } from '../../dist/webhid.js';
import { applyMotion } from '../camera.mjs';
import { axes, gestures, labels, key, title, createCounts, deflection, sequence } from './model.js';
const $ = id => document.getElementById(id);
let options, recognizer, connection = null, input = { ...neutralInput }, frozen = false;
let samples = [], events = [], lastDraw = 0, camera = { x: 400, y: 150, zoom: 1 }, run = null, held = null;
const motion = createPanZoom(), totals = createCounts(), tiles = new Map();
const panControls = document.createElement('div'); panControls.className = 'manual';
for (const [direction, label] of [['x+', 'Pan left'], ['x-', 'Pan right'], ['y+', 'Pan up'], ['y-', 'Pan down']]) {
  const b = document.createElement('button'); b.textContent = label; b.dataset.pan = direction;
  b.onclick = () => { if (connection || run || held) return; cancel(); run = { start: performance.now(), index: 0, end: performance.now() + 800, rows: [{ t: 0, input: neutralInput }, { t: 60, input: deflection(direction) }, { t: 560, input: neutralInput }] }; };
  panControls.append(b);
}
$('viewport').before(panControls);
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
  let detected = 0;
  for (const [id, tile] of tiles) {
    const n = totals.counts[id]; if (n) detected++;
    tile.classList.toggle('detected', n > 0); tile.querySelector('.number').textContent = n;
    tile.querySelector('.state').textContent = n ? 'Detected' : 'Not detected';
    tile.setAttribute('aria-label', `${title(gestures.find(g => key(g) === id))}, ${n} detections${connection ? '' : '. Simulate'}`);
  }
  $('coverage').textContent = `${detected} / ${gestures.length}`;
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
}
function apply() { options = { ...gesturePresets[$('preset').value].toOptions(), pressMode: 'auto', standaloneTilt: true }; recognizer = createGestures(options); cancel(); $('thresholds').textContent = JSON.stringify(options, null, 2); }
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
$('force').oninput = () => $('forceValue').textContent = Number($('force').value).toFixed(2);
$('reset').onclick = () => { cancel(); totals.reset(); events = []; samples = []; frozen = false; $('freeze').textContent = 'Freeze graphs'; repaintCounts(); $('last').textContent = 'Ready when you are'; $('history').innerHTML = '<li>No events yet.</li>'; $('testStatus').textContent = 'All counters and traces reset. Release the cap to neutral to begin.'; };
$('countSource').onchange = () => { $('reset').click(); $('testStatus').textContent = `Fresh test: counting ${$('countSource').value === 'device' ? 'device input only' : 'simulator input only'}.`; };
$('freeze').onclick = () => { frozen = !frozen; $('freeze').textContent = frozen ? 'Resume graphs' : 'Freeze graphs'; };
$('resetCamera').onclick = () => { camera = { x: 400, y: 150, zoom: 1 }; motion.reset(); motion.setInput(input); };
$('zoomInput').onchange = () => motion.setZoomInput($('zoomInput').value);
$('download').onclick = () => {
  const blob = new Blob([JSON.stringify({ version: 1, source: $('countSource').value, counts: totals.counts, options, recentEvents: events, note: 'Counts persist for this page session; recentEvents is limited to the latest 200 events.' }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'puck-test-results.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function connectedUI() { $('connect').textContent = connection ? 'Disconnect' : 'Connect SpaceMouse'; $('source').textContent = connection ? 'Live device' : 'Simulator'; document.querySelectorAll('.gesture,#manual button,#force,[data-pan]').forEach(el => el.disabled = Boolean(connection)); }
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
  $('motionGraph').innerHTML = `<svg viewBox="0 0 800 115" role="img" aria-label="Pan X and Y pixels per frame and logarithmic zoom per frame"><text x="0" y="14" fill="#54647a" font-size="12">Motion output / frame · X blue, Y brown (±66 px) · log zoom green (±0.075)</text><path d="M0 65H800" stroke="#c5cfdb"/>${['panX', 'panY', 'logZoom'].map((axis, i) => `<path d="${path(samples, s => s.delta[axis] / (i === 2 ? .075 : 66), t, 40, 65, 800)}" fill="none" stroke="${colors[i]}" stroke-width="2"/>`).join('')}</svg>`;
}
function frame() {
  const t = performance.now();
  // Use actual dispatch time; stalled/background frames must not manufacture successful gestures.
  if (run) {
    if (t - run.start > 1500) cancel();
    else if (run.index < run.rows.length && t >= run.start + run.rows[run.index].t) { feed(run.rows[run.index++].input, t); }
    if (run && t >= run.end && run.index === run.rows.length) { run = null; document.querySelectorAll('.running').forEach(el => el.classList.remove('running')); }
  }
  receive(recognizer.advance(t)); const delta = motion.step(t); camera = applyMotion(camera, delta, { x: 400, y: 150 });
  $('world').setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`);
  $('camera').textContent = `Zoom ${camera.zoom.toFixed(2)}× · offset ${camera.x.toFixed(0)}, ${camera.y.toFixed(0)} px`;
  samples.push({ t, input: { ...input }, delta: { ...delta, logZoom: Math.log(delta.zoomFactor) } }); while (samples.length && samples[0].t < t - 8000) samples.shift();
  if (!frozen && t - lastDraw > 80) { draw(t); lastDraw = t; }
  const state = recognizer.state; $('phase').textContent = `${state.pending ? 'Waiting for double' : state.phase === 'blocked' ? 'Release to arm' : state.phase}${connection ? ' · ' + reports + ' reports' : ''}`;
  requestAnimationFrame(frame);
}
apply(); repaintCounts(); connectedUI(); requestAnimationFrame(frame);
