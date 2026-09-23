# Agent integration guide

Use the [application API](application-api.md) and [browser quickstart](quickstart.md)
for new Puck 1.0 integrations. Match documentation to the installed version.
Repository contribution rules are in [AGENTS.md](../AGENTS.md).

- Import only the root, /webhid and /graph entry points. Core owns no DOM or timer.
- Declare typed continuous, gesture or interaction controls. Read values, subscribe
  to occurrences and integrate only velocity-valued controls with puck.frame().
- Use connectPuck for browser delivery/lifecycle/deadlines. Custom transports feed
  every report and advance with one monotonic millisecond clock. Interrupt on
  blur/disconnect; do not synthesize a release that commits a selection.
- On the measured Wireless profile, use the optional WebHID `onButton` callback
  for numbered button down/up/cancel events. Button reports are separate from
  cap gesture controls; see [button integration](buttons.md).
- Raw axes are normalized deflection, not angles. +z is push and +rz clockwise
  for the verified profile. Semantic tilt is [-ry,rx], right/down positive.
- The sixAxis recipe uses x/y/z positive, rx/ry positive and rz negative scales;
  these navigation preferences do not alter raw sources or gesture directions.
- Declare contexts and preferences for overlapping exclusive ownership. A modal
  canvas palette can claim all channels; ordinary 3D navigation uses all six axes.
- Handle begin/update/commit/cancel. Cancelled interactions never commit. Release
  qualification and fresh-neutral rearming are deliberate behavior.
- Persist application settings/recordings separately from legacy gesture tunes
  and gesture recordings. Use their matching restore/replay APIs; observe bounds.
- Gesture calibration learns thresholds/timing for its selected family. It does
  not provide continuous-motion calibration or establish labeled intent accuracy.
- Camera transforms, rendering, storage, UI and reconnect policy belong to the app.

Retained low-level createGestures integrations must advance during report silence
and process holdstart/holdend/holdcancel as well as single/double events. Ignore
the exact neutralInput lifecycle sentinel in onInput and reset via onReset or
onInterrupt. See [low-level API](api.md) and [press/rotate](press-rotate.md).

Exercise neutral rearming, report silence, release/cancel, ownership changes,
blur/disconnect, teardown and settings restoration in the consuming application.
Synthetic tests do not establish hardware compatibility. Read CONTRIBUTING.md
before new public APIs or profiles. Run pnpm check; never edit generated dist as
the source of truth.
