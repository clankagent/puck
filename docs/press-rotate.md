# Press and rotate: taps and holds

[API](api.md) · [Upgrade guide](upgrading.md#from-04-to-05) · [Playground](playground.md)

`createGestures()` recognizes push down or pull up combined with either clockwise
or counterclockwise twist. This feature is enabled by default in the package and
demo. It uses z and rz, not the rx/ry tilts. Screen up/down mappings belong to your app.

Apply pressure first, then twist while keeping pressure held. Simultaneous onset
also works when pressure is at least twist magnitude divided by `dominance` (1.4
by default), avoiding dominant-twist cross-talk. Twist-first and tilt-first input
retain their original family. Slow pressure ramps and a long pressure hold before
twisting are supported. Start from neutral after creation or reset.

| Option | Default | Purpose |
|---|---|---|
| `pressRotate` | `true` | Set false to disable this family independently of tilt modes |
| `rotateMinMs` | `25` | Reject shorter combined taps |
| `rotateHoldMs` | `250` | Time from twist activation to hold start; at least rotateMinMs |

Pressure and twist reuse the existing per-direction/axis/shared force thresholds.
No separate duplicate force tuning is needed. These mode/timing options are saved
separately from tune JSON. Existing calibration does not learn hold timing.

For a short action, releasing either axis emits one event:

```js
{ direction: 'pull', rotation: 'clockwise', kind: 'single',
  timestamp: 180, durationMs: 120 }
```

Sustain both axes for the hold delay to receive `kind:'holdstart'`. The hold
continues without a maximum duration or repeated start events, including when a
stationary device sends no new reports. Release either axis below its release gate
to get `holdend` immediately. Reverse either axis to get `holdcancel`. Return fully
to neutral before beginning another combination. A hold never also emits single
or double; short combinations are independent singles, not doubles.

`state.hold` is null unless currently holding. When active, it contains `direction`,
`rotation`, `startedAt` (the hold-start deadline), `pressure` and `strength` (current
normalized positive twist magnitude). State snapshots are copied. Event duration
is measured from combined activation, including the hold delay.

Feed every report and advance the same monotonic clock between reports. The core
has no timers and does not perform actions or move cameras itself:

```js
import { createGestures } from '@clankagent/puck';
const gestures = createGestures();
let value = 0, previous;

function handle(events) {
  for (const event of events) {
    if (!event.rotation) continue; // Route other gesture families separately.
    if (event.kind === 'single') {
      value += event.rotation === 'clockwise' ? 1 : -1;
    }
    // holdstart/holdend/holdcancel can also drive application callbacks.
  }
}
function onReport(input, now) { handle(gestures.update(input, now)); }
function frame(now) {
  handle(gestures.advance(now));
  const dt = previous === undefined ? 0 : Math.min(50, now - previous) / 1000;
  previous = now;
  const hold = gestures.state.hold;
  if (hold) {
    // Example app mapping: push/pull choose a speed; twist chooses value direction.
    const speed = hold.direction === 'push' ? 10 : 2;
    value += (hold.rotation === 'clockwise' ? 1 : -1) * speed * hold.strength * dt;
  }
}
function cancel(now) {
  handle(gestures.reset(now)); // Emits holdcancel, never a synthetic release/tap.
  previous = undefined;
}
```

Call `cancel` on blur, pause, disconnect and close. The supplied
[WebHID session example](../examples/gesture-session.mjs) forwards these lifecycle
events. Calling `reset()` without a timestamp uses the last processed timestamp;
passing current time gives an accurate cancellation duration. Reset clears held
state immediately and requires fresh neutral input before rearming.

Continuous motion remains independent. A consuming app decides whether a held
combination should control scrolling, a camera, a value, or another action, and
whether ordinary motion should be suppressed while that action is held.
