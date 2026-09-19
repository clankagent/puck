# Combined push/pull and tilt — unreleased

[Documentation](../README.md) · [Roadmap](roadmap.md)

This API is under development on main for the next release. It is not in npm
0.2.0. Standalone tilt singles/doubles are awaiting separate recording analysis.

```js
import {createGestures, defaultGestureTune} from '@clankagent/puck';
const gestures = createGestures({...defaultGestureTune.toOptions(), pressMode:'auto'});
// A combined event: {direction:'push', tilt:'rx+', kind:'single', timestamp, durationMs}
```

`pressMode` is `simple` (existing default), `auto` (choose plain or combined), or
`tilt` (combined actions plus plain doubles; suppress plain singles). `pushMode`
and `pullMode` override it independently. Combined modes require
`singleMode:'exclusive'`. The `rx+`, `rx-`, `ry+`, `ry-` labels are device-axis
directions; applications map these to their own screen orientation.

Pressure arms tilt detection. The cap may relax while tilting; it need not stay
above the pressure activation gate. A brief full release can still be joined
to a subsequent tilt. Sustained tilt on the strongest direction chooses the
action; a substantially stronger later direction can replace a preparatory
tilt. A pressure reversal cancels the excursion. Pre-existing tilt cannot arm a
combination. Neutral, interruption and maximum duration prevent repeated holds.

| Option | Default | Meaning |
|---|---|---|
| `tiltActivation`, `tiltRelease` | .24, .115 | Normalized force gates |
| `tiltMinMs` | 25 | Short noise dwell, not a target execution speed |
| `tiltArmMs` | 450 | Maximum time from pressure to tilt onset |
| `tiltRelaxMs` | 180 | Maximum gap from pressure release to resumed tilt |
| `tiltMaxMs` | 1000 | Maximum combined excursion duration |
| `tiltDominance` | 1.25 | Required directional separation |

The reference input is treated as the slower end of normal. Faster movements
are accepted; the upper allowances are not mandatory waits. Combined events
emit on full release plus neutral dwell, without waiting for a plain double.
Repeated combinations are separate single actions; this draft does not pair
them into combined doubles. Ordinary doubles retain completion-to-completion
timing. With an unusually short `doubleMs`, plain singles wait at least
`tiltRelaxMs + tiltMinMs` to leave time for a possible combination.

## Tunes, recordings and graphs

Tune JSON version 1 accepts optional `pressTilt` containing `force` (a standard
force band), `minMs`, `armMs`, `relaxMs`, `maxMs`, and `dominance`. Old tunes
remain restorable. The default tune includes these settings, but does not
enable combined recognition. Immutable force edits also edit the tilt band;
timings stay unchanged. Save the mode separately from the tune.

`calibratePressTilts(recordingOrArray, {baseTune?, minimumPerAction?})` derives
tilt settings from raw z/rx/ry, independent of event labels and group order. It
requires at least three inferred examples of all eight push/pull × tilt
combinations. The result has `status`, `tune`, `counts`, `missing`, `actions`
and `issues`; only use a non-null tune. The base defaults to
`defaultGestureTune`; ordinary press/twist force and double timing are preserved.
No inferred count is a claim of labeled accuracy. Simulator input is useful
for tests, not physical evidence. The parser uses fixed exploratory boundaries
(.06 neutral, .25 tilt detection, 180 ms quiet gap); very different motion may
need manual review. It does not learn every timing value from one capture.

From `@clankagent/puck/graph`, `createPressTiltGraph(recording,tune,{actions,
recordingIndex?,start?,end?})` produces six lanes (push, pull, four tilts) for
`renderGestureGraphSvg`. Each combination marks both its pressure and tilt lane.
Select a short window to see pressure relaxation instead of comparing an
entire minute at once.

The session example accepts `options:{pressMode:'auto'}` and records the exact
configuration. Lifecycle reset still cancels all pending actions. Apps retain
ownership of camera arbitration, recording storage, clocks and rendering.
