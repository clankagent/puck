import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectGestureSession } from '../examples/gesture-session.mjs';

test('documented session records lifecycle resets, cancels pending actions and cleans up frames', async () => {
  const names = ['navigator', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const saved = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  let now = 0;
  let frame;
  let scheduled = false;
  const device = new EventTarget();
  Object.assign(device, { vendorId: 0x256f, productId: 0xc63a, opened: false,
    async open() { this.opened = true; }, async close() { this.opened = false; } });
  const hid = new EventTarget();
  hid.requestDevice = async () => [device];
  const values = [{ hid }, { now: () => now }, callback => { frame = callback; scheduled = true; return 1; }, () => { scheduled = false; }];
  names.forEach((name, i) => Object.defineProperty(globalThis, name, { value: values[i], configurable: true }));
  function report(z, rz = 0) {
    const event = new Event('inputreport');
    event.reportId = 1;
    event.data = new DataView(new ArrayBuffer(12));
    event.data.setInt16(4, z, true);
    event.data.setInt16(10, rz, true);
    device.dispatchEvent(event);
  }
  try {
    const events = [];
    const session = await connectGestureSession({ onEvents: batch => events.push(...batch) });
    session.startRecording();
    assert.throws(() => session.startRecording(), /Stop/);
    report(0);
    now = 40; report(120);
    now = 140; report(0);
    now = 180; frame(); // pending exclusive single
    now = 200; session.pause(); // must cancel, not finish a pulse
    now = 1000; frame();
    assert.deepEqual(events, []);
    const capture = session.stopRecording();
    assert.equal(capture.timeline.filter(row => row.type === 'reset').length, 1);
    assert.equal(capture.timeline.filter(row => row.type === 'input').length, 3);
    assert.equal(session.stopRecording(), null);
    session.resume(); now = 1010; report(0);
    now = 1020; report(250, 250); now = 1300; frame();
    assert.equal(events.at(-1).kind, 'holdstart');
    now = 1310; session.pause();
    assert.equal(events.at(-1).kind, 'holdcancel');
    session.resume(); now = 1320; report(0); now = 1330; report(250, 250);
    now = 1600; frame(); assert.equal(events.at(-1).kind, 'holdstart');
    now = 1610;
    await session.close();
    assert.equal(events.at(-1).kind, 'holdcancel');
    assert.equal(scheduled, false);
    assert.equal(device.opened, false);
    assert.throws(() => session.startRecording(), /ended/);
  } finally {
    names.forEach((name, i) => saved[i] ? Object.defineProperty(globalThis, name, saved[i]) : delete globalThis[name]);
  }
});
