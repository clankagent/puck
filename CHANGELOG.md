# Changelog

User-facing changes, compatibility impact, and links for adopting them. **Unreleased** describes source on main, not an available npm version. Package versions and tune/recording JSON format versions are independent.

## 0.3.0 — 2026-09-19

- Added opt-in [standalone rx/ry singles and doubles and push/pull + tilt](docs/press-tilt.md).
  Combined modes support pressure relaxation and preserve ordinary doubles.
  Faster execution is accepted; timing allowances are upper bounds.
- Added `calibrateTilts`, `calibratePressTilts`, matching graph constructors,
  and immutable, serializable tuning fields. Each family needs three examples
  of its eight action types; freeform order and multiple captures are supported.
- Updated the lab with automatic family detection, an explicit analysis selector,
  standalone controls, per-action inspection and reusable tune export.
- Fixed empty/disconnected captures being accepted as usable recordings. Partial
  captures survive disconnect; simulator capture requires explicit test mode.
- Defined [1.0 readiness criteria](docs/roadmap.md). APIs remain experimental.

Existing gesture behavior is unchanged unless enabled. The TypeScript direction
union expands and combined events have an optional tilt field; see the
[upgrade guide](docs/upgrading.md#from-02-to-03). Tune/recording format stays 1,
and old tune JSON is supported. [Compare versions](https://github.com/clankagent/puck/compare/v0.2.0...v0.3.0).

## 0.2.0 — 2026-09-19

### Added

| Feature | What it enables | Integration docs |
|---|---|---|
| Four-direction single/double cap gestures | Clockwise, counterclockwise, push down and pull up actions | [Browser quickstart](docs/quickstart.md), [event and timing API](docs/api.md#gestures) |
| Immutable gesture tunes | Shared rotation thresholds, independent push/pull thresholds, default/soft/hard presets and chainable edits | [Tune guide](docs/tuning.md#gesture-tunes), [tune API](docs/api.md#tunes) |
| Bounded recording SDK | Capture reports, clock ticks, resets and events using the app's storage | [Session example](examples/gesture-session.mjs), [recording API](docs/api.md#recording) |
| Automatic custom calibration | Infer a tune from freeform captures with three examples of each of eight actions, in any order | [Calibration guide](docs/tuning.md#recording-and-custom-calibration), [result handling](docs/api.md#calibration) |
| Optional graph entry point | Four direction lanes, inferred action spans and an accessible SVG renderer | [Graph guide](docs/tuning.md#graphs-for-consuming-applications), [graph API](docs/api.md#graphs) |
| Source-only gesture lab | Record, combine captures, inspect actions, edit tunes and export JSON | [Run the lab](docs/lab.md) |
| User and agent documentation | API reference, troubleshooting, complete integration and a plain-text index | [Documentation index](README.md#start-here), [agent guide](docs/agents.md), [llms.txt](llms.txt) |

### Compatibility and adoption

- Existing `createPanZoom`, decoding and WebHID APIs/defaults are unchanged from the original 0.1.0 source baseline. Existing motion integrations need no migration for these additions.
- Gesture APIs are experimental and opt-in. The app still owns its clock, render loop, actions and storage. Adding gestures does not automatically bind actions or suppress pan/zoom.
- Exclusive singles wait for the double window; immediate mode emits a single followed by an additive double. Choose deliberately.
- Tune and recording JSON formats start at `version: 1`. Restore tunes through `createGestureTune`; handle a null calibration tune before applying results.
- Hardware scope is unchanged. Cap gestures do not add physical button decoding or support for unverified devices.

**Adopt the update:** [Upgrade and integration guide](docs/upgrading.md). [Source comparison with the original baseline](https://github.com/clankagent/puck/compare/f065d4a...v0.2.0).

## Original 0.1.0 source baseline

This is a source-history reference, not a claim that an npm release was published on a particular date.

- Normalized six-axis decoding for the verified combined report profile.
- Frame-independent pan/zoom with held input, neutral stopping and application-owned camera/rendering.
- Optional WebHID connection, foreground lifecycle resets and cleanup.
- ESM and TypeScript declarations, no runtime dependencies.

[Baseline source](https://github.com/clankagent/puck/tree/f065d4a) · [Motion behavior and hardware](docs/motion.md)
