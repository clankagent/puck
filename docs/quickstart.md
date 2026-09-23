# Browser quickstart

## Application controls (1.0)

Install with pnpm add @clankagent/puck@1.1.0. Your page supplies a Connect button
and a status element. The application owns rendering; connectPuck owns report
delivery and recognition deadlines, including while the cap is held still.

```js
import { createPuck, control, recipes } from '@clankagent/puck';
import { connectPuck } from '@clankagent/puck/webhid';

const controls = { ...recipes.panZoom(), action: control.gesture('push') };
const puck = createPuck({ controls });
const status = document.querySelector('#status');
let connection = null, connecting = false, frameId, disposed = false;
const off = puck.on(controls.action, () => { status.textContent = 'Push detected'; });

function render() {
  const frame = puck.frame(performance.now());
  const [dx, dy] = frame.integrate(controls.pan);
  const zoomFactor = Math.exp(frame.integrate(controls.zoom));
  // Apply dx, dy and zoomFactor to your application's view.
  frameId = requestAnimationFrame(render);
}
render();
document.querySelector('#connect').onclick = async () => {
  if (connecting || connection || disposed) return;
  connecting = true;
  try {
    const opened = await connectPuck(puck, {
      onDisconnect() { connection = null; status.textContent = 'Disconnected'; },
      onError(error) { status.textContent = String(error); },
    });
    if (disposed) { await opened?.close(); return; }
    connection = opened;
    status.textContent = opened ? 'Connected — release to neutral' : 'Connection cancelled';
  } catch (error) { status.textContent = String(error); }
  finally { connecting = false; }
};
// Call when removing this view. Avoid starting a chooser during teardown.
async function dispose() {
  disposed = true;
  cancelAnimationFrame(frameId);
  // Await any in-flight Connect handler before disposing its runtime.
  while (connecting) await new Promise(resolve => setTimeout(resolve, 16));
  await connection?.close();
  connection = null;
  off();
  puck.dispose();
}
```

For a pressure-gated menu or held value, use an interaction rather than a
discrete command. See [application controls](application-api.md) for symmetric
push/pull sessions, commit/cancel and explicit ownership. Use one monotonic clock;
call frame(performance.now()) rather than mixing a report timestamp with an older
requestAnimationFrame timestamp. A cancelled chooser returns null.

## Retained low-level gesture integration

[Documentation](../README.md) · [API reference](api.md)

The low-level examples below remain supported in 1.0. Use a browser with WebHID in a secure context and call connection from a user click. A cancelled chooser returns `null`; unsupported browsers and device errors reject the promise. Catch and display those errors in your UI.

Copy [gesture-session.mjs](../examples/gesture-session.mjs) into your app. It is a complete connection and recording wrapper using public imports, with one clock, lifecycle resets and frame cleanup. Resolve its package imports through your bundler. It is an example file, not a package export.

```js
import { connectGestureSession } from './gesture-session.mjs';
import { calibrateGestures, defaultGestureTune } from '@clankagent/puck';
import { createGestureGraph, renderGestureGraphSvg } from '@clankagent/puck/graph';

// Your page supplies buttons with these IDs and a pre with id="output".
const connect = document.querySelector('#connect');
const start = document.querySelector('#start');
const stop = document.querySelector('#stop');
const output = document.querySelector('#output');
let session = null;
let connecting = false;
connect.onclick = async () => {
  if (session || connecting) return;
  connecting = true;
  try {
    session = await connectGestureSession({
      onEvents: events => { output.textContent = JSON.stringify(events, null, 2); },
      onDisconnect: () => { output.textContent = 'Disconnected. Save the capture before reconnecting.'; },
    });
  } catch (error) { output.textContent = String(error); }
  finally { connecting = false; }
};
start.onclick = () => {
  try { session?.startRecording(); }
  catch (error) { output.textContent = String(error); }
};
stop.onclick = () => {
  const recording = session?.stopRecording();
  if (!recording) return;
  const result = calibrateGestures(recording);
  output.textContent = JSON.stringify({ status: result.status, counts: result.counts, issues: result.issues }, null, 2);
  const graph = createGestureGraph(recording, result.tune ?? defaultGestureTune, { actions: result.actions });
  // Add this SVG to a graph container, or save it as an .svg file.
  const svg = renderGestureGraphSvg(graph);
  console.log(svg);
  // Persist JSON.stringify(recording) using your app's download/storage UI.
  // When result.tune is non-null, persist JSON.stringify(result.tune) separately.
};
// On component teardown or before reconnecting:
async function dispose() {
  const recording = session?.stopRecording(); // Save this if wanted.
  await session?.close();
  session = null;
  return recording;
}
```

Start capture while the cap is neutral. Perform at least three singles AND three doubles in EACH direction: clockwise, counterclockwise, push down, pull up. Any order works. Finish with neutral and allow the double window to expire before stopping. The recorder is bounded; check `session.recordingFull` in your UI and stop/save when full. Reconnect with a new session after disconnect. To apply a learned tune, close the old session and pass `{ tune: result.tune }` when connecting the next one.

## Pan and zoom

```js
import { createPanZoom } from '@clankagent/puck';
import { connectWebHid } from '@clankagent/puck/webhid';

const motion = createPanZoom({ zoomInput: 'press' });
let frameId;
function frame(time) {
  const delta = motion.step(time);
  // Your camera consumes delta.panX, delta.panY and delta.zoomFactor.
  frameId = requestAnimationFrame(frame);
}
// In your connect click handler:
const connection = await connectWebHid({ onInput: motion.setInput, onReset: motion.reset });
if (connection) frameId = requestAnimationFrame(frame);
// On teardown: cancelAnimationFrame(frameId); await connection?.close();
```

[Camera arithmetic](../examples/camera.mjs) shows zoom anchors and limits. Motion-only code can use rAF timestamps because reports do not advance its clock. For gestures use `performance.now()` in both callbacks, as in the session example. If combining motion and gestures, fan each report out to both processors and reset both on lifecycle changes; keep a single app-owned frame loop.
