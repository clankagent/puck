import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectWebHid, connectPuck } from '../dist/webhid.js';
import { neutralInput, createPuck, control } from '../dist/index.js';

test('foreground lifecycle resets input and processor, and removes listeners on close', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const page = new EventTarget();
  const document = new EventTarget();
  let focused = true;
  document.hasFocus = () => focused;
  document.hidden = false;
  page.document = document;
  Object.defineProperty(globalThis, 'window', { value: page, configurable: true });
  try {
    const device = new Device();
    const inputs = [];
    let resets = 0;
    const connection = await connectWebHid({ hid: new Hid([device]), onInput: value => inputs.push(value), onReset() { resets++; } });
    device.report(1);
    focused = false;
    page.dispatchEvent(new Event('blur'));
    assert.equal(resets, 1);
    device.report(1);
    assert.deepEqual(inputs.at(-1), neutralInput);
    focused = true;
    assert.equal(inputs.length, 2); // Resume does not replay stale deflection.
    device.report(1);
    assert.equal(inputs.length, 3);
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(resets, 2);
    await connection.close();
    page.dispatchEvent(new Event('blur'));
    assert.equal(resets, 3); // close only; its listeners are gone.
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete globalThis.window;
  }
});

class Device extends EventTarget {
  vendorId = 0x256f;
  productId = 0xc63a;
  opened = false;
  closes = 0;
  async open() { this.opened = true; }
  async close() { this.opened = false; this.closes++; }
  report(id, z = 75) {
    const event = new Event('inputreport');
    event.reportId = id;
    event.data = new DataView(new ArrayBuffer(12));
    event.data.setInt16(4, z, true);
    this.dispatchEvent(event);
  }
}
class Hid extends EventTarget {
  constructor(devices) { super(); this.devices = devices; }
  async requestDevice({ filters }) { this.filters = filters; return this.devices; }
  disconnect(device) { const event = new Event('disconnect'); event.device = device; this.dispatchEvent(event); }
}
test('application connector forwards explicit interruptions and owns deadline ticking without rendering',async()=>{
  let time=0;const c=control.interaction({activation:'push',value:'tilt',holdMs:25}),p=createPuck({controls:{c},clock:()=>time}),events=p.events(),device=new Device();
  const connection=await connectPuck(p,{hid:new Hid([device])});device.report(1,0);time=10;device.report(1,200);time=40;
  await new Promise(resolve=>setTimeout(resolve,35));assert.equal(p.read(c).status,'active');time=50;connection.pause();assert.equal(events.drain().at(-1).reason,'pause');
  time=60;await connection.close();p.dispose(60);
});

test('adapter can import without browser globals and chooser cancellation is ordinary', async () => {
  const hid = new Hid([]);
  assert.equal(await connectWebHid({ hid, onInput() {} }), null);
  assert.deepEqual(hid.filters, [{ vendorId: 0x256f, productId: 0xc63a, usagePage: 1, usage: 8 }]);
});

test('status is ignored, pause clears, resume waits for fresh input, close removes delivery', async () => {
  const device = new Device();
  const inputs = [];
  const connection = await connectWebHid({ hid: new Hid([device]), onInput: value => inputs.push(value) });
  device.report(1);
  assert.equal(inputs.at(-1).z, 75 / 350);
  device.report(23);
  assert.equal(inputs.length, 1);
  connection.pause();
  assert.deepEqual(inputs.at(-1), neutralInput);
  device.report(1);
  assert.equal(inputs.length, 2);
  connection.resume();
  assert.equal(inputs.length, 2);
  device.report(1);
  assert.equal(inputs.length, 3);
  await connection.close();
  device.report(1);
  assert.equal(inputs.length, 4);
  await connection.close();
  assert.equal(device.closes, 1);
});

test('only this device disconnect clears its input and notifies the consumer', async () => {
  const device = new Device();
  const hid = new Hid([device]);
  const inputs = [];
  let disconnects = 0;
  await connectWebHid({ hid, onInput: value => inputs.push(value), onDisconnect() { disconnects++; } });
  hid.disconnect(new Device());
  assert.equal(disconnects, 0);
  device.report(1);
  hid.disconnect(device);
  assert.equal(disconnects, 1);
  assert.deepEqual(inputs.at(-1), neutralInput);
  device.report(1);
  assert.equal(inputs.length, 2);
});

test('WebHID lifecycle neutral cancels pending gestures instead of completing them', async () => {
  const { createGestures } = await import('../dist/index.js');
  const device = new Device();
  const hid = new Hid([device]);
  const g = createGestures({ activation: .2, neutralMs: 35, doubleMs: 320 });
  let now = 0;
  const events = [];
  const connection = await connectWebHid({ hid, onInput(input) {
    if (input === neutralInput) { g.reset(); return; }
    events.push(...g.update(input, now));
  }, onReset: g.reset });
  device.report(1, 0);
  now = 10; device.report(1, 200);
  now = 90; device.report(1, 0);
  g.advance(125);
  // No frame tick before a lifecycle clear after the single deadline.
  now = 500; connection.pause();
  assert.deepEqual(events, []);
  assert.deepEqual(g.advance(600), []);
  assert.equal(g.state.phase, 'blocked');
  connection.resume();
  now = 610; device.report(1, 200);
  assert.equal(g.state.phase, 'blocked');
  now = 620; device.report(1, 0);
  assert.equal(g.state.phase, 'neutral');
  await connection.close();
});
