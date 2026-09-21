# Puck playground

[Open the preview](https://clankagent.github.io/puck/) · [Application API](application-api.md)

This is an **unreleased v1 preview** for hands-on testing. It runs the repository's
actual SDK; the npm package is still 0.5.0. A preview deployment is not a release.
The user's physical-controller testing and explicit approval are required before
any v1 publication, including prereleases.

## Examples

Choose a feature in the left navigation. Each example has a physical instruction,
visible result, relevant settings, simulator buttons and generated application
code. The complete declaration is generated from the live runtime's definitions
and current settings. Navigation starts with public `recipes.sixAxis()` defaults;
2D motion uses `recipes.panZoom()` defaults. Application-specific camera, menu,
zoom limits and drawings belong to the example, not the recognizer.

- **3D navigation:** screen-relative pan, forward/back dolly and orbit around a
  visible pivot. Fit / reset view restores the camera. Translation speed is world
  units per second; rotation speed is displayed in degrees and passed to the SDK
  in radians per second. Camera orientation uses normalized quaternions.
- **2D pan & zoom:** slide to pan, twist to zoom around the viewport center.
- **Continuous values:** select any public source and supported interpretation.
  Direction is available for slide and tilt; configure sectors, memory and
  hysteresis. Velocity provides a frame-integrated rate; raw deflection does not.
- **Push / pull menu:** either pressure direction opens a style chooser. Tilt
  highlights a choice; qualified pressure release applies it. Single or double
  twist can cancel; cancellation leaves the existing style unchanged.
- **Held scalar / vector:** pressure keeps the session open while twist or tilt
  drives an integrated value. Compare activation and combination lifetimes.
- **Contexts & ownership:** compare navigation-only context with a menu that
  suppresses movement. The observer continues to see input. Debug shows actual
  owners, suppression and the fresh-neutral rearming requirement.
- **Cancel & interrupt:** hold indefinitely using a device or simulator buttons,
  then explicitly cancel, interrupt or switch context. No cancellation commits.

Connect a supported SpaceMouse using the header button. Simulator controls disable
while connected. Without hardware, the buttons and six manual sliders feed real
input samples through the SDK; they do not fabricate recognition events. Focus
loss interrupts the session. Speed changes update the live runtime; structural
changes such as source, interpretation or cancellation policy start a new capture.
Export a capture before changing its structure. Restore defaults resets the
preview's settings and starts a fresh runtime.

## Gesture tester

[Open the tester](https://clankagent.github.io/puck/#tester).

All 32 catalog outcomes are enabled through `createGestures()` defaults: 16 plain
single/double outcomes, eight pressure + tilt outcomes and eight pressure + twist
tap/hold outcomes. Select a tile to see its instructions and code, then perform
the action or use **Simulate selected gesture**. Simulator and device counts are
separate and persist when switching between the two. Reset all counts clears
both banks. Each tile starts gray at zero and turns green on first detection.
Hold counters increment at holdstart; holdend and holdcancel appear in Debug.

## Debug workspace

[Open Debug](https://clankagent.github.io/puck/#debug), or select **Inspect this
example**. Moving between an example and Debug preserves its live session.

The six axis panels share a time window: raw report values, observer deflection
and movement rate normalized to configured speed. Numeric rates are world units/s
or radians/s. Other plots show occurrences, report delivery gaps and the selected
scalar/vector output. The routing table displays the SDK's current context,
ownership and suppression. Select an event for `puck.explain()` evidence, or scrub
to inspect a sample. Catalog occurrences identify their legacy recognizer origin.

**Focus graphs** keeps the plots together on desktop. Freeze takes a retained
snapshot of the display while recognition continues. Scrub or change the window
for all plots together. Return to live discards the replay/frozen view.

Pause input, explicit cancellation and interruption are available for lifecycle
testing. The independent cursor can be drained without consuming subscriptions.

## Recordings and settings

Export a recording before reloading the page or creating a new capture. Nothing
is uploaded. The public SDK recording includes input and timeline operations.
An optional preview extension retains the last 30 seconds of browser diagnostic
snapshots and event evidence. Loading it shows those saved graphs without altering
the live runtime. Plain SDK recordings replay too, with explicit indications of
which diagnostic snapshots are unavailable. Very large files are rejected by the
browser preview; the public replay API remains available to applications.

Settings export/restore uses the public versioned format. Restoring validates
against the current definition. A file cannot silently change control structure.

## Calibration and compatibility

The [calibration lab](https://clankagent.github.io/puck/lab/) provides presets,
force/timing settings, labeled physical recordings and calibration analysis.
The [legacy playground](https://clankagent.github.io/puck/legacy.html) is retained
for compatibility testing; see its [guide](legacy-playground.md). Lab recordings
use browser IndexedDB; the new preview's current session stays in memory until
export. Neither format is automatically uploaded.

WebHID requires a supporting desktop browser and device permission. The current
adapter's supported profile remains 256f:c63a. Simulator checks do not establish
additional hardware compatibility or subjective physical feel.

## Development

```sh
pnpm install
pnpm check
pnpm site:build
pnpm site:serve
```

Open `http://127.0.0.1:47827/puck/`. The build copies an explicit public asset list
and the compiled SDK into ignored `site/`. Main deploys to GitHub Pages after CI.
No release tag or npm publication is part of deploying this preview.
