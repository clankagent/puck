# Gesture lab

[Documentation](../README.md)

Run from a source checkout; the lab server is not shipped in the npm package.

## Local gesture lab

```sh
pnpm build
pnpm lab
```

The example demonstrates the same public SDK: freeform recording, automatic
calibration, minimum-example coverage, reusable tune JSON, immutable adjustments,
and inspectable graphs. Choose **Analyze saved recording**, then select an action
to zoom into it. **Use this tune** applies the result to live input. The default,
soft and hard presets are also available. Recordings can be combined to supply
missing examples; replaying the same saved ID does not duplicate its evidence.

The example server binds to loopback. Recordings stay outside the repository in
the user's local application data directory under `Puck/recordings`
(`PUCK_RECORDINGS_DIR` overrides it), and are not in the npm package. Apps should
provide their own storage. This example uses a same-origin session token for
writes, no CORS and no user authentication: keep it on loopback or behind a
trusted private proxy. Failed saves retain a retry/download backup. `pnpm
lab:analyze` reads the newest device recording, or accepts a JSON file path.

## Combined-gesture research

Open the lab with `?capture=press-move` for freeform push-move/pull-move capture.
Use natural pressure, including relaxation while rotating or tilting the cap.
Aim for three examples per push/pull × movement direction, plus ordinary single and
double presses for comparison; no required order or guided sequence. Multiple
captures are fine if two minutes is too short.

The recorder saves all six raw axes regardless of existing recognition gates.
The combined-tilt parser shows eight-direction coverage and six lanes for
pressure and tilt. Its tune preserves the base simple/double-press settings.
See the [combined gesture guide](press-tilt.md) and [1.0 criteria](roadmap.md).

For standalone tilt research, use `?capture=tilt`. Record at least three
singles and three doubles for each of the four rx/ry directions, without
deliberate push/pull or twist. Any order is fine. These captures are marked
separately and await standalone analysis rather than entering the combined
gesture tuner.

## Verify capture before starting

Connect the device and move the cap once. Start recording remains disabled
until an actual device movement report arrives. During capture the report and
movement counts must rise when you move; all six axes are retained independently
of the gesture gates. Captures without movement are not saved as usable
recordings. Disconnect ends and saves a partial capture if movement was received.
The download backup remains available even for an empty diagnostic capture.

Simulator recording is only enabled explicitly with `?source=simulator` (or
`&source=simulator` after an existing query). It is labeled as simulator input
and is not physical calibration evidence. Reload after lab updates; a reload
requires reconnecting the device.
