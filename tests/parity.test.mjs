import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as reference from "./reference/dist/index.js";
import * as current from "../dist/index.js";
import { RustEngine, coreCall } from "../dist/rust.js";
import { gestures, sequence } from "../examples/playground/model.js";
const plain = (x) => JSON.parse(JSON.stringify(x));
function equivalent(a, b, path = "$") {
  if (typeof a === "number" && typeof b === "number") {
    if (
      /\.(timestamp|durationMs|sequence|sessionId|start|end|time|t|startedAt)$/.test(
        path,
      )
    ) {
      assert.equal(a, b, path);
      return;
    }
    assert.ok(
      Math.abs(a - b) <= 1e-11 * Math.max(1, Math.abs(a), Math.abs(b)),
      `${path}: ${a} != ${b}`,
    );
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    assert.equal(Array.isArray(a), Array.isArray(b), path);
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), path);
    for (const k of Object.keys(a)) equivalent(a[k], b[k], `${path}.${k}`);
    return;
  }
  assert.equal(a, b, path);
}
const zero = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
const cases = [];
function compare(config, commands, expected) {
  const engine = new RustEngine(config.kind, config.options);
  const outputs = commands.map((c) =>
    plain(
      engine.call(
        c.op,
        Object.fromEntries(Object.entries(c).filter(([k]) => k !== "op")),
      ),
    ),
  );
  engine.dispose();
  equivalent(outputs, expected);
  cases.push({ config, commands, expected });
}
test("frozen TypeScript and Rust WASM agree on every catalog sequence and seeded timing noise", () => {
  for (const preset of Object.values(reference.gesturePresets))
    for (const g of gestures) {
      const options = preset.toOptions(),
        old = reference.createGestures(options);
      const commands = [],
        expected = [];
      for (const r of sequence(g)) {
        commands.push({ op: "update", input: r.input, time: r.t });
        expected.push(old.update(r.input, r.t));
        commands.push({ op: "state" });
        expected.push(old.state);
      }
      commands.push({ op: "advance", time: 2000 });
      expected.push(old.advance(2000));
      compare({ kind: "gestures", options }, commands, expected);
    }
  let seed = 0x5eed;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let trial = 0; trial < 24; trial++) {
    const options = {
      ...reference.gesturePresets[trial % 2 ? "soft" : "hard"].toOptions(),
      pressMode: trial % 3 ? "auto" : "simple",
      singleMode: trial % 3 ? "exclusive" : "immediate",
      pressRotate: trial % 4 !== 0,
    };
    const old = reference.createGestures(options),
      commands = [],
      expected = [];
    let time = 0;
    for (let i = 0; i < 250; i++) {
      time += Math.floor(random() * 100);
      const op = i % 41 === 0 ? "reset" : i % 7 === 0 ? "advance" : "update";
      const input = Object.fromEntries(
        Object.keys(zero).map((k) => [
          k,
          random() < 0.5 ? 0 : Math.round((random() * 2 - 1) * 350) / 350,
        ]),
      );
      const c = { op, time, ...(op === "update" ? { input } : {}) };
      commands.push(c);
      expected.push(op === "update" ? old.update(input, time) : old[op](time));
      commands.push({ op: "state" });
      expected.push(old.state);
    }
    compare({ kind: "gestures", options }, commands, expected);
  }
});
test("motion integrals match frozen TypeScript across rates, reversal and source changes", () => {
  for (const responseMs of [0, 1, 25, 100]) {
    const options = { responseMs },
      old = reference.createPanZoom(options),
      commands = [],
      expected = [];
    for (let i = 0; i < 600; i++) {
      if (i % 13 === 0) {
        const input = {
          ...zero,
          x: Math.sin(i) * 0.8,
          y: Math.cos(i) * 0.7,
          z: i % 2 ? 0.5 : -0.5,
          rz: i % 3 ? -0.7 : 0.7,
        };
        old.setInput(input);
        commands.push({ op: "input", input });
        expected.push(null);
      }
      if (i % 111 === 0) {
        const source = i % 2 ? "twist" : "press";
        old.setZoomInput(source);
        commands.push({ op: "zoom", source });
        expected.push(null);
      }
      commands.push({ op: "step", time: (i * 1000) / 144 });
      expected.push(old.step((i * 1000) / 144));
    }
    compare({ kind: "motion", options }, commands, expected);
  }
});
function runtimeScenario(api) {
  const controls = {
    move: api.control.continuous("axes", {
      as: "velocity",
      speed: { translation: 2, rotation: 3 },
    }),
    command: api.control.gesture("pull"),
    choose: api.recipes.directionSelection({
      activation: "pull",
      ownership: { mode: "exclusive", channels: "all" },
    }),
  };
  const contexts = {
    other: {
      selection: api.recipes.directionSelection({
        activation: "push",
        ownership: "observe",
      }),
    },
  };
  const options = {
    controls,
    contexts,
    conflicts: [
      { prefer: controls.choose, over: [controls.move, controls.command] },
    ],
    trace: true,
    record: true,
    eventLimit: 16,
    clock: () => 0,
  };
  return { controls, contexts, options };
}
test("control runtime parity includes routing, deadlines, integration, configuration and trace evidence", () => {
  const { controls, options } = runtimeScenario(reference);
  const old = reference.createPuck(options),
    cursor = old.events();
  const name = (h) => Object.entries(controls).find(([, v]) => v === h)?.[0];
  const def = old.recording().definition;
  const config = {
    kind: "puck",
    options: { ...def, trace: true, record: true },
  };
  const commands = [],
    expected = [];
  const record = (c, fn) => {
    commands.push(c);
    const value = fn();
    const events = cursor.drain().map((e) => {
      const evidence = old.explain(e).evidence;
      return {
        ...plain(e),
        control: `controls.${name(e.control)}`,
        ...(evidence ? { evidence: plain(evidence) } : {}),
      };
    });
    expected.push({ value: value ?? null, events });
  };
  const feed = (time, input) =>
    record({ op: "feed", time, input: { ...zero, ...input } }, () =>
      old.feed({ ...zero, ...input }, time),
    );
  feed(0, {});
  record({ op: "frame", time: 0 }, () => {
    const f = old.frame(0);
    return {
      start: f.start,
      end: f.end,
      results: { "controls.move": f.integrate(controls.move) },
    };
  });
  for (const [t, input] of [
    [10, { x: 0.8 }],
    [17, { z: -0.8, rx: 0.6 }],
    [31, { z: -0.8, ry: 0.5 }],
    [42, {}],
    [80, {}],
    [90, { x: 0.6 }],
    [97, { x: -0.4 }],
    [110, {}],
  ]) {
    feed(t, input);
    record({ op: "inspect" }, () => old.inspect());
  }
  record({ op: "frame", time: 120 }, () => {
    const f = old.frame(120);
    return {
      start: f.start,
      end: f.end,
      results: { "controls.move": f.integrate(controls.move) },
    };
  });
  record(
    {
      op: "configure",
      time: 125,
      control: "controls.move",
      settings: { speed: 4 },
    },
    () => old.configure(controls.move, { speed: 4 }, 125),
  );
  record({ op: "interrupt", time: 130, reason: "pause" }, () =>
    old.interrupt("pause", 130),
  );
  record({ op: "context", time: 140, context: "other" }, () =>
    old.setContext("other", 140),
  );
  record({ op: "recording" }, () => old.recording());
  record({ op: "settings" }, () => old.settings());
  compare(config, commands, expected);
  old.dispose(140);
});
test("tunes, decode and raw calibration agree with the frozen implementation", () => {
  const commands = [],
    expected = [];
  const add = (c, e) => {
    commands.push(c);
    expected.push(plain(e));
  };
  for (const data of Object.values(reference.gesturePresets).map((t) =>
    t.toJSON(),
  )) {
    add({ op: "tune", data }, data);
    add(
      { op: "tuneOptions", data },
      reference.createGestureTune(data).toOptions(),
    );
    for (const edit of ["soften", "harden", "narrow", "widen"])
      for (const amount of [0, 0.1, 0.9])
        add(
          { op: "tuneEdit", data, edit, amount },
          reference.createGestureTune(data)[edit](amount).toJSON(),
        );
  }
  for (const g of gestures) {
    const rows = sequence(g).map((r) => ({
      type: "input",
      t: r.t,
      input: r.input,
    }));
    const recording = {
      version: 1,
      durationMs: 2000,
      timeline: rows,
      events: [],
      options: {},
      note: "synthetic",
      source: "simulator",
    };
    for (const op of [
      "calibrateGestures",
      "calibratePressTilts",
      "calibrateTilts",
    ])
      add(
        { op, recordings: recording, settings: {} },
        reference[op](recording),
      );
  }
  for (let sign of [-1, 1]) {
    const bytes = new Uint8Array(12);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < 6; i++)
      view.setInt16(i * 2, sign * (i * 100 - 250), true);
    add(
      { op: "decode", reportId: 1, bytes: [...bytes] },
      reference.decodeCombinedReport(1, view),
    );
  }
  const capture = (tilt = false) => {
    let t = 0;
    const timeline = [{ type: "input", t, input: zero }];
    for (const direction of ["clockwise", "counterclockwise", "push", "pull"])
      for (const kind of ["single", "double"])
        for (let trial = 0; trial < 3; trial++) {
          const axis =
              direction === "push" || direction === "pull"
                ? tilt
                  ? "ry"
                  : "z"
                : tilt
                  ? "rx"
                  : "rz",
            sign = ["push", "clockwise"].includes(direction) ? 1 : -1;
          for (let p = 0; p < (kind === "double" ? 2 : 1); p++)
            for (const strength of [0.05, 0.49, 0.7, 0.42, 0]) {
              t += strength === 0.05 ? 80 : 40;
              timeline.push({
                type: "input",
                t,
                input: { ...zero, [axis]: strength * sign },
              });
            }
          t += 800;
          timeline.push({ type: "advance", t });
        }
    return {
      version: 1,
      durationMs: t + 100,
      timeline,
      source: "simulator",
      note: "synthetic",
      events: [],
      options: {},
    };
  };
  for (const [op, recording] of [
    ["calibrateGestures", capture()],
    ["calibrateTilts", capture(true)],
  ]) {
    const expected = reference[op](recording);
    assert.equal(expected.status, "ready");
    add({ op, recordings: recording, settings: {} }, expected);
  }
  let t = 0;
  const timeline = [{ type: "input", t, input: zero }];
  for (const g of gestures.filter((g) => g.tilt))
    for (let i = 0; i < 3; i++) {
      for (const row of sequence(g)) {
        timeline.push({ type: "input", t: t + row.t, input: row.input });
      }
      t += 2200;
    }
  const combined = {
    version: 1,
    durationMs: t,
    timeline,
    source: "simulator",
    note: "synthetic",
    events: [],
    options: {},
  };
  const result = reference.calibratePressTilts(combined);
  assert.equal(result.status, "ready");
  add(
    { op: "calibratePressTilts", recordings: combined, settings: {} },
    result,
  );
  compare({ kind: "utilities", options: {} }, commands, expected);
});

test("bounded recorder snapshots and timestamps match frozen TypeScript", () => {
  const options = {
      startTimeMs: 100,
      maxDurationMs: 1000,
      maxEntries: 6,
      note: "synthetic",
    },
    old = reference.createGestureRecorder(options),
    commands = [],
    expected = [];
  const add = (op, data, fn) => {
    commands.push({ op, ...data });
    expected.push(fn() ?? null);
  };
  for (let i = 0; i < 8; i++) {
    const time = 100 + i * 100;
    add("input", { time, input: { ...zero, rz: i / 10 } }, () =>
      old.input({ ...zero, rz: i / 10 }, time),
    );
    add("full", {}, () => old.full);
    add("snapshot", { time }, () => old.snapshot(time));
  }
  compare({ kind: "recorder", options }, commands, expected);
});
test("native Rust and the actual DLL/shared library match the same golden outputs", () => {
  // check builds these first; missing binaries are failures, never silent skips.
  const exe = process.platform === "win32" ? ".exe" : "";
  const dll =
    process.platform === "win32"
      ? "puck_ffi.dll"
      : process.platform === "darwin"
        ? "libpuck_ffi.dylib"
        : "libpuck_ffi.so";
  const native = resolve(`target/release/examples/parity${exe}`),
    runner = resolve(`target/parity/abi-runner${exe}`),
    library = resolve(`target/release/${dll}`);
  assert.ok(
    existsSync(library) && existsSync(native) && existsSync(runner),
    "Build native parity tools before tests.",
  );
  const input =
    cases
      .flatMap((c) => [
        `CREATE ${JSON.stringify(c.config)}`,
        ...c.commands.map((r) => `CALL ${JSON.stringify(r)}`),
        "DESTROY",
      ])
      .join("\n") + "\n";
  const expected = cases.flatMap((c) => [
    { ok: true, value: null },
    ...c.expected.map((value) => ({ ok: true, value })),
    { ok: true, value: null },
  ]);
  console.log(
    `Differential corpus: ${cases.length} engines, ${cases.reduce((n, c) => n + c.commands.length, 0)} result/state comparisons per implementation.`,
  );
  for (const [program, args] of [
    [native, []],
    [runner, [library]],
  ]) {
    const result = spawnSync(program, args, {
      input,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(result.status, 0, result.stderr);
    equivalent(
      result.stdout
        .trim()
        .split("\n")
        .map((s) => JSON.parse(s)),
      expected,
    );
  }
});
