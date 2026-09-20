# Puck

Six-axis input, responsive pan/zoom, and tunable single/double gestures for SpaceMouse applications. TypeScript, ESM, zero runtime dependencies. Your app owns its camera, rendering and storage.

**Version note:** these docs target 0.3.0. Gesture recognition, tunes, recording, calibration and graphs are included, with experimental APIs. See the [changelog](CHANGELOG.md) and [upgrade guide](docs/upgrading.md) when adopting updates.

## Start here

**[Open the Puck playground](https://clankagent.github.io/puck/)** — test all 24
gestures, reset detection counts, watch six-axis graphs, try pan/zoom, and record
or calibrate input. Works without hardware using simulated input. The public
site keeps recordings in your browser. [Playground guide](docs/playground.md).

| You want to… | Read |
|---|---|
| See what changed and adopt an update | [Changelog](CHANGELOG.md), [upgrade guide](docs/upgrading.md) |
| Connect a device and recognize gestures | [Complete browser integration](docs/quickstart.md) |
| Add smooth pan and zoom | [Motion and hardware](docs/motion.md), [camera arithmetic](examples/camera.mjs) |
| Set sensitivity or learn a personal tune | [Tunes, recording and calibration](docs/tuning.md) |
| Look up imports, methods, defaults or units | [API reference](docs/api.md) |
| Fix input or calibration problems | [Troubleshooting](docs/troubleshooting.md) |
| Integrate using an agent | [Agent integration guide](docs/agents.md), [plain-text index](llms.txt) |
| Try and record real input | [Gesture lab](docs/lab.md) |
| Understand the next release and 1.0 criteria | [Roadmap](docs/roadmap.md) |
| Add standalone or pressure-first tilts | [Push/pull + tilt](docs/press-tilt.md) |

For a registry release, install with `pnpm add @clankagent/puck`. For this checkout:

```sh
pnpm install
pnpm check
```

The build emits `dist/*.js` and matching TypeScript declarations. Examples use package imports; a bundler or browser import map must resolve them. No CommonJS build is provided.

```js
import { createGestures, gesturePresets } from '@clankagent/puck';

const tune = gesturePresets.default.soften(0.1).widen(0.15);
const gestures = createGestures(tune);
// Feed every report to update(input, time), and tick advance(time).
// See the complete integration for clocks, lifecycle and cleanup.
```

## What Puck owns

| Layer | Responsibility |
|---|---|
| Core `@clankagent/puck` | Decode reports; process motion and gestures; record samples; derive tunes. No browser globals, timers or storage. |
| Optional `/webhid` | Device chooser, reports and connection lifecycle. |
| Optional `/graph` | Gesture-family graph data and a standalone SVG renderer. |
| Your app | Render loop, action handling, camera, capture controls, persistence and UI. |

The verified device profile is vendor `0x256f`, product `0xc63a`, Bluetooth on Windows. Other layouts and physical buttons are not implemented. Gestures are **cap pulses**, not button clicks. See [hardware scope](docs/motion.md#hardware-scope) before adding a profile.

## Development

Use Node 24 and the pnpm version pinned in `package.json`. `pnpm check` builds and runs tests. Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing an API or device profile; [AGENTS.md](AGENTS.md) describes repository development constraints. [DESIGN.md](DESIGN.md) explains architecture and [VERIFICATION.md](VERIFICATION.md) records validation. MIT licensed.
