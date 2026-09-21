# Local preparation checks

## 1.0.0-dev.0 application API

125 automated tests and public TypeScript fixtures pass. A clean tarball consumer exercised all three public entry points, symmetric push/pull selection, six-axis/continuous motion, replay and graph data. Browser verification covered commands, both selection directions, single/double cancellation, held adjustment, counter reset and replay of a recording from the installed package. Desktop and 390px viewport checks passed after fixing file-picker overflow. The original playground was checked with public-recipe six-axis movement. No new physical-device comfort testing was performed; see [preview scope](docs/v1-verification.md).


- TypeScript build and 13 tests pass. Tests cover report bounds/signs, zero and non-motion handling, frame-rate independence, held input through report gaps, reversal, zoom-axis switching, snapshots, render-owned zoom anchors/limits, adapter pause/resume/disconnect, foreground interruption and cleanup.
- A separate local comparison against the working prototype evaluated 3,558 frames at 60, 144 and 240 Hz, both zoom mappings, neutral/reversal and mixed-axis input. Pan and camera zoom matched exactly (maximum difference zero). The comparison harness remains outside this package.
- Packed artifact installs into a separate ESM TypeScript consumer. Both public entry points resolve, declarations type-check, and importing the adapter in Node does not access browser globals. The packed artifact contains emitted code/declarations, package metadata and README; original captures and workspace documentation are excluded.
- The extracted adapter has not yet been exercised with physical hardware. Physical testing established the report layout and motion defaults in a prototype; adapter lifecycle coverage is currently synthetic.
- Package name: @clankagent/puck. License: MIT. Publication status is available from GitHub releases and the npm registry.

## Gesture experiment (2026-09-18)

- `pnpm check`: 26 tests pass. Added four-direction single/double coverage,
  additive behavior, completion-window boundaries, pulse limits, hysteresis,
  neutral dwell, reversal rejection, dominance, cancellation, timestamp validation,
  report bursts, frame-rate independence, and WebHID lifecycle cancellation.
- Browser QA over HTTPS: pointer double rotation, keyboard single pull, preset
  changes, save/restore comparison, and clear history verified. Zero minimum
  pulse/dwell were used for instantaneous automation; balanced defaults restored.
- Desktop and 390px phone layouts visually inspected. Input trace and threshold
  lines render; event table fits the phone layout.
- Fixed mixed report/rAF clock timestamps by using performance.now() in both
  callbacks. Lifecycle neutral sentinels cancel rather than complete gestures.
- At this stage the gesture work was a local experiment. Later SDK and delivery
  verification is recorded below; inferred replay does not establish subjective feel.

## Freeform recording (2026-09-18)

- Recording is the first section. No guided capture or prescribed gesture order.
- Stores input reports, frame timing, resets and detected events; settings locked
  during capture, two-minute cap, retry/download fallback, and saved session list.
- 29 tests pass, including schema validation, session-token enforcement,
  save/list/readback, and deterministic replay.
- Browser simulator recording was saved and then read directly by the analysis
  CLI. Replayed double matched the recorded event; a pending final single was
  reported correctly. Simulator evidence is not physical gesture calibration.
- User feedback: vertical push/pull activation should be lower than rotation.
  Capture raw data first, then infer suitable separate thresholds from natural use.

## Direction threshold refinement

- Added validated axis/direction overrides without changing existing defaults.
- Lab has one symmetric rotation gate and independent push/pull gates.
- Recording tuned preset uses rotation activation/release .25/.15, push .20/.08,
  pull .12/.06, neutral dwell 25 ms, and double window 400 ms.
- 33 tests pass. Synthetic regressions cover gentle vertical input, independent
  signs, cross-axis pressure during twist, partial release and invalid thresholds.
- Physical freeform replay yields 18 doubles and 17 singles under the candidate
  profile. These are inferred gesture groups, not ground-truth accuracy labels.

## Reusable tune / calibration SDK

- Added immutable versioned tune objects, default/soft/hard presets, fractional
  soften/harden/narrow/widen transformations and JSON restoration. Missing
  recognizer configuration now uses the complete default tune consistently.
- Added bounded recording independent of transport, browser, timers and storage.
- Added raw-shape calibration, independent of recorded event labels and action
  ordering. At least three of each of eight actions are required; incomplete or
  ambiguous evidence produces no tune. Multiple recordings can be combined;
  reset/session boundaries prevent accidental pairing.
- 42 tests pass, including shuffled action groups, ambiguity, missing evidence,
  immutable transforms, JSON round trips, recording bounds, default parity and
  graph output. Existing pan/zoom, decoding and lifecycle tests continue to pass.
- The physical freeform capture passes all eight quotas; the automatically
  generated tune reproduces 18 double and 17 single actions on replay. This is
  consistency with inferred intent, not a claim of labeled accuracy.
- Browser QA: analyze saved capture, zoom a double, soften/reset/apply tune,
  deduplicate combined captures, desktop/phone graph inspection. Mobile graph
  labels and width were adjusted after visual inspection.

## Documentation and repository delivery (2026-09-18)

- 43 tests pass, including the public integration example's recording lifecycle,
  pending-action cancellation and frame cleanup.
- README navigation, API reference, browser integration, calibration guide,
  troubleshooting and agent guidance are included in the packed artifact.
- Checked 48 relative documentation links. Package inspection confirms docs and
  reusable examples ship, while the lab server and raw recordings stay excluded.
- Gesture APIs remain experimental and are not yet an npm release. Source delivery
  includes the gesture lab; captured device recordings remain outside the repository.

## 0.3 gesture scope

Synthetic tests cover four standalone directions, singles/doubles, brief neutral
valleys, pressure-first vs tilt-first ownership, reversals, holds, lifecycle
resets, multi-capture calibration and graph overlays. Combined recognition was
replayed against physical freeform input at original, 2× and 3× timestamps;
39 inferred combinations and four plain actions were preserved. The original
35-action simple reference remained unchanged with both families enabled.
Two standalone captures supply at least three inferred singles and doubles per
direction; interrupted/outlying excursions are excluded. Inferred labels are
not ground truth or an accuracy score. No new hardware compatibility is claimed.
Ordinary pan/zoom false-positive rates and multi-session robustness remain
1.0 validation work. Raw captures and user metadata are not distributed.

## Rebuilt preview QA — 2026-09-21

- 129 automated tests and the public TypeScript fixtures pass. Four new tests
  cover camera behavior and reconstruction of displayed control declarations.
- Browser simulator detected all 32 catalog outcomes through real SDK samples.
  Device counts remained zero. Reset clears both independent banks.
- Browser checks: push/pull menu commit; single and same-direction double cancel;
  scalar and vector holds; explicit interrupt/cancel; context ownership suppression;
  observer visibility; independent event cursor; continuous direction / axes;
  2D zoom; keyboard speed editing and settings export/restore.
- Exported browser recording replayed with diagnostic snapshots and evidence.
  Graph focus shows all six axes plus occurrence, timing and output plots at once
  on desktop. Freeze captures its own retained window while the SDK keeps running.
- Desktop and 390px / 320px phone layouts inspected. Fixed SVG hidden-state
  reflection and moved simulator controls next to the scene so actions and
  results remain together. No horizontal page overflow at either phone width.
- No new physical-device tests performed. No release is approved by this QA.

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
