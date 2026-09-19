# API reference

[Documentation](../README.md) · [Quickstart](quickstart.md) · [Tuning guide](tuning.md)

This reference describes 0.2.0, including its experimental gesture APIs. Emitted `dist/*.d.ts` files are the exact TypeScript signatures for your build. Named exports only; use the three supported entry points below, not deep imports into `dist`.

## Imports and units

| Entry point | Runtime exports |
|---|---|
| `@clankagent/puck` | `decodeCombinedReport`, `neutralInput`, `createPanZoom`, `createGestures`, `createGestureTune`, `defaultGestureTune`, `gesturePresets`, `createGestureRecorder`, `validateGestureRecording`, `calibrateGestures`, `gestureDirections` |
| `@clankagent/puck/webhid` | `connectWebHid`, `combinedProfile` |
| `@clankagent/puck/graph` | `createGestureGraph`, `renderGestureGraphSvg` |

`InputState` has six finite normalized axes: `x,y,z,rx,ry,rz`, each in [-1,1]. They represent deflection, not angles. For the verified profile, positive `rz` is clockwise and positive `z` is push down; negative values are counterclockwise and pull up. Force bands use positive magnitudes [0,1]. Times are milliseconds. Recorder and calibration times are relative to capture start; live recognizer event times use the supplied clock.

`decodeCombinedReport(reportId, DataView)` accepts report 1 with exactly 12 bytes, decodes six little-endian signed 16-bit values divided by 350 and clamps to [-1,1]. Other reports return `null`. `neutralInput` is a shared frozen zero input; the WebHID adapter also uses its identity as a lifecycle sentinel.

## Motion

`createPanZoom(options?)` returns `setInput(input)`, `step(time)`, `setZoomInput('twist'|'press')`, `reset()`. Step returns `{panX, panY, zoomFactor, moving}`. Pan is screen pixels; zoom is multiplicative. First step is idle. Input is held until replaced; neutral stops on the next step.

| Option | Default |
|---|---|
| `zoomInput` | `'twist'` |
| `panSpeed`, `zoomSpeed` | 1320 pixels/s, 1.5 log-units/s |
| `panDeadzone`, `zoomDeadzone` | .05, .1 |
| `responseMs`, `maxFrameMs` | 25, 50 |

Speeds/times must be finite and nonnegative; deadzones are in [0,1). Invalid options throw `RangeError`.

## Gestures

`createGestures(tuneOrOptions?)` returns `update(input,time)`, `advance(time)`, `reset()`, and read-only `state` (`phase`, `direction`, `pending`). Both update and advance return event arrays. Process EVERY report; advance even when reports are silent. Timestamps must be finite and nondecreasing or throw `RangeError`.

An event is `{direction, kind, timestamp, durationMs}`. Direction is `clockwise|counterclockwise|push|pull`; kind is `single|double`. Timestamp is the logical recognition deadline, which can precede dispatch. Reset cancels pending actions and requires fresh neutral input. A hold is not repeated presses; reversal without neutral cancels the action.

| Default | Rotation (both signs) | Push | Pull |
|---|---|---|---|
| Center | .465 | .314 | .289 |
| Typical low–high | .349–.570 | .274–.354 | .180–.357 |
| Activation / release | .25 / .15 | .20 / .08 | .12 / .06 |

Timing defaults: `minPulseMs:35`, `maxPulseMs:650`, `neutralMs:25`, `doubleMs:400`; `dominance:1.4`. The double window is completion-to-completion. Both gesture axes must return below their release levels for neutral dwell.

`singleMode:'exclusive'` (default) waits before emitting a single so a double can replace it. `'immediate'` emits a single first and later an additive double; no undo is emitted. Prefer exclusive when actions must not both fire.

Low-level gates are `activation/release`, `pressActivation/pressRelease`, `twistActivation/twistRelease`, and `clockwiseActivation/clockwiseRelease` (likewise `counterclockwise`, `push`, `pull`). Precedence: direction → axis → shared → default tune. `createGestures({})` matches the no-argument form. Gates require `0 <= release < activation <= 1`; invalid options throw `RangeError`.

## Tunes

`createGestureTune(data?)` validates and copies a version-1 `GestureTuneData`: `{version, rotation, push, pull, timing, dominance}`. Each band contains `{center,low,high,activation,release}`; timing contains the four millisecond fields above. Returned objects are deeply frozen.

`defaultGestureTune` and `gesturePresets.default` are the baseline; `.soft` and `.hard` use 20% force adjustments. Methods `soften(x)`, `harden(x)`, `narrow(x)`, `widen(x)` return new tunes and never change timing. Amounts are fractions: .1 means 10%. Soften/narrow allow [0,1), harden/widen [0,10]. See [exact editing semantics](tuning.md#gesture-tunes).

`toOptions()` produces recognizer configuration. `toJSON()` produces frozen portable data. Restore parsed JSON with `createGestureTune(data)`; JSON alone has no methods. For nested edits, use a new object, e.g. `createGestureTune({...tune.toJSON(), timing:{...tune.timing,doubleMs:450}})`. Typical low/high are descriptive, not rejection cutoffs.

## Recording

`createGestureRecorder({startTimeMs,tune?,options?,source?,note?,maxDurationMs?,maxEntries?})` returns `input(input,time)`, `advance(time)`, `reset(time)`, `events(events)`, `snapshot(time)` and `full`. Explicit `options` takes precedence over tune. Source defaults to `'device'`; use `'simulator'` for generated input.

Input/tick/reset calls share a finite nondecreasing clock. Samples are copied. Default bounds are 120000 ms and 50000 entries (maximum configurable entries 60000); events cap at 10000. `full` signals a rejected timeline entry due to bounds; the app owns stopping and saving. Snapshot is detached, not a stop operation.

`GestureRecording` shape: `{version:1,source,note,durationMs,options,timeline,events}`. Timeline entries are `{type:'input',t,input}` or `{type:'advance'|'reset',t}`. All times, including stored event timestamps, are relative to capture start. `validateGestureRecording(recording)` checks version, duration and timeline shape/bounds/axis values; it is not exhaustive validation of every metadata field. Invalid recording input throws `RangeError`.

## Calibration

`calibrateGestures(recordingOrArray, settings?)` accepts 1–20 recordings. Settings: `minimumPerAction` integer 3–100 (default 3), `detectionFloor` (0,.1] (default .025), `pairGapMs` 50–500 (default 250).

Returns `{status,tune,counts,missing,stats,pulses,actions,issues}`. Status is `ready|incomplete|ambiguous`; **check `result.tune !== null` before using it** (the TypeScript interface is not a discriminated union). Counts use eight keys such as `clockwise.single` and `pull.double`. Stats hold per-direction peak count/mean/percentiles/min/max. Actions hold direction, kind, start, end, pulses and zero-based recording index. Pulses also expose peak, peakTime, valleyBefore and reset segment.

The parser infers actions from raw shape, independent of order and recognized event labels. Never claim counts are labeled accuracy. Separate captures/resets cannot form pairs. Repeated copies of a recording are NOT deduplicated by the SDK; the app must avoid duplicate evidence. See [calibration behavior](tuning.md#recording-and-custom-calibration).

## Graphs

`createGestureGraph(recording,tune?,{start?,end?,actions?,recordingIndex?}?)` returns `{start,end,lanes}`. Each of four lanes has direction/label, band values, `{t,value}` points and action spans. Times are capture-relative; values are positive magnitudes. Default tune is the baseline. A custom time window must be finite with `0 <= start < end`. For combined analysis, pass the matching `recordingIndex` (default 0).

`renderGestureGraphSvg(model,{width?,title?}?)` returns a standalone SVG string. Width defaults to 960, range 280–4000. Blue steps are held input, green dashed is activation, gray dotted is release, pale fill is typical range; shaded spans are inferred actions. Labels, title and description supplement color. Provide a text count/status summary alongside graphs in your UI. The model can also feed your own accessible chart renderer.

## WebHID lifecycle

`connectWebHid({onInput,onReset?,onDisconnect?,profile?,hid?,pauseOnBlur?})` returns a promise of connection or null on chooser cancellation. Connection exposes `device`, `pause()`, `resume()`, async `close()`. Default `pauseOnBlur:true` clears on blur/hidden. Pause/close/disconnect also clear; returning to foreground/resume requires a fresh report.

A clear calls `onInput(neutralInput)` then `onReset()`. For gestures, ignore that exact sentinel in onInput and reset the recognizer in onReset, so a lifecycle change cannot finish a press. Real zero reports are separate objects. Custom decoders should return fresh input objects for physical reports. Motion can consume the sentinel directly. Close removes listeners; your app must cancel its own frame loop.

`DeviceProfile` contains vendorId, productId, optional usagePage/usage, and `decode(reportId,data)`. An injected `hid` implements `HidAccess` for tests/custom transport integration. The default `combinedProfile` uses the verified IDs from the README. Do not infer additional device support from vendor ID alone.
