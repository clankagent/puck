import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPanZoom, decodeCombinedReport, neutralInput } from '../dist/index.js';
import { applyMotion } from '../examples/camera.mjs';

function report(values, prefix = 0) {
  const buffer = new ArrayBuffer(prefix + 12 + 3);
  const data = new DataView(buffer, prefix, 12);
  values.forEach((value, i) => data.setInt16(i * 2, value, true));
  return data;
}
const input = values => decodeCombinedReport(1, report(values));

test('combined report respects DataView bounds, signs and range; status does not become motion', () => {
  assert.deepEqual(decodeCombinedReport(1, report([-350, 175, 350, -175, 0, 35], 5)), {
    x: -1, y: .5, z: 1, rx: -.5, ry: 0, rz: .1,
  });
  assert.equal(decodeCombinedReport(23, report([76, 0, 0, 0, 0, 0])), null);
  assert.equal(decodeCombinedReport(1, new DataView(new ArrayBuffer(6))), null);
  assert.deepEqual(decodeCombinedReport(1, report([0, 0, 0, 0, 0, 0])), neutralInput);
});

test('held movement agrees with the analytic integral at 60, 144 and 240 Hz', () => {
  const unit = (75 / 350 - .05) / .95;
  const expected = unit * (1000 - 25 * (1 - Math.exp(-40))) / 1000 * 1320;
  for (const hz of [60, 144, 240]) {
    const motion = createPanZoom();
    motion.setInput(input([-75, 0, 0, 0, 0, 0]));
    let distance = 0;
    for (let i = 0; i <= hz; i++) distance += motion.step(i * 1000 / hz).panX;
    assert.ok(Math.abs(distance - expected) < 1e-9);
  }
});

test('report frequency does not change displacement for a held cap', () => {
  function run(repeatReports) {
    const motion = createPanZoom();
    const held = input([-75, 0, 0, 0, 0, 0]);
    motion.setInput(held);
    let distance = 0;
    for (let t = 0; t <= 500; t += 5) {
      if (repeatReports) { motion.setInput(held); motion.setInput(held); }
      distance += motion.step(t).panX;
    }
    return distance;
  }
  assert.equal(run(true), run(false));
  assert.ok(run(false) > 0); // No reports for 500 ms is still a held cap.
});

test('neutral stops both channels immediately; reversal moves in the new direction', () => {
  const motion = createPanZoom();
  motion.setInput(input([-75, 0, 0, 0, 0, 75]));
  motion.step(0);
  assert.ok(motion.step(10).moving);
  motion.setInput(neutralInput);
  assert.deepEqual(motion.step(20), { panX: 0, panY: 0, zoomFactor: 1, moving: false });
  motion.setInput(input([75, 0, 0, 0, 0, -75]));
  assert.ok(motion.step(30).panX < 0);
});

test('press zooms in, lift zooms out, inactive zoom axis is ignored', () => {
  const motion = createPanZoom({ zoomInput: 'press' });
  motion.setInput(input([0, 0, 75, 0, 0, -350]));
  motion.step(0);
  assert.ok(motion.step(10).zoomFactor > 1);
  motion.setInput(input([0, 0, -75, 0, 0, 350]));
  assert.ok(motion.step(20).zoomFactor < 1);
  motion.setZoomInput('twist');
  motion.setInput(input([0, 0, -350, 0, 0, 0]));
  assert.equal(motion.step(30).zoomFactor, 1);
  motion.setInput(input([0, 0, 0, 0, 0, 75]));
  assert.ok(motion.step(40).zoomFactor > 1);
});

test('switching zoom source preserves pan response and does not carry zoom response', () => {
  const switched = createPanZoom();
  const reference = createPanZoom();
  for (const motion of [switched, reference]) {
    motion.setInput(input([-75, 0, 0, 0, 0, 75]));
    motion.step(0); motion.step(10);
  }
  switched.setZoomInput('press');
  const result = switched.step(20);
  assert.equal(result.panX, reference.step(20).panX);
  assert.equal(result.zoomFactor, 1);
});

test('reset forgets input and elapsed time; duplicate timestamps do not double-count', () => {
  const motion = createPanZoom({ responseMs: 0 });
  motion.setInput(input([-350, 0, 0, 0, 0, 0]));
  motion.step(10);
  assert.ok(Math.abs(motion.step(20).panX - 13.2) < 1e-10);
  assert.equal(motion.step(15).panX, 0);
  assert.equal(motion.step(20).panX, 0);
  assert.ok(Math.abs(motion.step(30).panX - 13.2) < 1e-10);
  assert.equal(motion.step(1000).panX, 66); // 50 ms render-stall cap.
  motion.reset();
  assert.equal(motion.step(2000).moving, false);
});

test('input snapshots are copied; callers cannot mutate a held sample accidentally', () => {
  const motion = createPanZoom();
  const sample = input([-75, 0, 0, 0, 0, 0]);
  motion.setInput(sample);
  sample.x = 1;
  motion.step(0);
  assert.ok(motion.step(10).panX > 0);
});

test('render-owned camera preserves the anchor and uses clamped actual zoom', () => {
  const before = { x: 100, y: -50, zoom: 2 };
  const anchor = { x: 300, y: 200 };
  const next = applyMotion(before, { panX: 10, panY: -20, zoomFactor: 10 }, anchor);
  assert.equal(next.zoom, 5);
  assert.equal((anchor.x - (next.x - 10)) / next.zoom, (anchor.x - before.x) / before.zoom);
  assert.equal((anchor.y - (next.y + 20)) / next.zoom, (anchor.y - before.y) / before.zoom);
});
