# Legacy Puck playground

[Open the legacy demo](https://clankagent.github.io/puck/legacy.html) · [Documentation](../README.md)

This guide covers the retained compatibility playground. The [main preview](playground.md) has the new application-facing examples and debugging workspace.

The public demo runs entirely in the browser, served from GitHub Pages. No
account, installation or device is required to try simulated input.

The public site runs the same SDK as the package version shown in its header.
The initial 2D movement configuration
uses `createPanZoom()` defaults, and the tester uses `createGestures()` without
overrides. Regression tests compare the demo output and displayed motion defaults
with unconfigured SDK instances. Speed/profile changes are explicit overrides.

Default gesture mode enables all 32 types, including standalone tilt and combined
press/tilt and press/rotate taps and holds, just as in the library. Explicitly disabled tiles say why;
the coverage denominator counts the currently enabled types. Restore gesture
defaults returns to unconfigured SDK behavior. The public calibration lab also
starts with the same all-family defaults as the local lab and library.

The 3D object renderer and camera limits are example-application behavior, not
additional SDK defaults. Copy movement settings produces the actual `createPanZoom`
setup needed in a consuming project, with only the changed SDK options.

## Gesture tester

The board covers 32 emitted gesture types: eight twist/press singles and doubles,
eight standalone tilt singles and doubles, eight push/pull + tilt singles, and
eight push/pull + rotation tap/hold outcomes.
Each starts gray at zero. The first recognized event turns it green and marks
it Detected; subsequent events increment the count. Reset clears the counters,
event history, live traces and pending recognition. Counts last for this page
session. Changing the count source starts a fresh test; changing the force
profile keeps counts until reset.

Click a tile to feed a timed sequence through the real SDK. This is synthetic
input, not a claim of physical validation. Lower simulator force may fall below
the selected tune's gates and produce no event. Device-only counting excludes
all simulated events. Connecting hardware selects device-only mode and clears
the board. On disconnect, device counts remain until reset or source change.

Manual buttons support hold and release. With focus outside form controls,
arrow keys twist/push/pull, W/S and A/D tilt, and I/K/J/L pan. Shift adds push
to a tilt; Alt adds pull where the browser/OS does not reserve that shortcut.
Focus loss clears input and cancels pending recognition. Keyboard Enter or Space
also activates gesture tiles. Combined gestures emit singles, not doubles.

## Continuous movement

Movement opens first, with live settings beside the view. Set pan speed (px/s),
zoom speed (log units/s), movement/zoom deadzones, acceleration response and the
maximum integrated frame interval. The numeric inputs and sliders control the
same values. Changes apply immediately to held input, without resetting the view.
Zero speed disables that movement. Restore movement defaults resets settings;
Reset view recenters the view. Copy movement settings exports the configuration.
Gesture force profiles and movement settings are independent.

Switch between **2D pan / zoom** and **3D · all six axes**. The 2D view uses
the public SDK pan/zoom controller. The 3D view is a consuming-app example built
with the SDK integrators: x/y/z move an isometrically projected object and rx/ry/rz
rotate it about fixed axes. It is not an added 3D camera API. The 3D view has
separate translation (units/s), rotation (degrees/s) and rotation-deadzone settings.
Neutral stops immediately in both views, even with a long acceleration response.

Test buttons send one second of simulated input. Under **Hold manual input /
combine axes**, six sliders can hold and mix continuous deflections. Release all
zeros them, and focus loss cancels them. These simulator controls disable while
hardware is connected; movement settings remain editable. Output graphs scale
to the selected speeds and frame cap. Raw input graphs below remain independent
of speeds, deadzones and recognition.

## Signals and motion graphs

All six raw axes have signed traces. A separate event timeline shows singles,
doubles and combined gestures. Freeze pauses graph rendering while recognition
continues. The motion example demonstrates pan and anchored, bounded zoom using
the SDK's controller; its graph shows pan deltas and log-zoom per frame. Reset
view restores the camera. Select twist or pressure as the zoom source.

## Recording and calibration

Open Record & tune for the full lab. Hardware requires WebHID in a supporting
desktop browser (Chrome or Edge) and explicit device permission. The current
adapter only supports the documented 256f:c63a profile. Experimental recognition
still needs testing on real devices and users' actual movements.

On the public site, recordings are stored in IndexedDB in that browser. Nothing
is uploaded. Clearing browser site data removes them; download a backup to keep
a portable JSON copy. If browser storage fails, the capture remains available
for retry or download. Recording capacity depends on browser storage limits.

Enable simulator recording using the link in the recording panel. The simulated
gesture selector covers every family. Record three examples of each of a
family's eight actions, choose its Analyze family, inspect actions individually,
then use or export the tune. The Graph family selector shows twist/press,
pressure + tilt, or standalone tilt activation and release thresholds.

## Develop and deploy

```sh
pnpm install
pnpm check
pnpm site:build
pnpm site:serve
```

Open `http://127.0.0.1:47827/puck/`. The `/puck/` prefix exercises project-relative
links. The build copies an explicit set of public assets into ignored `site/`;
server code and private recordings are excluded. The Pages workflow tests,
builds and deploys main. The site uses the repository's built SDK. The website
and lab server are not shipped in the npm package.

## Press + rotate

The four pressure/rotation combinations each have a tap tile and a hold tile.
A hold increments its counter once at holdstart; holdend/holdcancel appear in the
event history and timeline without another count. The live hold indicator shows
elapsed time, twist strength and pressure. Use Shift with a manual twist button
or arrow key for push; Alt for pull. Keep it held, then release. Continuous
movement still uses the motion SDK; gesture recognition does not move the camera.
See [hold lifecycle](press-rotate.md).
