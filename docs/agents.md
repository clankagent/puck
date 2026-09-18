# Agent integration guide

[Documentation](../README.md) · [API reference](api.md) · [Complete integration](quickstart.md)

This guide is for agents building applications with Puck. Repository contribution instructions live separately in [AGENTS.md](../AGENTS.md).

1. Read the README version note. Match docs to the installed package version and its exports/declarations; experimental checkout APIs may not exist in the registry release.
2. Read the API reference for exact entry points, axis signs, units and defaults. Use public imports only. Core is transport-independent; WebHID and graph rendering are optional.
3. Adapt the complete session example for gestures/recording, or the motion example for cameras. The application owns timers, rendering, persistence and teardown.
4. Verify behavior with synthetic inputs and the actual application lifecycle. Do not claim physical compatibility or subjective feel from synthetic tests.

## Integration invariants

- Six axes are normalized deflection, not velocity or angle. Verified signs: +rz clockwise, +z push down. Gestures are cap pulses, not physical button events.
- Feed every input report to the recognizer and recorder. Call advance during report silence. Use one monotonic millisecond clock; do not mix performance.now() reports with rAF-supplied gesture timestamps.
- Ignore the adapter's exact neutralInput lifecycle sentinel in the gesture report callback; reset on onReset. Do not infer a physical release on blur/disconnect. Reset requires fresh neutral to rearm.
- Exclusive singles intentionally wait for the double window. Immediate mode produces an additive single then double. Choose consciously.
- Tune edits return new immutable values. Persist JSON data; restore through createGestureTune. Rotation shares one band for both directions. Typical low/high are not acceptance limits.
- Calibration needs at least three instances of EACH of eight actions, in any order. Check tune for null, show missing/ambiguous results, and retain raw input for inspection. Deduplicate recordings before combining. Inferred counts are not labeled intent accuracy.
- No automatic backend, upload, storage or device reconnection is supplied. Never invent those capabilities or promise unverified hardware support.

## Verification checklist

Exercise a single, a double, neutral rearming, a long hold, a reversal, report silence, blur/disconnect and teardown. Confirm one action handler invocation per expected event and no completed gesture caused by disconnect. Check incomplete calibration and JSON tune restoration. Use performance.now() consistently in a browser and an explicit monotonic clock in deterministic tests.

For library contributions, run `pnpm check` from the source checkout. The tests use built ESM modules. Read CONTRIBUTING before proposing API/profile changes. Do not edit generated dist files as the source of truth.
