# Puck playground

[Open the playground](https://clankagent.github.io/puck/) · [Application API](application-api.md)

This is the Puck 1.0 demonstration and debugging application. It runs the public SDK and recipes; camera transforms, drawing and UI belong to the application. See [verification scope](v1-verification.md) for tested hardware and limitations.

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
  in radians per second. Camera orientation uses normalized quaternions. The physical-test-confirmed default enables Reverse sideways pan, Reverse forward / backward, and Reverse twist; the other three reversals stay off. Choose lift/press zoom instead, or independently reverse all six physical motions. Inversions use SDK scale settings; choosing the zoom gesture belongs to the application camera.
- **2D pan & zoom:** slide to pan, twist to zoom around the viewport center.
- **Continuous values:** select any public source and supported interpretation.
  Direction is available for slide and tilt; configure sectors, memory and
  hysteresis. Velocity provides a frame-integrated rate; raw deflection does not.
- **Push / pull menu:** either pressure direction opens a compact ink-color palette on the 2D drawing. Tilt
  highlights a choice; qualified pressure release applies it. Single or double completed twists can cancel while pressure stays held; cancellation leaves the existing ink color unchanged.
- **Held scalar / vector:** pressure keeps the session open while twist or tilt
  drives an integrated value. Compare activation and combination lifetimes.
- **Contexts & ownership:** compare View (pan/zoom only) with Edit (pan/zoom plus palette). The open palette owns all channels, so incidental translation cannot move the drawing. The observer continues to see input. Debug shows actual
  owners, suppression and the fresh-neutral rearming requirement.
- **Cancel & interrupt:** hold indefinitely using a device or simulator buttons,
  then explicitly cancel, interrupt or switch context. No cancellation commits.

Connect a supported SpaceMouse using the header button. Simulator controls disable
while connected. Without hardware, the buttons and six manual sliders feed real
input samples through the SDK; they do not fabricate recognition events. Focus
loss interrupts the session. Speed changes update the live runtime; structural
changes such as source, interpretation or cancellation policy start a new capture.
Export a capture before changing its structure. Restore defaults resets the
playground's settings and starts a fresh runtime.

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
and movement rate normalized to configured speed. Numeric rates use world units/s and radians/s in 3D, or pixels/s and log zoom/s on the canvas. Other plots show occurrences, report delivery gaps and the selected
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
browser playground; the public replay API remains available to applications.

Settings export/restore uses the public versioned format. Restoring validates
against the current definition. A file cannot silently change control structure.

## Calibration and compatibility

The [calibration lab](https://clankagent.github.io/puck/lab/) provides presets,
force/timing settings, labeled physical recordings and calibration analysis.
The [legacy playground](https://clankagent.github.io/puck/legacy.html) is retained
for compatibility testing; see its [guide](legacy-playground.md). Lab recordings
use browser IndexedDB; the new playground's current session stays in memory until
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
Website deployment and npm publication are separate operations; see RELEASING.md.



### Navigation conventions and frame diagnostics

[Blender's NDOF documentation](https://docs.blender.org/UATEST/manual/en/dev/editors/preferences/input.html)
describes object-in-hand navigation, forward/back versus up/down zoom, and
independent pan/rotation inversions. The playground exposes those direction choices;
it does not claim to reproduce every Blender navigation mode or pivot policy.
[Onshape's documentation](https://cad.onshape.com/help/Content/Plans/my_account_preferences.htm)
refers SpaceMouse setup to the device's own settings rather than specifying a
separate universal mapping. The playground reads WebHID directly and does not inherit
settings from the desktop 3Dconnexion driver.

Both vector displays use a square plot with equal signed-axis travel. Menu
movement locking is declared with exclusive ownership of all channels and explicit
precedence over pan/zoom. Other applications may choose narrower ownership.

Motion renders on animation frames; plots redraw at 10 Hz, while processed
samples remain at roughly 30 Hz and raw device reports retain their timestamps.
Static drawing geometry, menu items and axis rows are retained instead of rebuilt.
Unchanged examples skip rendering. Manual slider displays refresh only while open.
Debug reports recent frame work/interval p95, retained foreground stalls and worst
gap. JavaScript work excludes browser paint; frame interval includes scheduling.
These measurements are separate from the device report-gap graph. Hidden-tab gaps
are excluded. Capture export still retains raw input and diagnostic snapshots.

Settings export also includes the playground's camera zoom-axis preference; SDK
settings contain the six axis scales. Import validates the playground preference.


### Confirmed 3D profile (2026-09-21)

Physical user testing confirmed the three reversal switches above as the expected
3D navigation. They are now startup/reset defaults, recorded in navigationDefaults
and regression-tested against the public sixAxis recipe. The recipe uses translation
scales x=+1, y=+1, z=+1 and rotation scales rx=+1, ry=+1, rz=-1. Raw sources, tilt,
2D pan/zoom and gestures are unchanged. The switches retain their existing meaning
relative to the initial development preview so saved preferences are not silently reinterpreted.

Unequal continuous tilt travel remains an open calibration observation. The
[API calibration notes](application-api.md#motion-calibration-versus-gesture-tuning)
distinguish sensor normalization, continuous shaping and gesture calibration.
