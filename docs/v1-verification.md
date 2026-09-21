# Puck 1.0 verification

Release 1.0.0 was explicitly approved on 2026-09-21 after hands-on testing of the
application playground and review of a real-device browser performance trace.
Approval does not expand the supported hardware profile or prove every possible
interaction sequence. The supported profile remains 256f:c63a, Bluetooth/Windows.

## Automated coverage

137 tests plus public TypeScript fixtures cover:

- Existing 32 recognizer outcomes and all 28 discrete typed gesture outcomes.
- Symmetric push/pull activation, held values, release qualification, no-selection
  behavior, sticky direction memory, single/double cancellation and interruptions.
- Ownership, contexts, fresh-neutral rearming and modal movement suppression.
- Report-boundary integration, held input, multiple frame rates and stalled frames.
- Settings validation, bounded cursors, trace retention, recording/replay, graphs
  and the optional WebHID lifecycle/deadline bridge.
- Tilt direction/sign symmetry, confirmed 3D recipe/profile agreement, all six
  inversion controls, both example zoom mappings and generated code declarations.

Release checks additionally pack the exact version, install the tarball in a clean
consumer, verify public entry points and documentation, run tag CI, and repeat
the consumer checks against the published npm version. See [release procedure](../RELEASING.md).

## Browser and physical evidence

Browser checks covered desktop/390px layouts, startup/reset defaults, code snippets,
compact radial selection, cancellation retaining the current value, modal pan/zoom
suppression, separate simulator/device counts, settings and diagnostic exports.

Physical feedback confirmed the corrected tilt directions, 2D pan/zoom and held
scalar behavior, usable pull-and-tilt selection and the final 3D directions. The
confirmed navigation profile reverses sideways, forward/back and twist relative
to the initial demo; it is shared with the public sixAxis recipe.

A roughly 34-second performance capture of continuous-value interaction contained
1,061 device callbacks (maximum 0.283 ms). Excluding startup/reload, animation
callbacks ran near 144 Hz, with p95 duration 0.390 ms and maximum 1.325 ms. The
longest main-thread task in that period was 9.302 ms. The large initial spikes
were profiler startup and browser-extension initialization. This is one measured
interaction, not an all-feature or long-duration performance certification.
Private traces and recordings are not included in the package or repository.

## Limits

- Continuous tilt is normalized and shaped, not per-device calibrated. Equal raw
  magnitudes are symmetric; equal physical effort may not yield equal readings.
- No additional hardware layouts or physical buttons are claimed.
- The short trace shows no obvious runaway memory growth but cannot rule out a
  long-duration leak. Diagnostic recordings are bounded and consume memory.
- Hardware comfort, unusual mixed gestures and other browser/platform combinations
  still require application testing. Gesture calibration is family-specific.
- The optional playground recording extension named preview contains diagnostic
  snapshots; it is application data, not part of the core recording contract.

The playground is a demonstration application. Its camera, drawing, menus and
plot renderer are not a framework or built-in application UI in the SDK.
