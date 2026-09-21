# unreleased v1 preview verification

The application-facing SDK is an **unreleased v1 preview** (development version 1.0.0-dev.0). npm remains at 0.5.0. Automated checks do not establish hardware comfort or compatibility.

**Release gate:** the user must test with their real physical controller and explicitly approve release before any release tag, GitHub release or npm publication, including prereleases. Fixes must be retested before approval. Preview deployment supports testing and is not a release.

Automated checks cover the existing 32 recognition outcomes and compatibility
APIs; all 28 discrete outcomes through typed declarations; both pressure directions;
hold/release/cancel lifecycles; selection memory and absence; double cancellation;
ownership and rearming; clocks and report-boundary integration; 30/60/144 Hz;
settings and contexts; independent cursors; trace retention; recording/replay;
renderer-neutral graphs; and the optional WebHID bridge.

Public TypeScript fixtures check inferred vectors, rates, selection commit values
and errors for invalid reads, event subscriptions, raw-value integration and
structural settings changes. Tests consume built JavaScript/declarations.

Browser checks cover command detection, both push/pull selection, single/double
twist cancellation, held adjustment, counters, reset, real speed settings and
responsive layout. The package artifact must also pass a clean tarball install
before publication and a clean registry install afterward.

Before any v1 release, the user must test with a supported physical controller:
full six-axis movement and speed settings, gestures and held controls,
selection comfort while maintaining pressure, incidental twist rejection,
double-cancel usability, and unintended activation during ordinary movement.
The supported profile remains 256f:c63a on the previously verified transport;
no additional device compatibility is claimed.

## Playground coverage and physical testing

The public root now opens the feature showcase. `#tester` opens all 32 gesture
outcomes; `#debug` opens the same live session's diagnostics. `controls.html`
remains a supported entry point. The prior playground is retained at `legacy.html`
and the calibration tools remain at `lab/`.

| Public capability | Preview exercise |
| --- | --- |
| Six-axis velocity and frame integration | 3D navigation, translation/rotation speeds, response and deadzone |
| Pan/zoom recipe | 2D floor plan with anchored zoom |
| Nine continuous sources | Continuous values source selector |
| Deflection / velocity / direction | Interpretation selector; direction offers sectors, hysteresis and memory |
| Singles, doubles, standalone tilt, pressure + tilt/twist, holds | 32-outcome tester with instructions, snippets and independent device/simulator counts |
| Push/pull interaction lifecycle | Display-style menu, release-to-commit, empty selection policy |
| Single and double cancellation | Menu cancellation settings: single, same-direction double, either-direction double, none |
| Held scalar/vector rates | Held scalar and Held vector examples; activation/combination lifetime |
| Hold and release qualification | Interaction settings, explicit lifecycle exercise |
| Contexts, conflicts, observe, neutral rearming | Contexts & ownership example; Debug routing table |
| Subscriptions, event cursor, inspection and explanation | Results, Debug event evidence and independent cursor drain |
| Runtime settings and restore | Live settings, export/restore and generated current declarations |
| Interrupt / pause / explicit cancel / WebHID lifecycle | Lifecycle example, Debug controls and device connection |
| Recording, replay and graph data | Debug export/load, shared graph time window and scrubber |
| Tuning, calibration and compatibility APIs | Linked calibration lab and legacy playground |

The optional `preview` property on exported SDK recordings contains the last
30 seconds of browser diagnostic snapshots, raw reports, report gaps and event
evidence. It is not part of the SDK recording contract. Plain SDK recordings
still replay; their graphs show raw reports and available interval-average
movement, and explicitly identify missing live diagnostic snapshots. Freeze
copies the displayed window while recognition continues. Device reports and
simulator samples never share tester counts.

The renderer uses a stable target-orbit camera, perspective projection and
normalized quaternion orientation. These are application rendering conventions,
not a new SDK motion processor. The camera tests check pivot preservation,
orientation normalization, camera-relative pan, dolly limits and neutral stopping.
The user's controller testing must still establish mapping, feel and usability.

## Physical-feedback corrections, 2026-09-21

133 automated tests and the public TypeScript fixtures pass. Regression coverage
checks the four physical tilt directions through deflection, velocity, integrated
values and symmetric selection recipes, raw-channel preservation, camera roll,
cancellation state, and 2D palette ownership. Browser checks confirmed left/up
mapping, six distinct axis rows, compact palette, explicit cancellation retaining
ink color, View/Edit mode selection and a 390px layout without page overflow.

The user's hardware observations established the prior tilt swap/sign error.
The correction is in the SDK: tilt = [-ry, rx]. Raw rotation and axes are unchanged.
Three-dimensional translation now defaults to 600 units/s; held vectors to 2.
Pan/zoom and held-scalar defaults remain unchanged. Settings explain their effects;
menu and ownership examples now use a 2D canvas, leaving 3D navigation six-axis.
Completed-twist cancellation now displays its recognition/centering state.

These corrections still require the user's physical retest. No release approval
has been given. No package publication, release tag or prerelease is authorized.

## Navigation preferences and rendering follow-up, 2026-09-21

135 tests and public type fixtures pass. Added coverage runs all six SDK axis
inversions through both camera zoom mappings and verifies modal push/pull palettes
suppress pan and zoom. Existing alternative shared-pan ownership remains tested.
Browser checks confirmed SDK inversion in the generated snippet, all-channel
suppression in inspection, a stationary drawing under incidental simulated pan,
and 240 x 240 vector plots on desktop and a 390px phone viewport.

Before optimization, a sustained simulated menu hold measured frame work p95
1.0 ms and frame interval p95 17.3 ms, with no gaps over 50 ms in that interval.
Afterward, quiet intervals measured roughly 0.4–0.7 ms work; Debug around 2.8 ms,
with frame intervals around 17.4 ms. These are spot measurements on the agent VM,
not a hardware stress test or proof that the user's severe intermittent stalls
are resolved. DOM rebuilding and unnecessary idle rendering were removed; the
preview now retains foreground frame-stall counts for a physical retest.

Only preview deployment is authorized. Physical feel and intermittent performance
remain subject to user testing; there is no release approval.

## Confirmed 3D direction profile, 2026-09-21

The user physically confirmed reversing sideways pan, forward/backward and twist
as their expected 3D setup. Preserve those switches on by default, all others off.
The public sixAxis recipe now supplies the same signed scales without requiring
application overrides. A regression checks recipe/profile agreement, processed
outputs and unchanged raw input/2D settings. A second checks continuous tilt's
symmetry at equal signed raw magnitudes through the default deadzone and curve.
137 tests and public type fixtures pass.

Unequal travel under physical tilt is reported but not measured in a device
capture. No calibration coefficients were guessed. Gesture tuning does not
calibrate continuous input. The release gate remains in force.
