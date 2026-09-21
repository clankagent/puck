# Application controls · 1.0 release candidate

Puck provides three kinds of physical control: continuous values, discrete
gestures and interactions with a lifetime. Applications name the controls and
decide what they do. Definitions are immutable typed handles; creating two Puck
instances from them creates independent state.

Install the candidate with `pnpm add @clankagent/puck@next`. Stable 0.5 remains on
`latest` during physical evaluation. The new defaults have software coverage;
their subjective feel is not certified by simulation.

```ts
import { createPuck, control, recipes } from '@clankagent/puck';
import { connectPuck } from '@clankagent/puck/webhid';

const controls = {
  move: control.continuous('slide', { as: 'velocity', speed: 2 }),
  choose: recipes.directionSelection({
    activation: 'pull',
    cancel: { input: 'twist', direction: 'either' },
  }),
};
const puck = createPuck({ controls });
const off = puck.on(controls.choose, event => {
  if (event.type === 'commit') console.log('Chosen sector:', event.value);
});

// In a user-initiated click handler:
const connection = await connectPuck(puck);
// In the application's render loop:
const delta = puck.frame(performance.now()).integrate(controls.move);
// Read current velocity without advancing time:
const velocity = puck.read(controls.move);

// On teardown: stop the application's render loop first.
await connection?.close();
off();
puck.dispose();
```

These controls use disjoint channels. A modal selection can instead capture all
six axes; that overlap then needs the explicit preference shown below. Neither
core construction nor a definition creates browser listeners, timers or a device
chooser. The optional browser connector owns deadline ticking; your app owns
rendering. Custom transports call `feed(sample, time)` for every report and call
`advance(time)` between reports, or `frame(time)` from a render loop.

## Continuous values

`control.continuous(source, options?)` returns normalized calibrated deflection
by default. Sources are `slide`/`tilt` (two-component tuples),
`translation`/`rotation` (three-component tuples), `pressure`/`twist` (signed
scalars), `push`/`pull` (positive magnitudes), and `axes` (x/y/z/rx/ry/rz object).
The values describe cap deflection, not measured displacement or orientation.

Options: `deadzone` (.05), `curve` (1), `scale` (per-axis multipliers; negative
inverts), and `ownership`. `as:'velocity'` adds `speed` (1 by default) and
`responseMs` (25). Translation rates use application units/second; rotation rates
use radians/second. Six-axis speed can be `{translation, rotation}`. Velocity
response stops immediately at neutral and discards old-direction response on
reversal. Deflection outputs do not apply velocity smoothing.

`as:'direction'` is available for slide/tilt: `sectors` (8), `hysteresis` (.08
radians) and `sticky` (false). The result is a sector or `null` at center before
selection. Sector 0 points along the first positive vector component, increasing
toward the second positive component. These are device coordinates; orient them
with `scale` or in the application.

`read(handle)` has no timing or consumption effects. Velocity is typed differently
from deflection. `frame(time).integrate(handle)` accepts only registered velocity
controls (including velocity-valued interactions), and returns their interval
increments. Frames are immutable; repeated integration of the same handle gives
the same result, not a second advance.

All reports between frames contribute at their actual timestamps. The first frame
establishes the interval start and returns zero. `maxFrameMs` defaults to 50;
after a stall, only the first 50 ms of that frame interval contributes movement.
The current velocity still evolves with elapsed time. This differs from the old
frame-only controller during stalls. Duplicate frame times return zero; time must
be finite and nondecreasing across all input, frame and mutation calls.

## Discrete gestures

```ts
const controls = {
  action: control.gesture('push'),
  alternate: control.gesture('pull', { count: 2 }),
  clockwise: control.gesture('cw'),
  twist: control.gesture('twist', { direction: 'either' }),
  tilt: control.gesture('rx+'),
  combined: control.gesture({ pressure: 'push', tilt: 'ry-' }),
  rotate: control.gesture({ pressure: 'pull', twist: 'ccw' }),
};
const puck = createPuck({ controls });
puck.on(controls.action, event => console.log(event.gesture));
```

All eight plain directions support single/double commands. Eight pressure/tilt
and four pressure/twist combinations support singles. Combined doubles are
rejected. Existing `GestureOptions` remain available, including force thresholds
and exclusive/additive single policy. The old recognizer performs cross-axis
arbitration: command dependencies therefore include z/rx/ry/rz, not just the
axis named in the outcome. No gesture is disabled by an undocumented feature flag.

Events carry `control`, `timestamp`, `sequence`, `type:'trigger'` and `gesture`.
Use `on` or a cursor; `read(gesture)` is a type and runtime error. The original
32-outcome recognizer/tester, including its four pair holds, remains available
through `createGestures()` with unchanged defaults.

## Interactions and held values

```ts
const choose = control.interaction({
  activation: 'pull',
  value: 'tilt',
  cancel: { input: 'twist', direction: 'same', count: 2 },
});
const adjust = control.interaction({
  activation: 'push',
  value: control.continuous('twist', { as: 'velocity', speed: 2 }),
});
```

Both push and pull support the same features. Other activation directions are
cw/ccw/rx+/rx-/ry+/ry-. Values can be any continuous source or continuous
definition. Embedded definitions get interaction-local state, including sticky
direction memory; separate activations do not inherit a previous selection.

Defaults are `lifetime:'activation'`, `completion:'release'`, `holdMs:0`,
`releaseMs:25`, and exclusive ownership of used channels. `enter`/`leave` use the
existing directional tune. `lifetime:'combination'` requires the value to remain
deflected too. A delayed hold uses `holdMs`; there is no maximum active duration.
An activation-held value may return to center or reverse without ending its
pressure-held lifetime. Reversing the activation cancels.

`read` returns `{status:'inactive'}` or
`{status:'active', sessionId, startedAt, value}`. `on` delivers:

| Type | Payload |
|---|---|
| begin / update | sessionId, value |
| commit | sessionId, final value |
| cancel | sessionId, reason |

Each active session gets one terminal outcome. Release qualification freezes the
candidate before a release report perturbs tilt; chatter can resume the session.
`requireValue:true` turns a null candidate into `cancel('no-selection')` and
narrows the commit type. Normal completion of a held control does not undo or
transactionally apply application side effects.

Twist cancellation can be one pulse in either direction, or two pulses with
`direction:'same'` or `'either'`. Each pulse needs twist-neutral; pressure remains
held. Cancellation evidence begins inside the session. Releasing pressure before
a double cancel completes follows ordinary completion. `cancel(handle)` gives
applications an Escape/button cancellation path. Interruption and context changes
cancel active sessions and require fresh neutral input; synthetic clearing is not
a physical release.

## Ownership, contexts and settings

Continuous and gesture controls default to `ownership:'shared'`. Interactions
default to exclusive used channels. Exceptional choices are `ownership:'observe'`,
`'shared'`, `'exclusive'`, or `{mode:'exclusive', channels:'all'}`; explicit axis
arrays are also accepted. Observation bypasses action ownership, not lifecycle
or context eligibility. Raw physical samples remain visible in inspection.

```ts
const controls = {
  action: control.gesture('push'),
  adjust: control.interaction({ activation: 'push', value: 'twist' }),
};
const puck = createPuck({
  controls,
  conflicts: [{ prefer: controls.adjust, over: [controls.action] }],
});
```

Overlapping exclusive claims need an explicit preference, separate contexts, or
an explicit sharing/observation policy. Declaration order never assigns priority;
cycles are rejected. An active owner keeps its claim through completion. Losing
eligibility cancels pending recognition and active sessions, and prevents stale
held input from leaking into background controls after release. Opposite
activation directions may coexist; reversal cannot launch the opposite session
until neutral rearming.

Use `{controls: common, contexts: {browse, edit}, context:'browse'}` and
`setContext('edit')`. Handles stay stable. Inactive continuous outputs are neutral,
inactive interactions return inactive state, and commands do not dispatch.

`configure(handle, patch)` changes typed tuning settings. Continuous speed changes
apply to current input; interaction/gesture changes cancel and rearm. Structural
changes (source, kind, activation, ownership, etc.) require a new definition.
`settings()` returns versioned portable settings keyed by declared paths.
`restoreSettings(saved)` validates every change before applying any; mismatched
names, structural changes and unsupported versions fail explicitly.

All mutation methods accept an optional final timestamp; otherwise the configured
monotonic `clock` is used. Clock domains must match frame/report timestamps.
Calls at equal times retain call order. Interruption/cancel/context/configuration
operations cancel before an unprocessed deadline at that same time; they cannot
undo a commit already dispatched by an earlier call. Mutations from event callbacks
are queued until the current event batch finishes. Create frames outside callbacks.

## Inspection, cursors, recording and graphs

- `inspect()` / `inspect(handle)`: source definitions, effective settings,
  dependencies, ownership, current context, eligibility and suppression reason.
- `on(handle, callback)`: returns an unsubscribe function. Subscriber failures do
  not prevent other subscribers receiving the batch; supply `onError` to handle
  errors rather than receiving a throw after dispatch.
- `events()`: independent cursor with `drain()` and `dispose()`. New cursors start
  with future events. The default 2,048-event retention is bounded (`eventLimit`).
  Overflow throws `EventOverflowError` with a missed count, advances to the oldest
  retained event, and lets the next drain retrieve that retained range.
- `{trace:true}` enables bounded `explain(event)` evidence. Status is retained,
  expired or disabled. Retained evidence includes the sample/settings/context at
  emission and the logical/dispatch times, not an invented explanation of intent.
- `{record:true}` enables `recording()` and cheap `recordingFull` inspection.
  Recording keeps the initial definition and ordered input, frame, context,
  configuration and interruption operations. Default limit: 50,000 operations.
  Reaching the limit marks a partial capture; control processing continues.
- `replayPuck(recording)` reconstructs independent handles/runtime, events and
  immutable frames. It reports `complete:false` for a truncated recording.
- `/graph` exports `createControlGraph(recording)`: six raw lanes, lifecycle
  occurrences, settings/context changes and integrated motion intervals.
- `dispose()` terminates sessions and releases subscriptions/cursors. Dispose the
  separately owned device connection first. Live reads after disposal fail.

## Public recipes and compatibility

`recipes.directionSelection`, `heldValue`, `panZoom` and `sixAxis` are compositions
of the same public declarations. `motionDefaults` exposes their shared defaults.
Pan is 1320 pixels/second, log zoom 1.5/second; six-axis translation is 200 app
units/second and rotation is π/2 radians/second. The application exponentiates
integrated log zoom and owns camera bounds, coordinate frames and rendering.

The [application-controls workbench](https://clankagent.github.io/puck/controls.html)
uses these APIs directly. The main playground's movement also uses these recipes.
The existing low-level motion/recognition, calibration, tune and recording APIs
remain exported. Version-1 legacy gesture recordings and version-1 application
recordings are different named formats; do not send one to the other's validator.

There is no new public graph compiler or arbitrary temporal language in this
candidate. Public declarations plus the existing low-level APIs cover the agreed
controls; applications are not required to wire recognizer state machines.
