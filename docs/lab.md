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
