# Standalone and combined tilts (0.4.0)

[Documentation](../README.md) · [Roadmap](roadmap.md)

These experimental APIs are enabled by default. `createGestures()` recognizes plain, standalone tilt and combined press/tilt gestures. Disable them explicitly with `{pressMode:'simple', standaloneTilt:false}`.

```js
import {createGestures, defaultGestureTune} from '@clankagent/puck';
const gestures = createGestures();
// A combined event: {direction:'push', tilt:'rx+', kind:'single', timestamp, durationMs}
```

`pressMode` is `simple` (disable combined), `auto` (default; choose plain or combined), or
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
Repeated combinations are separate single actions; the recognizer does not pair
them into combined doubles. Ordinary doubles retain completion-to-completion
timing. With an unusually short `doubleMs`, plain singles wait at least
`tiltRelaxMs + tiltMinMs` to leave time for a possible combination.

## Tunes, recordings and graphs

Tune JSON version 1 accepts optional `pressTilt` containing `force` (a standard
force band), `minMs`, `armMs`, `relaxMs`, `maxMs`, and `dominance`. Old tunes
remain restorable. The default tune includes these settings; recognition enables all families
unless mode options explicitly disable them. Immutable force edits also edit the tilt band;
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

## Standalone directional singles and doubles

The default `standaloneTilt:true` recognizes rx+/rx−/ry+/ry− without a deliberate
push, pull or twist. Events use `direction:'rx+'` (or another tilt direction)
and `kind:'single'|'double'`, with no `tilt` field. Signs are device axes, not
screen directions. Map them in the consuming app.

```js
const gestures = createGestures({
  ...defaultGestureTune.toOptions(),
  standaloneTilt: true,
  pressMode: 'auto', // default: also recognize pressure-first combinations
});
```

The first qualifying motion owns the excursion: pressure-first can become a
combination; tilt-first remains standalone even if incidental pressure follows.
Neutral rx/ry completes a standalone pulse. Reversals without neutral cancel.
A double pairs completions within its own double window. Exclusive singles
wait; immediate singles are additive, as with ordinary presses. Combined modes
still require exclusive singles. Long holds and lifecycle resets do not emit taps.

| Standalone option | Default |
|---|---|
| `tiltXActivation`, `tiltXRelease` | .13, .104 |
| `tiltYActivation`, `tiltYRelease` | .28, .16 |
| `standaloneMinPulseMs`, `standaloneMaxPulseMs` | 25, 650 |
| `standaloneNeutralMs`, `standaloneDoubleMs` | 10, 400 |

Tune version 1 also accepts optional `standaloneTilt:{rx,ry,timing}`. Each axis
has a force band shared by its positive/negative directions; timing contains
`minPulseMs,maxPulseMs,neutralMs,doubleMs`. Old JSON remains valid. Presets and
immutable edits include these bands; `toOptions()` supplies thresholds without
enabling recognition. Store your mode choices alongside the tune.

```js
import {calibrateTilts, createGestureTune} from '@clankagent/puck';
import {createTiltGraph, renderGestureGraphSvg} from '@clankagent/puck/graph';
const result = calibrateTilts(recordings, {baseTune: defaultGestureTune});
if (result.tune) {
  const saved = JSON.stringify(result.tune);
  const restored = createGestureTune(JSON.parse(saved));
  const gestures = createGestures({...restored.toOptions(), standaloneTilt:true});
}
// Display result.status, counts, missing and issues even when tune is null.
const model = createTiltGraph(recordings[0], result.tune ?? defaultGestureTune,
  {actions:result.actions, recordingIndex:0});
const svg = renderGestureGraphSvg(model);
```

`calibrateTilts(recordingOrArray,{baseTune?,minimumPerAction?})` requires three
singles and three doubles per direction (eight action types), in any order.
It accepts 1–20 captures, preserves capture/reset boundaries, and ignores
pressure-first excursions. The result includes status, tune, counts, missing,
actions, stats and issues. Other gesture families retain their base settings.
Use one copy of each capture; duplicates are not new evidence. The parser uses
.06 exploratory neutral/detection and .15 early-pressure separation; review
unusual motion manually. Closely spaced singles may be inferred as doubles.
The graph shows four signed tilt lanes, force bands and inferred action spans.
These inferred labels are useful tuning evidence, not measured recognition accuracy.
