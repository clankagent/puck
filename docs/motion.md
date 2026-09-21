# Motion and hardware

[Documentation](../README.md) · [API reference](api.md)

## Application controls (1.0)

Use recipes.panZoom() or recipes.sixAxis() with createPuck and integrate their
velocity handles through puck.frame(performance.now()). Six-axis translation is
600 units/s and rotation pi/2 rad/s at full deflection. The navigation recipe
uses +x/+y/+z and +rx/+ry/-rz scales; raw controls retain device signs. The app
owns camera-axis assignment and may override scale using puck.configure().
Semantic tilt is [-ry,rx], right/down positive. Motion calibration is not implied
by normalizing sensor values. See [application API](application-api.md).

## Retained createPanZoom behavior

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
