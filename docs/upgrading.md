# Upgrading and adopting updates

## From 0.5 to 1.0.0-dev.0

The unreleased preview adds the [application-facing API](application-api.md). Existing exports and defaults remain available; adoption is incremental. New application recordings/settings are distinct from legacy tune/recording formats. Continuous controls integrate actual report boundaries and use explicit velocity units; do not integrate raw deflection. The new runtime limits stalled-frame movement to the first configured interval while current velocity evolves through elapsed time. Declare overlapping ownership explicitly and forward lifecycle interruptions rather than synthetic releases. Evaluate from source or the browser preview; there is no npm prerelease.


[Changelog](../CHANGELOG.md) · [Documentation](../README.md) · [API reference](api.md)

## Identify the version first

Read the changelog for the version you are adopting, then use docs from that same tag or installed package. Main can contain unreleased features. `pnpm list @clankagent/puck` shows your app's installed version; its exports and declarations determine which APIs are available.

Gesture, tune, recording, calibration and graph APIs are included in 0.2.0. In your consuming app:

```sh
pnpm add @clankagent/puck@0.5.0
pnpm list @clankagent/puck
```

Commit your app's updated manifest and lockfile. Use the documentation shipped with that package or the v0.5.0 source tag. The new gesture APIs remain experimental; existing motion integrations retain their behavior.

To test future unreleased source, build a chosen revision with `pnpm install --frozen-lockfile`, `pnpm check` and `pnpm pack --pack-destination artifacts`, then install the generated tarball into your app with `pnpm add /path/to/package.tgz`. Record the source commit alongside it; a working-tree package version alone does not identify unreleased changes.

## From 0.4 to 0.5

Push/pull + clockwise/counterclockwise rotation is now enabled by default.
Handle the optional `rotation` field before ordinary pressure events. Update
exhaustive event-kind switches for `holdstart`, `holdend` and `holdcancel`.
A hold never also emits a tap. Forward events returned by `reset(now)` on blur,
pause, disconnect and close; `state.hold` is cleared immediately.

Use `{pressRotate:false}` to preserve 0.4 recognition. This option is independent
of tilt modes. Force thresholds reuse the current pressure/twist tune; hold timing
lives in options, not tune JSON. Recordings preserve the new event fields; older
recording readers may reject them despite the unchanged version-1 container.
Motion defaults and existing tilt calibration are unchanged. New rotation holds
are not automatically calibrated. See [integration and examples](press-rotate.md).

## From 0.3 to 0.4

Combined press/tilt and standalone rx/ry gestures are now enabled by default,
including with no options, an empty options object, or a restored tune. The demo
uses these same defaults. Existing consumers may receive additional gesture types;
route events with a `tilt` field before plain pressure actions. Pressure-first
movement can become combined; tilt-first movement stays standalone.

To retain the previous family selection, use
`createGestures({pressMode:'simple', standaloneTilt:false})`. Add those options
after spreading any tune options. Explicit per-direction modes still override
`pressMode`. Additive `singleMode:'immediate'` requires combined modes to be
disabled with `pressMode:'simple'` (or both per-direction modes set to simple).

Motion and WebHID defaults are unchanged. Tune and recording JSON remain version 1.
See [gesture modes](press-tilt.md) and the [changelog](../CHANGELOG.md).

## From 0.2 to 0.3

No new gesture family is enabled automatically. Add `standaloneTilt:true` for
rx/ry singles and doubles; add `pressMode:'auto'` or `'tilt'` for push/pull +
tilt combinations. Keep `singleMode:'exclusive'` when combined modes are enabled.
See the [tilt integration guide](press-tilt.md) for event examples, default gates,
freeform calibration and graphs. Feed every physical report and advance the clock
as before; camera arbitration remains application-owned.

`GestureDirection` now also includes four rx/ry directions. TypeScript consumers
with exhaustive direction maps must extend them, even if the feature stays off.
Use exported `PulseDirection` for APIs intentionally limited to the original four.
Combined events add an optional `tilt`; route those before handling plain pressure.
Tune version stays 1 with optional new fields; old tune JSON is supported.

## Existing pan/zoom applications

No migration is required for the new opt-in features: decoding, `createPanZoom` and `/webhid` behavior and defaults are unchanged from the original baseline. Keep your existing camera, input ownership and render loop.

## Add only what your app needs

| Goal | Add | Application responsibility |
|---|---|---|
| React to single/double gestures | `createGestures(tune)` | Feed every report, advance the same clock, reset on lifecycle changes, consume events. [Complete integration](quickstart.md) |
| Offer softer/harder controls | Presets and immutable tune methods | Retain the returned tune and create a new recognizer to apply it. [Tune editing](tuning.md#gesture-tunes) |
| Save a personal tune | `createGestureTune` | Save JSON; restore through the constructor. [Tune API](api.md#tunes) |
| Learn a tune from normal input | Recorder plus `calibrateGestures` | Own capture/storage; show missing/ambiguous evidence and apply only a non-null tune. [Calibration](tuning.md#recording-and-custom-calibration) |
| Explain the learned result | Optional `/graph` imports | Show a text status/count summary and select the matching capture for overlays. [Graphs](api.md#graphs) |

To add gestures alongside motion, reuse the existing connection and frame loop. Fan physical reports out to both processors. Ignore the exact `neutralInput` lifecycle sentinel for gestures and reset both processors in `onReset`. Use `performance.now()` in both gesture report and frame callbacks. The [session example](../examples/gesture-session.mjs) demonstrates lifecycle handling; adapt it to your existing connection/loop rather than starting duplicate ones.

## Behavior to choose explicitly

- **Single versus double:** exclusive singles wait for the double window. Immediate mode is additive: a double also produces the earlier single. It does not undo an action.
- **Gesture versus camera:** both processors may react to the same movement. Your app decides whether a gesture tool pauses camera motion or permits both.
- **Applying a tune:** changing a variable does not retune an existing recognizer. Replace the recognizer or reconnect the example session with the new tune; pending actions are discarded and fresh neutral is required.
- **Calibration quality:** require three singles and three doubles in each direction. Group order does not matter. Closely spaced singles can look like a double; inferred counts are not labeled accuracy. Avoid duplicate captures as new evidence.
- **Data versions:** package versions are separate from tune/recording `version: 1`. Validate restored data through public APIs; do not manually change a format version to bypass validation.

Before shipping, check a single, double, held input, neutral rearming, blur/disconnect and teardown. Check JSON restoration and incomplete calibration if used. [Troubleshooting](troubleshooting.md) maps common symptoms to fixes.

Unreleased preview correction: semantic tilt now uses [-ry, rx] (right/down positive), including direction selection and held values. Raw axes/rotation are unchanged. Six-axis translation defaults to 600 units/s; held vectors to 2, held twist remains 1. These changes are not yet published to npm.


Unreleased 3D profile correction (2026-09-21): sixAxis now uses positive x/y translation and negative rz rotation to match the physically confirmed navigation. Standalone continuous sources and panZoom are unchanged. Existing explicit scale overrides retain their meaning.
