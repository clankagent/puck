# Tunes, recording and calibration

[Documentation](../README.md) · [Complete integration](quickstart.md) · [API reference](api.md)

The snippets below explain individual operations. Use the complete integration example for connection, capture start/stop and cleanup.

## Gesture tunes

The experimental gesture API uses an immutable tune object. The default profile
has a shared rotation center of .465, push .314, and pull .289. It uses rotation
activation/release .25/.15, push .20/.08, pull .12/.06, neutral dwell 25 ms, and a
400 ms double window. These are useful starting defaults, not universal hardware
calibration. Pan/zoom behavior is unchanged.

```js
import {
  createGestures, createGestureTune, defaultGestureTune, gesturePresets,
} from '@clankagent/puck';

const tune = defaultGestureTune.soften(0.1).widen(0.15);
const gestures = createGestures(tune);
// createGestures() uses defaultGestureTune.
// Also available: gesturePresets.default, .soft (20% softer), .hard (20% harder).

const saved = JSON.stringify(tune);
const restored = createGestureTune(JSON.parse(saved));
const another = restored.harden(0.05).narrow(0.1);
```

Every edit returns a new deeply frozen object, including its nested bands.
Amounts are fractions: `.soften(.1)` lowers force levels by 10%; `.harden(.1)`
raises them by 10%. Levels saturate at normalized full scale. `.narrow(.1)`
reduces distances from the center by 10%, moving the activation gate toward the
center; `.widen(.1)` expands them and lowers the activation gate. Release remains
proportional to activation. These methods edit force only; timing remains unchanged.
Softening and narrowing require amounts in [0,1); hardening and widening accept
[0,10]. Edits are composable, not algebraic inverses: softening by 10% and then
hardening by 10% gives 99% of the original force.

Each `rotation`, `push`, and `pull` band contains `center`, `low`, `high`,
`activation`, and `release`. Low/high describe typical peak variation; they are
not rejection boundaries. Stronger-than-typical input still counts. Rotation
always shares a band between clockwise and counterclockwise. `toJSON()` returns
portable versioned data; `toOptions()` returns the low-level recognizer options.
For precise timing edits, copy both `toJSON()` and its nested `timing` object, then call
`createGestureTune(data)` to validate it.

The low-level `createGestures(options)` overload remains available. Missing
settings use the default tune; `createGestures({})` matches `createGestures()`.
Explicit signed-direction gates override axis gates, which override shared
activation/release values. Prefer a tune object for complete configuration.
## Recording and custom calibration

A complete calibration needs at least **three of each of eight actions**:
clockwise single/double, counterclockwise single/double, push single/double,
and pull single/double. Grouping examples is convenient but not required.
Use short pulses and leave a pause between separate actions. The parser uses
raw deflection and timing, not the order of action groups or recorded event labels.

```js
import {
  createGestureRecorder, createGestures, defaultGestureTune,
  calibrateGestures, neutralInput,
} from '@clankagent/puck';

const gestures = createGestures(defaultGestureTune);
const recorder = createGestureRecorder({
  startTimeMs: performance.now(), tune: defaultGestureTune, source: 'device',
});

// Call for every report; don't discard reports between render frames.
function onInput(input) {
  const now = performance.now();
  if (input === neutralInput) { // WebHID lifecycle sentinel, not physical release
    gestures.reset(); recorder.reset(now); return;
  }
  recorder.input(input, now);
  const events = gestures.update(input, now);
  recorder.events(events);
  consume(events); // Your application handles recognized actions.
}
function frame() {
  const now = performance.now(); // Same clock used by onInput.
  recorder.advance(now);
  const events = gestures.advance(now);
  recorder.events(events);
  consume(events);
  requestAnimationFrame(frame);
}
// Wire WebHID onReset to reset both processors as well.
// Start your frame loop and pass onInput to your transport.

const recording = recorder.snapshot(performance.now()); // At the end of capture.
// Your app can download JSON.stringify(recording) or save it to its own backend.
const result = calibrateGestures(recording);
// Or combine sessions: calibrateGestures([recordingA, recordingB]).
if (result.tune !== null) {
  const tunedGestures = createGestures(result.tune);
  // Save JSON.stringify(result.tune) for the next session.
}
```

The SDK owns no timers, listeners, storage or network access. The recorder copies
samples, has a default two-minute / 50,000-entry bound, reports `full`, and
returns detached snapshots. Apps own start/stop and storage. Raw records include
six axes, relative timestamps, frame ticks, resets, and optional recognized
events. The latest input remains held during report silence. Reset cancels
recognition and requires a fresh neutral sample. Use `performance.now()` in both
callbacks; rAF's supplied timestamp can precede a report already processed.

Calibration returns `status`, `tune`, `counts`, `missing`, `stats`, `pulses`,
`actions`, and `issues`. Incomplete or ambiguous input returns `tune: null`;
counts never claim labeled ground-truth accuracy. Quick same-direction singles
can be indistinguishable from an intended double. Runs of three or more closely
spaced pulses are flagged as ambiguous. Separate sessions and resets are never
paired. Long holds, unfinished excursions, and very short spikes are excluded.

The initial parser uses a normalized .025 detection floor, local peak/valley
shape and a 250 ms maximum inter-pulse gap for pairs. These can be configured
with `detectionFloor` and `pairGapMs`. `minimumPerAction` can raise the requirement
but cannot go below three. Candidate centers are per-direction mean peak force;
rotation uses the unweighted average of the two direction means. Typical bands
use interpolated 10th/90th percentiles. Gates and timing are derived conservatively
from observed weaker peaks, return valleys, pulse lengths and double intervals.
Calibration infers intended actions; it is not evidence of subjective feel or
new hardware compatibility.

## Graphs for consuming applications

```js
import { createGestureGraph, renderGestureGraphSvg } from '@clankagent/puck/graph';

const model = createGestureGraph(recording, result.tune ?? defaultGestureTune, {
  actions: result.actions,
  // Optional start/end in milliseconds to inspect an individual action.
});
container.innerHTML = renderGestureGraphSvg(model, { width: 900 });
```

`createGestureGraph` returns renderer-neutral data for four separate positive
magnitude lanes. The optional SVG renderer has no DOM dependencies: it labels
directions, typical peaks, activation and release, preserves held samples as
steps, and highlights inferred action intervals. Its text is escaped. For
combined calibrations, pass the corresponding recording and `recordingIndex`.
Apps can use the model with their own chart library instead. Only graph a tune
when available; incomplete calibration can be inspected with the default tune.
