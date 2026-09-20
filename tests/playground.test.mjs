import test from 'node:test';
import assert from 'node:assert/strict';
import { createGestures, gesturePresets } from '../dist/index.js';
import { gestures, key, sequence, createCounts } from '../examples/playground/model.js';
for (const preset of Object.keys(gesturePresets)) test(`playground sequences exercise all 24 gestures with ${preset} tune`, () => {
  const counts = createCounts();
  for (const gesture of gestures) {
    const recognizer = createGestures({ ...gesturePresets[preset].toOptions(), pressMode: 'auto', standaloneTilt: true });
    const rows = sequence(gesture); const events = []; let index = 0;
    for (let t = 0; t <= 1100; t += 10) { while (index < rows.length && rows[index].t <= t) events.push(...recognizer.update(rows[index++].input, t)); events.push(...recognizer.advance(t)); }
    assert.deepEqual(events.map(key), [key(gesture)]); counts.add(events);
  }
  assert.equal(Object.keys(counts.counts).length, 24); assert.ok(Object.values(counts.counts).every(n => n === 1));
  counts.reset(); assert.ok(Object.values(counts.counts).every(n => n === 0));
});
test('tester does not invent counts for unrecognized gestures', () => { const counts = createCounts(); counts.add([{ direction: 'unknown', kind: 'single' }]); assert.ok(Object.values(counts.counts).every(n => n === 0)); });
