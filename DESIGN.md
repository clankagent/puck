# Architecture and release preparation

The product goal is to make responsive six-axis interaction easy to implement correctly. Correct defaults and clear ownership matter more than exposing many switches.

## Boundaries

The core consumes normalized deflection and frame timestamps. It produces screen-space pan deltas and a multiplicative zoom factor. It does not own a view transform, renderer, event loop, browser or device. Incoming reports update a held sample; they never directly advance a camera.

The optional WebHID adapter decodes one verified device profile, handles explicit device permission and connection lifetime, and forwards samples. It clears input on interruption. A consuming application can pause input when a modal/tool takes ownership, or use the core with another transport entirely.

The example camera demonstrates the application boundary: apply the zoom multiplier within app limits, preserve the chosen screen-space anchor using the actual clamped zoom ratio, then apply pan deltas in pixels. This avoids accidentally scaling pan speed with zoom or moving the zoom anchor when a limit is reached.

## Defaults backed by the working prototype

Six-axis combined report: six signed little-endian words, logical range ±350. Device profile 256f:c63a. Clockwise twist and downward pressure zoom in. Independent pan/zoom deadzones .05/.1; acceleration response 25 ms; full pan speed 1320 px/s; full log-zoom speed 1.5/s. Integrate the response analytically over elapsed frame time. Neutral stops without coasting; reversal discards old-direction response. Cap unusually long frame integration at 50 ms; do not expire held input based on report silence.

These are verified defaults for the tested hardware and interaction. They are not a claim that every device uses the same report layout or that everyone prefers the same axis directions.

## Package shape

One ESM TypeScript package, core and `/webhid` exports, no runtime dependencies. Emitted declarations use explicit `.js` relative specifiers and a Node-compatible module resolution mode. Tests import built output, keeping package behavior visible outside the compiler. A renderer can use the core without importing browser glue. [TypeScript library compilation guidance](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html#im-writing-a-library), [WebHID lifecycle and reports](https://developer.chrome.com/docs/capabilities/hid).

## Release scope

Puck ships a core and an optional WebHID adapter. No website, renderer or server
is part of the library. The first release documents the measured hardware scope
and distinguishes prototype physical testing from extracted-adapter tests.

## Tune and calibration API

Tune data is immutable, versioned JSON with shared rotation and independent
push/pull force bands. Method edits copy rather than mutate and do not affect
timing. Gesture recording is a bounded transport-independent utility; apps
retain responsibility for storage and permissions. Calibration consumes raw
samples independently of the old recognizer event log or the order of action
groups, and requires three examples per action. Uncertain trains and missing
coverage cannot produce a ready tune.

The optional /graph export provides renderer-neutral data and a standalone SVG
renderer. It draws four unsigned direction lanes instead of overlaying two
signed axes and four gates. It owns no DOM, camera, subscriptions or frame loop.
The lab adds selection/zoom and tune editing as application responsibilities.
