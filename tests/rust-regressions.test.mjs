import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  control,
  createPuck,
  neutralInput,
  EventOverflowError,
  createGestures,
} from "../dist/index.js";

const sample = (axes = {}) => ({ ...neutralInput, ...axes });
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

// A subprocess contains any native abort so the test can report the defect.
function native(lines) {
  const exe = process.platform === "win32" ? ".exe" : "";
  const libraryName =
    process.platform === "win32"
      ? "puck_ffi.dll"
      : process.platform === "darwin"
        ? "libpuck_ffi.dylib"
        : "libpuck_ffi.so";
  const runner = resolve(`target/parity/abi-runner${exe}`);
  const library = resolve(`target/release/${libraryName}`);
  assert.ok(
    existsSync(runner) && existsSync(library),
    "Build native parity tools before tests.",
  );
  const result = spawnSync(runner, [library], {
    input: lines.join("\n") + "\n",
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    `Native process failed (${result.signal ?? result.status}): ${result.stderr}`,
  );
  return result.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function definition(controls, conflicts = []) {
  const names = new Map(
    Object.entries(controls).map(([name, handle]) => [
      handle,
      `controls.${name}`,
    ]),
  );
  return {
    kind: "puck",
    options: {
      controls,
      conflicts: conflicts.map(({ prefer, over }) => ({
        prefer: names.get(prefer),
        over: over.map((h) => names.get(h)),
      })),
    },
  };
}

function runNative(config, commands) {
  const responses = native([
    `CREATE ${typeof config === "string" ? config : JSON.stringify(config)}`,
    ...commands.map(
      (command) =>
        `CALL ${typeof command === "string" ? command : JSON.stringify(command)}`,
    ),
    "DESTROY",
  ]);
  assert.equal(responses.length, commands.length + 2);
  for (const response of responses)
    assert.equal(response.ok, true, JSON.stringify(response));
  return responses.slice(1, -1).map((response) => response.value);
}

test("31 controls with disconnected precedence edges remain usable in WASM and the actual native library", () => {
  const controls = Object.fromEntries(
    Array.from({ length: 31 }, (_, i) => [
      `c${i}`,
      control.continuous("twist", { ownership: "observe", deadzone: 0 }),
    ]),
  );
  const conflicts = [
    { prefer: controls.c25, over: [controls.c14] },
    { prefer: controls.c8, over: [controls.c7] },
  ];
  const puck = createPuck({ controls, conflicts, clock: () => 0 });
  try {
    puck.feed(neutralInput, 0);
    puck.feed(sample({ rz: 0.5 }), 10);
    for (const handle of Object.values(controls)) close(puck.read(handle), 0.5);
  } finally {
    puck.dispose(10);
  }
  const outputs = runNative(definition(controls, conflicts), [
    { op: "feed", time: 0, input: neutralInput },
    { op: "feed", time: 10, input: sample({ rz: 0.5 }) },
    ...Object.keys(controls).map((name) => ({
      op: "read",
      control: `controls.${name}`,
    })),
  ]);
  for (const output of outputs.slice(2)) close(output.value, 0.5);
});

test("disconnected and transitive precedence produces deterministic event order across runtimes", () => {
  const controls = Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [
      `c${i}`,
      control.interaction({
        activation: "push",
        value: "tilt",
        ownership: "observe",
        releaseMs: 0,
      }),
    ]),
  );
  const conflicts = [
    { prefer: controls.c7, over: [controls.c2] },
    { prefer: controls.c2, over: [controls.c0] },
    { prefer: controls.c5, over: [controls.c1] },
  ];
  // Among controls whose incoming edges are satisfied, registration order wins.
  const expectedOrder = ["c3", "c4", "c5", "c1", "c6", "c7", "c2", "c0"];
  const commands = [
    { op: "feed", time: 0, input: neutralInput },
    { op: "feed", time: 10, input: sample({ z: 0.8, rx: 0.4 }) },
    { op: "feed", time: 20, input: sample({ z: 0.8, rx: 0.7 }) },
    { op: "feed", time: 30, input: neutralInput },
  ];
  function assertEvents(events) {
    for (const [index, type] of ["begin", "update", "commit"].entries()) {
      const group = events.slice(index * 8, (index + 1) * 8);
      assert.deepEqual(
        group.map((e) => e.control),
        expectedOrder.map((name) => `controls.${name}`),
      );
      assert.deepEqual(
        group.map((e) => e.type),
        Array(8).fill(type),
      );
      assert.deepEqual(
        group.map((e) => e.timestamp),
        Array(8).fill((index + 1) * 10),
      );
    }
    assert.equal(events.length, 24);
    assert.deepEqual(
      events.map((e) => e.sequence),
      Array.from({ length: 24 }, (_, i) => i + 1),
    );
  }
  let first;
  for (let repeat = 0; repeat < 3; repeat++) {
    const puck = createPuck({ controls, conflicts, clock: () => 0 });
    const cursor = puck.events();
    try {
      for (const command of commands) puck.feed(command.input, command.time);
      const names = new Map(
        Object.entries(controls).map(([name, h]) => [h, `controls.${name}`]),
      );
      const events = cursor.drain().map(({ control: h, ...event }) => ({
        ...event,
        control: names.get(h),
      }));
      assertEvents(events);
      if (first) assert.deepEqual(events, first);
      else first = events;
    } finally {
      puck.dispose(30);
    }
    const nativeEvents = runNative(
      definition(controls, conflicts),
      commands,
    ).flatMap((output) => output.events);
    assertEvents(nativeEvents);
    assert.deepEqual(nativeEvents, first);
  }
});

test("transitive precedence through an unrelated observer gives the preferred owner the first claim", () => {
  const controls = {
    lower: control.interaction({ activation: "push", value: "tilt" }),
    unrelated: control.continuous("twist", { ownership: "observe" }),
    bridge: control.continuous("slide", { ownership: "observe" }),
    winner: control.interaction({
      activation: "push",
      value: "tilt",
      ownership: "exclusive",
    }),
  };
  const conflicts = [
    { prefer: controls.winner, over: [controls.bridge] },
    { prefer: controls.bridge, over: [controls.lower] },
  ];
  const puck = createPuck({ controls, conflicts, clock: () => 0 });
  const cursor = puck.events();
  try {
    puck.feed(neutralInput, 0);
    puck.feed(sample({ z: 0.8, rx: 0.6 }), 10);
    assert.equal(puck.read(controls.winner).status, "active");
    assert.deepEqual(puck.read(controls.lower), { status: "inactive" });
    assert.deepEqual(
      cursor.drain().map((e) => [e.type, e.control]),
      [["begin", controls.winner]],
    );
  } finally {
    puck.dispose(10);
  }
  const outputs = runNative(definition(controls, conflicts), [
    { op: "feed", time: 0, input: neutralInput },
    { op: "feed", time: 10, input: sample({ z: 0.8, rx: 0.6 }) },
    { op: "read", control: "controls.winner" },
    { op: "read", control: "controls.lower" },
  ]);
  assert.deepEqual(
    outputs[1].events.map((e) => [e.type, e.control]),
    [["begin", "controls.winner"]],
  );
  assert.equal(outputs[2].value.status, "active");
  assert.deepEqual(outputs[3].value, { status: "inactive" });
});

test("self and transitive cycles return errors without crashing either runtime", () => {
  const controls = Object.fromEntries(
    ["a", "b", "c", "unrelated"].map((name) => [
      name,
      control.continuous("twist", { ownership: "observe" }),
    ]),
  );
  for (const conflicts of [
    [{ prefer: controls.a, over: [controls.a] }],
    [
      { prefer: controls.a, over: [controls.b] },
      { prefer: controls.b, over: [controls.c] },
      { prefer: controls.c, over: [controls.a] },
    ],
  ]) {
    assert.throws(
      () => createPuck({ controls, conflicts }),
      /Cyclic control precedence/,
    );
    const [response] = native([
      `CREATE ${JSON.stringify(definition(controls, conflicts))}`,
    ]);
    assert.equal(response.ok, false);
    assert.match(response.error, /Cyclic control precedence/);
  }
});

test("event retention uses the validated construction limit after the caller mutates options", () => {
  for (const mutatedLimit of [0, -1]) {
    const choose = control.interaction({
      activation: "push",
      value: "tilt",
      releaseMs: 0,
    });
    const options = { controls: { choose }, eventLimit: 2, clock: () => 0 };
    const puck = createPuck(options);
    const cursor = puck.events();
    options.eventLimit = mutatedLimit;
    try {
      puck.feed(neutralInput, 0);
      puck.feed(sample({ z: 0.8, rx: 0.3 }), 10);
      assert.deepEqual(
        cursor.drain().map((e) => e.type),
        ["begin"],
      );
      puck.feed(sample({ z: 0.8, rx: 0.5 }), 20);
      puck.feed(sample({ z: 0.8, rx: 0.7 }), 30);
      puck.feed(neutralInput, 40);
      assert.throws(
        () => cursor.drain(),
        (error) => error instanceof EventOverflowError && error.missed === 1,
      );
      const retained = cursor.drain();
      assert.deepEqual(
        retained.map((e) => e.type),
        ["update", "commit"],
      );
      assert.deepEqual(
        retained.map((e) => e.sequence),
        [3, 4],
      );
    } finally {
      puck.dispose(40);
    }
  }
});

test("nonfinite gesture reset times reject atomically and omitted reset still requires neutral", () => {
  for (const pressRotate of [false, true]) {
    const gestures = createGestures({ pressRotate });
    const untouched = createGestures({ pressRotate });
    for (const recognizer of [gestures, untouched]) {
      recognizer.update(neutralInput, 0);
      recognizer.update(sample({ z: -0.5 }), 10);
    }
    const active = gestures.state;
    assert.equal(active.phase, "active");
    for (const time of [NaN, Infinity, -Infinity]) {
      assert.throws(() => gestures.reset(time), RangeError);
      assert.deepEqual(gestures.state, active);
    }
    // Check hidden pulse/deadline state by completing the original gesture.
    assert.deepEqual(
      gestures.update(neutralInput, 100),
      untouched.update(neutralInput, 100),
    );
    const events = gestures.advance(600);
    assert.deepEqual(events, untouched.advance(600));
    assert.equal(events.length, 1);
    assert.equal(events[0].direction, "pull");
    assert.equal(events[0].kind, "single");
    assert.deepEqual(gestures.reset(), []);
    assert.equal(gestures.state.phase, "blocked");
    gestures.update(sample({ z: -0.5 }), 610);
    assert.equal(gestures.state.phase, "blocked");
    gestures.update(neutralInput, 620);
    gestures.update(sample({ z: -0.5 }), 630);
    assert.equal(gestures.state.phase, "active");
  }
});

test("raw JSON zero spellings have immediate native velocity through reversal, neutral, frames and configure", () => {
  const move = control.continuous("twist", {
    as: "velocity",
    deadzone: 0,
    speed: 1,
    responseMs: 0,
  });
  const controls = { move };
  const commands = [
    { op: "feed", time: 0, input: neutralInput },
    { op: "frame", time: 0 },
    { op: "feed", time: 10, input: sample({ rz: 0.5 }) },
    { op: "read", control: "controls.move" },
    { op: "frame", time: 20 },
    { op: "feed", time: 25, input: sample({ rz: -0.5 }) },
    { op: "read", control: "controls.move" },
    { op: "frame", time: 30 },
    { op: "feed", time: 35, input: neutralInput },
    { op: "read", control: "controls.move" },
    { op: "frame", time: 40 },
    { op: "feed", time: 45, input: sample({ rz: 0.25 }) },
    {
      op: "configure",
      time: 45,
      control: "controls.move",
      settings: { speed: 4, responseMs: 0 },
    },
    { op: "read", control: "controls.move" },
    { op: "frame", time: 55 },
    { op: "feed", time: 60, input: sample({ rz: -0.25 }) },
    { op: "read", control: "controls.move" },
    { op: "frame", time: 65 },
    { op: "feed", time: 70, input: neutralInput },
    { op: "read", control: "controls.move" },
    { op: "frame", time: 75 },
  ];
  const expectedReads = new Map([
    [3, 0.5],
    [6, -0.5],
    [9, 0],
    [13, 1],
    [16, -1],
    [19, 0],
  ]);
  const expectedFrames = new Map([
    [1, 0],
    [4, 0.005],
    [7, 0],
    [10, -0.0025],
    [14, 0.01],
    [17, 0],
    [20, -0.005],
  ]);
  function assertValues(outputs) {
    for (const [index, expected] of expectedReads)
      close(outputs[index].value, expected);
    for (const [index, expected] of expectedFrames)
      close(outputs[index].value.results["controls.move"], expected);
  }
  const puck = createPuck({ controls, clock: () => 0 });
  try {
    const outputs = commands.map((command) => {
      let value = null;
      if (command.op === "feed") puck.feed(command.input, command.time);
      else if (command.op === "configure")
        puck.configure(move, command.settings, command.time);
      else if (command.op === "read") value = puck.read(move);
      else {
        const frame = puck.frame(command.time);
        value = { results: { "controls.move": frame.integrate(move) } };
      }
      return { value };
    });
    assertValues(outputs);
  } finally {
    puck.dispose(75);
  }
  let baseline;
  for (const spelling of ["0", "0.0", "0e0", "-0.0"]) {
    // JSON.stringify would erase the decimal/exponent representation under test.
    const raw = (value) =>
      JSON.stringify(value).replace(
        /"responseMs":0(?=[,}])/g,
        `"responseMs":${spelling}`,
      );
    const outputs = runNative(raw(definition(controls)), commands.map(raw));
    assertValues(outputs);
    if (baseline) assert.deepEqual(outputs, baseline, spelling);
    else baseline = outputs;
  }
});
