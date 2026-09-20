import test from 'node:test';
import assert from 'node:assert/strict';
import { neutralInput, createPanZoom, createGestures, gesturePresets } from '../dist/index.js';
import { createMovement, initialPose, advancePose, projectCube, movementDefaults, panZoomOverrides } from '../examples/playground/movement.js';
import { gestures, sequence, enabledGesture } from '../examples/playground/model.js';
test('default playground motion is identical to a consumer using createPanZoom()', () => {
  assert.deepEqual(panZoomOverrides(movementDefaults), {});
  const demo = createMovement(), consumer = createPanZoom(), displayedDefaults = createPanZoom(movementDefaults);
  const steps = [[0, {}], [10, { x: -.7, y: .4, z: .8, rz: .5 }], [60, { x: -.7, y: .4, rz: .5 }], [75, { x: .02, y: .04, rz: .08 }], [160, { x: 1, y: -1, rz: -1 }], [180, {}]];
  for (const [t, axes] of steps) {
    const input = { ...neutralInput, ...axes }; demo.setInput(input); consumer.setInput(input); displayedDefaults.setInput(input);
    const { translation, rotation, ...actual } = demo.step(t); assert.deepEqual(actual, consumer.step(t)); assert.deepEqual(actual, displayedDefaults.step(t));
  }
});
test('default gesture tile availability and events match the SDK consumer defaults', () => {
  const options = { ...gesturePresets.default.toOptions(), pressMode: 'simple', standaloneTilt: false };
  assert.equal(gestures.filter(g => enabledGesture(g, options)).length, 8);
  for (const g of gestures) {
    const implicit = createGestures(), explicit = createGestures(options);
    for (const row of sequence(g)) assert.deepEqual(implicit.update(row.input, row.t), explicit.update(row.input, row.t));
    assert.deepEqual(implicit.advance(1200), explicit.advance(1200));
  }
  assert.equal(gestures.filter(g => enabledGesture(g, { pressMode: 'auto', standaloneTilt: true })).length, 24);
});
function integrate(options, input) {
  const m = createMovement({ responseMs: 0, ...options }), pose = initialPose(); let pan = 0, zoom = 1;
  m.setInput({ ...neutralInput, ...input });
  for (let t = 0; t <= 1000; t += 10) { const d = m.step(t); advancePose(pose, d); pan += d.panX; zoom *= d.zoomFactor; }
  return { m, pose, pan, zoom };
}
test('movement controls change SDK pan/zoom rates and zero speed disables them', () => {
  const slow = integrate({ panSpeed: 100, zoomSpeed: .5 }, { x: -1, rz: 1 });
  const fast = integrate({ panSpeed: 200, zoomSpeed: 1 }, { x: -1, rz: 1 });
  assert.ok(Math.abs(fast.pan - slow.pan * 2) < 1e-8);
  assert.ok(Math.abs(fast.zoom - slow.zoom ** 2) < 1e-8);
  const zero = integrate({ panSpeed: 0, zoomSpeed: 0 }, { x: 1, rz: 1 }); assert.equal(zero.pan, 0); assert.equal(zero.zoom, 1);
});
test('all six held axes produce continuous movement and stop at neutral', () => {
  const { m, pose } = integrate({ translationSpeed: 100, rotationSpeed: 60 }, { x: -1, y: -1, z: 1, rx: 1, ry: 1, rz: 1 });
  pose.position.forEach(v => assert.ok(Math.abs(v - 100) < 1e-8)); pose.angles.forEach(v => assert.ok(Math.abs(v - 60) < 1e-8));
  m.setInput(neutralInput); const d = m.step(1010); assert.deepEqual(d.translation, [0,0,0]); assert.deepEqual(d.rotation, [0,0,0]);
  assert.ok(projectCube(pose).flat().every(Number.isFinite));
});
test('movement deadzones and zoom source apply independently of gestures', () => {
  const quiet = integrate({ panDeadzone: .3, rotationDeadzone: .3, zoomDeadzone: .3 }, { x: .2, y: .2, z: .2, rx: .2, ry: .2, rz: .2 });
  assert.deepEqual(quiet.pose.position, [0,0,0]); assert.deepEqual(quiet.pose.angles, [0,0,0]); assert.equal(quiet.zoom, 1);
  assert.ok(integrate({ zoomInput: 'press' }, { z: 1 }).zoom > 1);
  assert.equal(integrate({ zoomInput: 'press' }, { rz: 1 }).zoom, 1);
});
