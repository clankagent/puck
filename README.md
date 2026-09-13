# Puck

A small TypeScript library for responsive SpaceMouse pan and zoom. Zero runtime dependencies.

Incoming reports update input state. Your animation loop consumes time-based motion. Your application owns the camera and renderer.

```sh
pnpm add @clankagent/puck
```

```js
import { createPanZoom } from '@clankagent/puck';
import { connectWebHid } from '@clankagent/puck/webhid';

const motion = createPanZoom({ zoomInput: 'press' });

connectButton.onclick = async () => {
  connectButton.disabled = true;
  try {
    connection = await connectWebHid({
      onInput: motion.setInput,
      onReset: motion.reset,
      onDisconnect() { connection = null; connectButton.disabled = false; },
    });
  } finally {
    connectButton.disabled = Boolean(connection);
  }
};

function frame(timestamp) {
  const delta = motion.step(timestamp);
  if (delta.moving) {
    // Apply zoom about your chosen anchor, then pan in screen pixels.
    camera.zoomAround(viewCenter, delta.zoomFactor);
    camera.panBy(delta.panX, delta.panY);
    render(camera);
  }
  requestAnimationFrame(frame);
}
let connection = null;
requestAnimationFrame(frame);

// A control can change this live. Pan and camera position are unaffected.
motion.setZoomInput('twist');

// On application teardown:
// await connection?.close();
// Cancel the application's animation frame as part of its own cleanup.
```

`camera`, `render`, `viewCenter` and `connectButton` above belong to your app. There is no camera implementation or framework dependency in the package. See `examples/camera.mjs` for the complete anchor calculation, including zoom limits.

## Responsibilities

| Part | Responsibility |
|---|---|
| Decoder | Convert a supported motion report to normalized six-axis cap deflection; ignore status packets. |
| WebHID adapter | Device selection, report delivery, foreground policy and connection cleanup. |
| Pan/zoom controller | Hold the latest input, apply deadzones, integrate response over frame time, emit movement deltas. |
| Your application | Own the render loop, input ownership, camera, zoom anchor, limits, and rendering. |

The core imports in Node without a browser. The browser adapter is a separate entry point and accesses browser APIs only when connecting. It starts no animation loop, timers, server, storage, or telemetry.

## Motion behavior

- `step(timestampMs)` uses the timestamp supplied by your render loop, once per frame. The first step produces no movement. It never assumes a display refresh rate.
- A held cap requests velocity. Input report count does not determine movement distance. The latest deflection remains active between reports, including bursty delivery.
- Pan has a 0.05 normalized deadzone and full-deflection speed of 1320 screen pixels/second. Zoom has a 0.1 deadzone and log-speed of 1.5/second. Both use a 25 ms acceleration response.
- Neutral input stops on the next step, without software coasting. Reversal discards response in the old direction.
- `twist`: clockwise zooms in. `press`: downward pressure zooms in, lifting zooms out. These directions refer to the verified profile.
- The default 50 ms frame cap limits jumps after rendering stalls. It is not a timeout for input reports.
- The adapter clears input on blur, hidden state and disconnect. Connect `onReset` to `motion.reset` as above so old response and frame timing are also cleared. Returning to the foreground waits for a fresh report. Use connection `pause()` / `resume()` when another tool owns the input; use controller `reset()` if you provide your own transport.
- Use one controller per independent input stream. Do not drive both the report callback and frame loop with movement updates.

## Hardware scope

The report layout and motion defaults were measured with vendor `0x256f`, product `0xc63a`, over Bluetooth on Windows: report 1, twelve bytes, six signed little-endian 16-bit axes, logical range ±350. Buttons and other layouts are not implemented yet. Other devices require a matching `DeviceProfile`; profile support should be backed by descriptors and captures, not guessed from the vendor alone.

WebHID requires browser support and device permission. The adapter inherits that availability; the motion core does not. [Official WebHID guide](https://developer.chrome.com/docs/capabilities/hid).

## Development

```sh
pnpm install
pnpm check
```

The build emits ESM and declarations. Tests run against those emitted modules. Runtime dependencies: none. Licensed under MIT. See [CONTRIBUTING.md](CONTRIBUTING.md) for development and device support.
