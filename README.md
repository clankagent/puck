# Puck

Typed physical controls for SpaceMouse applications: continuous six-axis motion,
discrete commands and persistent push/pull interactions. TypeScript, ESM and zero
runtime dependencies. Your application owns its camera, rendering and storage.

## Install

```sh
pnpm add @clankagent/puck@1.1.0
```

```ts
import { createPuck, control, recipes } from '@clankagent/puck';
import { connectPuck } from '@clankagent/puck/webhid';

const controls = {
  ...recipes.panZoom(),
  choose: recipes.directionSelection({
    activation: 'pull',
    cancel: { input: 'twist', direction: 'either' },
    ownership: { mode: 'exclusive', channels: 'all' },
  }),
};
const puck = createPuck({
  controls,
  conflicts: [{ prefer: controls.choose, over: [controls.pan, controls.zoom] }],
});
puck.on(controls.choose, event => {
  if (event.type === 'commit') console.log('Selected sector:', event.value);
});
// In a Connect button handler: const connection = await connectPuck(puck);
// In your render loop: const frame = puck.frame(performance.now());
// const [dx, dy] = frame.integrate(controls.pan);
// const zoomFactor = Math.exp(frame.integrate(controls.zoom));
// Teardown: stop the loop, await connection?.close(), then puck.dispose().
```

The palette owns input while open, so incidental motion cannot pan the canvas.
Use symmetric push or pull activation, choose a value by tilting, commit on
qualified release, or cancel with a completed twist. Applications decide what
the selected sector means. See the [complete browser quickstart](docs/quickstart.md).

## Try it

[Feature showcase](https://clankagent.github.io/puck/) ·
[32-outcome gesture tester](https://clankagent.github.io/puck/#tester) ·
[Debug workspace](https://clankagent.github.io/puck/#debug)

The playground uses the public SDK and recipes. It includes 3D navigation with
direction settings, 2D pan/zoom, square continuous-value plots, a compact radial
palette, held scalar/vector controls, contexts, generated code and synchronized
diagnostics. Device and simulator counts are separate. Captures stay local;
export before reloading or changing a structural definition.

## Documentation

| Task | Guide |
|---|---|
| Connect and clean up a browser application | [Quickstart](docs/quickstart.md) |
| Use the two SpaceMouse Wireless buttons | [Button events](docs/buttons.md) |
| Declare/read controls, sessions, ownership and settings | [Application API](docs/application-api.md) |
| Adopt 1.0 from 0.x | [Upgrade guide](docs/upgrading.md), [changelog](CHANGELOG.md) |
| Understand movement, units and device support | [Motion and hardware](docs/motion.md) |
| Tune gesture recognition | [Calibration](docs/tuning.md), [lab](docs/lab.md) |
| Use retained low-level processors | [Low-level API](docs/api.md), [tilt](docs/press-tilt.md), [press/rotate](docs/press-rotate.md) |
| Diagnose input or timing | [Troubleshooting](docs/troubleshooting.md), [playground guide](docs/playground.md) |
| Integrate with a coding agent | [Agent guide](docs/agents.md), [plain-text index](llms.txt) |
| Understand testing and future scope | [Verification](docs/v1-verification.md), [roadmap](docs/roadmap.md) |

## Boundaries

| Layer | Responsibility |
|---|---|
| Core | Typed controls, recognition, motion integration, contexts, ownership, inspection and bounded recording/replay. No browser globals or timers. |
| Optional /webhid | Device chooser, reports, interruptions and connectPuck deadline ticking. No rendering. |
| Optional /graph | Renderer-neutral control/gesture graph data and gesture SVG rendering. |
| Application | Camera transforms, menus, render loop, persistence and UI. |

The verified hardware profile is vendor 0x256f, product 0xc63a, Bluetooth on
Windows. Its two button report bits are supported by the optional WebHID adapter;
the physical left/right mapping remains unverified. Other layouts and models are
not implemented. Gestures are cap movements, not button clicks. WebHID requires
a supporting browser, a secure context and device permission; the core also
accepts custom transports.

Continuous values are normalized sensor deflections, not angles or distances.
Per-device continuous-motion calibration is not implemented. Gesture calibration
learns recognition thresholds and timing, not equal travel in every direction.
Existing 0.x low-level exports remain available in 1.0.

## Development

Use Node 24 and the pnpm version pinned in package.json. Run pnpm install and
pnpm check. The build emits ESM and TypeScript declarations; use a bundler or
import map in browsers. No CommonJS build is provided.

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before contributing.
[DESIGN.md](DESIGN.md) explains architecture and [VERIFICATION.md](VERIFICATION.md)
records checks. MIT licensed.
