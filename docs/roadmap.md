# Toward Puck 1.0

[Documentation](../README.md) · [Changelog](../CHANGELOG.md)

1.0 means the public contracts and interaction behavior are dependable enough
for applications to adopt without chasing API changes. It does not mean every
SpaceMouse model or every possible gesture is supported.

## 0.3: tilt families, still experimental

0.3 adds push/pull + rx/ry tilt and standalone tilt singles/doubles, with
explicit arbitration and ordinary doubles preserved. Defaults use freeform
physical evidence, supplemented by synthetic boundary tests. This is enough
for an experimental release, not for 1.0: next evaluate unintended activations
during ordinary pan/zoom, repeat sessions, and real application adoption.
The contracts and calibration heuristics remain open to refinement.

## Requirements for 1.0

- **Stable contracts:** settle event shapes, press modes, tune editing and
  persisted recording/tune formats. Define backward-compatible restoration and
  errors, and publish a migration guide for any pre-1.0 changes.
- **Predictable interactions:** cover boundary timing, mixed gestures, diagonal
  input, incidental cross-axis motion, holds, reversals, report silence,
  cancellation and double presses. Identical reports must produce identical
  events regardless of render cadence.
- **Physical evidence:** evaluate ordinary and combined gestures on real
  recordings, including unintended activations during pan/zoom. Separate
  inferred intent from known intended actions; publish the tested scope and
  remaining uncertainty without shipping private captures.
- **Honest calibration:** provide useful coverage and ambiguity feedback for
  every gesture family advertised as automatically tunable. Do not treat the
  existing eight-action calibration as evidence for directional gestures.
- **Usable integration:** ship complete browser and transport-independent
  examples, typed configuration, accessible recording graphs, lifecycle tests,
  and clear guidance for keeping gesture actions and camera movement exclusive.
- **Release reliability:** verify CI, the packaged documentation and public
  exports, then install and exercise the actual registry release. Keep changelog
  entries linked to adoption documentation.

Additional device profiles, physical buttons, framework adapters and built-in
rendering are not prerequisites. Add them only for concrete, verified use cases.
Until these requirements are met, keep gesture APIs experimental and use 0.x
releases to refine them. There is no date-based promise for 1.0.
