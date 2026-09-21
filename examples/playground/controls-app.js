import { codeControl } from "./showcase-code.js";
import {
  createPuck,
  control,
  recipes,
  motionDefaults,
  neutralInput,
  createGestures,
  replayPuck,
} from "../../dist/index.js";
import { connectWebHid } from "../../dist/webhid.js";
import { createControlGraph } from "../../dist/graph.js";
import { axes, gestures, key, title, sequence } from "./model.js";
import {
  cameraHome,
  moveCamera,
  drawScene,
  navigationDefaults,
  navigationScale as profileScale,
} from "./navigation.js";
const $ = (id) => document.getElementById(id);
const examples = {
  navigation: [
    "3D navigation",
    "CONTINUOUS INPUT",
    "Navigate in 3D",
    "Explore a mechanical assembly with screen-relative pan, forward/back dolly and rotation around the crosshair.",
    "Slide sideways to pan, lift/press for vertical pan, and slide forward/back to zoom. Tilt and twist to rotate.",
    "All six axes work together. Release the cap to stop. Fit view returns to the starting position.",
  ],
  canvas: [
    "2D pan & zoom",
    "CONTINUOUS INPUT",
    "Move around a floor plan",
    "A canvas using the public pan/zoom recipe. The application keeps zoom anchored at the center.",
    "Slide the cap to pan. Twist to zoom in or out.",
    "Pan and zoom simultaneously. Release the cap to stop.",
  ],
  values: [
    "Continuous values",
    "VALUES & INTERPRETATIONS",
    "See what your application reads",
    "Explore every continuous source as a deflection, a movement rate or a directional sector.",
    "Move the selected physical input. Watch the value respond.",
    "Deflection is a value; velocity is a rate. Direction returns a sector, or null.",
  ],
  selection: [
    "Push / pull menu",
    "BOUNDED INTERACTIONS",
    "Choose a drawing color",
    "Pan and zoom the drawing. Push or pull to choose an ink color without leaving the canvas.",
    "Push down or pull up and hold to open the menu.",
    "Tilt toward a color, then release pressure to apply. To cancel, keep pressure held, twist briefly and let the twist return to center.",
  ],
  scalar: [
    "Held scalar",
    "PERSISTENT INTERACTIONS",
    "Adjust a value while holding",
    "Pressure activates a twist-driven rate. The application integrates it into a value.",
    "Push or pull and hold, then twist to adjust.",
    "Center the twist to pause without ending the hold. Release pressure to finish.",
  ],
  vector: [
    "Held vector",
    "PERSISTENT INTERACTIONS",
    "Nudge a marker on a canvas",
    "This is a positioning example: tilt controls travel speed, and the marker stays where you leave it. Useful for a cursor, selection or object.",
    "Push or pull and hold, then tilt to move the point.",
    "Center the tilt to stop the point without ending the hold. Release pressure to finish.",
  ],
  routing: [
    "View or edit the drawing",
    "INPUT ROUTING",
    "Same device, two canvas modes",
    "View mode only pans and zooms. Edit mode also lets push/pull open a color menu. Switching mode cancels an open selection.",
    "In Edit mode, push or pull to open the palette. Switch to View mode to disable it.",
    "While the palette is open the drawing stays still. The palette owns the input until you finish or cancel.",
  ],
  lifecycle: [
    "Cancel without applying",
    "LIFECYCLE",
    "Leave a selection safely",
    "Highlight another ink color, then close the menu or leave Edit mode. The canvas must keep its existing color.",
    "Hold push or pull, tilt to preview a color, then choose Cancel selection.",
    "The preview disappears and the original color stays. Release the cap completely before opening the menu again.",
  ],
};
const styles = [
  "Blue",
  "Teal",
  "Green",
  "Gold",
  "Orange",
  "Red",
  "Violet",
  "Slate",
];
const palette = [
  "#2355cb",
  "#087b8c",
  "#23754e",
  "#987000",
  "#b9571a",
  "#b13b4d",
  "#7955a8",
  "#41596e",
];
const isCanvasExample = () =>
  ["canvas", "selection", "routing", "lifecycle"].includes(example);
const settings = {
  ...navigationDefaults,
  translationSpeed: motionDefaults.translationSpeed,
  rotationSpeed: (motionDefaults.rotationSpeed * 180) / Math.PI,
  panSpeed: motionDefaults.panSpeed,
  zoomSpeed: motionDefaults.zoomSpeed,
  responseMs: motionDefaults.responseMs,
  deadzone: 0.05,
  curve: 1,
  source: "tilt",
  as: "deflection",
  speed: 1,
  vectorSpeed: 2,
  sectors: 8,
  sticky: false,
  hysteresis: 0.08,
  cancelMode: "single",
  lifetime: "activation",
  holdMs: 0,
  releaseMs: 25,
  requireValue: true,
  routing: "menu",
};
const defaults = { ...settings };
function navigationScale(axisNames) {
  return profileScale(axisNames, settings);
}
let example = "navigation",
  page = "examples",
  puck,
  common,
  groups,
  lookup,
  cursor,
  connection = null,
  paused = false,
  run = null,
  input = { ...neutralInput },
  camera = cameraHome(),
  canvasPose = { x: 0, y: 0, zoom: 1 },
  style = 0,
  adjusted = 0,
  point = [0, 0],
  lastDraw = 0,
  lastReport = null,
  reportCount = 0;
let frozenData = null,
  rawReports = [];
let samples = [],
  events = [],
  frozen = false,
  frozenEnd = 0,
  replayData = null,
  selectedEvent = null,
  started = performance.now(),
  recognizer = createGestures(),
  selectedGesture = gestures[0],
  reportGaps = [];
const counts = {
  device: Object.fromEntries(gestures.map((g) => [key(g), 0])),
  simulator: Object.fromEntries(gestures.map((g) => [key(g), 0])),
};
const timeOrigin = () => replayData?.started ?? started;
const pretty = (v) => JSON.stringify(v, null, 2),
  source = () => (connection ? "device" : "simulator");
const say = (text) => {
  $("outcome").textContent = text;
};
const safe = (fn) => {
  try {
    return fn();
  } catch (error) {
    $("status").textContent = error.message;
    console.error(error);
  }
};
const activeContext = () =>
  example === "routing" && settings.routing === "navigation"
    ? "canvas"
    : example;
function cancelOptions() {
  return settings.cancelMode === "none"
    ? undefined
    : settings.cancelMode === "single"
      ? { input: "twist", direction: "either" }
      : {
          input: "twist",
          direction: settings.cancelMode === "same" ? "same" : "either",
          count: 2,
        };
}
function selections() {
  return Object.fromEntries(
    ["push", "pull"].map((activation) => [
      activation,
      control.interaction({
        activation,
        value: control.continuous("tilt", {
          as: "direction",
          sectors: 8,
          deadzone: 0.12,
          hysteresis: 0.08,
          sticky: true,
        }),
        requireValue: settings.requireValue,
        cancel: cancelOptions(),
        lifetime: settings.lifetime,
        holdMs: settings.holdMs,
        releaseMs: settings.releaseMs,
        ownership: { mode: "exclusive", channels: "all" },
      }),
    ]),
  );
}
function held(value) {
  return Object.fromEntries(
    ["push", "pull"].map((activation) => [
      activation,
      control.interaction({
        activation,
        value: control.continuous(value, {
          as: "velocity",
          speed: value === "tilt" ? settings.vectorSpeed : settings.speed,
        }),
        lifetime: settings.lifetime,
        holdMs: settings.holdMs,
        releaseMs: settings.releaseMs,
        ownership: { mode: "exclusive", channels: "all" },
      }),
    ]),
  );
}
function newRuntime() {
  run = null;
  if (puck) puck.dispose();
  recognizer = createGestures();
  common = {
    ...recipes.sixAxis({
      translationSpeed: settings.translationSpeed,
      rotationSpeed: (settings.rotationSpeed * Math.PI) / 180,
      responseMs: settings.responseMs,
      panDeadzone: settings.deadzone,
      rotationDeadzone: settings.deadzone,
    }),
    observed: control.continuous("axes", { ownership: "observe" }),
  };
  for (const [name, axisNames] of [
    ["translation", ["x", "y", "z"]],
    ["rotation", ["rx", "ry", "rz"]],
  ]) {
    common[name] = control.continuous(name, {
      ...common[name].options,
      scale: navigationScale(axisNames),
    });
  }
  const probeOptions = {
    as: settings.as,
    deadzone: settings.deadzone,
    curve: settings.curve,
    responseMs: settings.responseMs,
    ...(settings.as === "velocity" ? { speed: settings.speed } : {}),
    ...(settings.as === "direction"
      ? {
          sectors: settings.sectors,
          sticky: settings.sticky,
          hysteresis: settings.hysteresis,
        }
      : {}),
  };
  groups = {
    navigation: {},
    canvas: recipes.panZoom({
      panSpeed: settings.panSpeed,
      zoomSpeed: settings.zoomSpeed,
      responseMs: settings.responseMs,
    }),
    values: { value: control.continuous(settings.source, probeOptions) },
    selection: { ...recipes.panZoom(), ...selections() },
    scalar: held("twist"),
    vector: held("tilt"),
    routing: { ...recipes.panZoom(), ...selections() },
    lifecycle: { ...recipes.panZoom(), ...selections() },
  };
  const conflicts = Object.values(groups)
    .flatMap((g) => Object.values(g))
    .filter((c) => c.kind === "interaction")
    .map((prefer) => ({
      prefer,
      over: [
        common.translation,
        common.rotation,
        ...Object.values(groups)
          .flatMap((g) => Object.values(g))
          .filter((h) => h.kind === "continuous" && h !== common.observed),
      ],
    }));
  puck = createPuck({
    controls: common,
    contexts: groups,
    context: activeContext(),
    conflicts,
    trace: true,
    record: true,
    recordingLimit: 100000,
    eventLimit: 4096,
  });
  lookup = new Map([
    ...Object.entries(common).map(([n, h]) => [h, n]),
    ...Object.entries(groups).flatMap(([g, hs]) =>
      Object.entries(hs).map(([n, h]) => [h, `${g}.${n}`]),
    ),
  ]);
  for (const [handle, name] of lookup)
    if (handle.kind !== "continuous")
      puck.on(handle, (e) => {
        events.push({
          ...e,
          name,
          explanation: puck.explain(e),
          origin: source(),
        });
        if (events.length > 1200) events.shift();
        if (e.type === "commit") {
          if (
            ["selection", "routing", "lifecycle"].includes(example) &&
            e.value !== null
          ) {
            style = e.value;
            say(`Applied ${styles[style]}.`);
          } else if (["selection", "routing", "lifecycle"].includes(example))
            say(`No color selected. ${styles[style]} retained.`);
          else say(`Finished ${name.split(".").pop()} hold.`);
        }
        if (e.type === "cancel")
          say(`Canceled: ${e.reason}. ${styles[style]} retained.`);
        if (e.type === "begin")
          say(`${name.endsWith("push") ? "Push" : "Pull"} session opened.`);
        if (e.type === "trigger") say(`${name} triggered.`);
      });
  cursor = puck.events();
  samples = [];
  events = [];
  reportGaps = [];
  rawReports = [];
  frozenData = null;
  selectedEvent = null;
  replayData = null;
  frozen = false;
  lastReport = null;
  reportCount = 0;
  started = performance.now();
  input = { ...neutralInput };
  if (connection) puck.interrupt("configuration-change");
  else feed(input);
  puck.frame(performance.now());
  $("recordStatus").textContent =
    "Recording this session locally. Captures are bounded. Export before changing a structural setting.";
  $("replayStatus").textContent = "";
  $("evidence").textContent = "Select an event or scrub the graphs.";
  updateCode();
}
function receive(rows) {
  for (const e of rows) {
    const id = key(e);
    if (id in counts[source()]) counts[source()][id]++;
    events.push({
      ...e,
      type: e.kind,
      name: title(e),
      origin: source(),
      catalog: true,
    });
    if (events.length > 1200) events.shift();
    $("gestureResult").textContent = `${title(e)} detected · ${source()}`;
  }
  if (rows.length) paintCounts();
}
function feed(value, t = performance.now()) {
  input = { ...value };
  puck.feed(input, t);
  receive(recognizer.update(input, t));
  rawReports.push({ t, input: { ...input } });
  while (rawReports.length && rawReports[0].t < t - 30000) rawReports.shift();
  reportCount++;
  if (lastReport !== null) reportGaps.push({ t, gap: t - lastReport });
  lastReport = t;
  while (reportGaps.length && reportGaps[0].t < t - 30000) reportGaps.shift();
}
function stop(reason = "explicit") {
  run = null;
  puck.interrupt(reason);
  receive(recognizer.reset(performance.now()));
  input = { ...neutralInput };
  if (!connection && !paused) feed(input);
  syncSliders();
}
function context(next) {
  stop("context-change");
  example = next;
  puck.setContext(activeContext());
  if (!connection) feed(neutralInput);
  renderExample();
}
function active() {
  return Object.entries(groups[activeContext()])
    .filter(([, h]) => h.kind === "interaction")
    .map(([n, h]) => ({ name: n, handle: h, state: puck.read(h) }))
    .find((e) => e.state.status === "active");
}
for (const [id, [label]] of Object.entries(examples)) {
  const a = document.createElement("a");
  a.href = "#" + id;
  a.textContent = label;
  a.onclick = (e) => {
    e.preventDefault();
    context(id);
    showPage("examples");
  };
  $("examples").append(a);
  $("debugExample").add(new Option(label, id));
}
function showPage(next) {
  page = next;
  if (page !== "debug") document.body.classList.remove("focus-debug");
  for (const p of ["examples", "tester", "debug"]) {
    $(p === "examples" ? "examplePage" : p + "Page").hidden = p !== page;
    document
      .querySelector(`[data-page="${p}"]`)
      .toggleAttribute("aria-current", p === page);
  }
  window.history.replaceState(
    null,
    "",
    "#" + (page === "examples" ? example : page),
  );
  paintCounts();
}
for (const a of document.querySelectorAll("[data-page]"))
  a.onclick = (e) => {
    e.preventDefault();
    showPage(a.dataset.page);
  };
$("inspectExample").onclick = $("inspectTester").onclick = () =>
  showPage("debug");
$("backExample").onclick = () => showPage("examples");
$("debugExample").onchange = () => context($("debugExample").value);
const settingsSpec = {
  zoomAxis: ["Zoom gesture", "select", ["forward", "vertical"]],
  invertX: ["Reverse sideways pan", "checkbox"],
  invertY: ["Reverse forward / backward", "checkbox"],
  invertZ: ["Reverse lift / press", "checkbox"],
  invertRX: ["Reverse forward / backward tilt", "checkbox"],
  invertRY: ["Reverse left / right tilt", "checkbox"],
  invertRZ: ["Reverse twist", "checkbox"],
  translationSpeed: [
    "Pan / dolly speed",
    "number",
    0,
    2000,
    10,
    "World units / second",
  ],
  rotationSpeed: ["Rotation speed", "number", 0, 720, 5, "Degrees / second"],
  panSpeed: ["Pan speed", "number", 0, 5000, 50, "Pixels / second"],
  zoomSpeed: ["Zoom speed", "number", 0, 5, 0.1, "Log scale / second"],
  responseMs: [
    "Response",
    "number",
    0,
    500,
    5,
    "Milliseconds; neutral still stops",
  ],
  deadzone: [
    "Deadzone",
    "number",
    0,
    0.9,
    0.01,
    "Ignore deflection below this",
  ],
  curve: ["Response curve", "number", 0.1, 5, 0.1, "1 = linear"],
  speed: ["Value speed", "number", 0, 20, 0.1, "Units / second"],
  source: [
    "Which cap movement?",
    "select",
    [
      "slide",
      "tilt",
      "translation",
      "rotation",
      "pressure",
      "twist",
      "push",
      "pull",
      "axes",
    ],
  ],
  as: ["Use the input as", "select", ["deflection", "velocity", "direction"]],
  sectors: ["Direction sectors", "number", 2, 16, 1],
  sticky: ["Remember last direction", "checkbox"],
  hysteresis: ["Sector hysteresis", "number", 0, 0.9, 0.01],
  cancelMode: [
    "Cancel gesture",
    "select",
    ["single", "same", "either", "none"],
  ],
  lifetime: ["Hold lifetime", "select", ["activation", "combination"]],
  holdMs: [
    "Activation hold",
    "number",
    0,
    1500,
    25,
    "Milliseconds before begin",
  ],
  releaseMs: [
    "Release qualification",
    "number",
    0,
    500,
    5,
    "Milliseconds before commit",
  ],
  requireValue: ["Require a selection", "checkbox"],
  routing: ["Canvas mode", "select", ["menu", "navigation"]],
};
const optionNames = {
  forward: "Forward / backward · lift to pan",
  vertical: "Lift / press · forward to pan",
  slide: "Slide · raw X / Y",
  tilt: "Tilt · left/right, up/down",
  translation: "Translation · raw X / Y / Z",
  rotation: "Rotation · raw RX / RY / RZ",
  pressure: "Pressure · push and pull",
  twist: "Twist · clockwise and counterclockwise",
  push: "Push · downward force",
  pull: "Pull · upward force",
  axes: "All six raw channels",
  deflection: "Position of the cap",
  velocity: "Speed while deflected",
  direction: "One selected direction",
  single: "One twist · either direction",
  same: "Two twists · same direction",
  either: "Two twists · either direction",
  none: "No gesture cancellation",
  activation: "While pressure is held",
  combination: "While pressure + value are held",
  menu: "Edit · palette enabled",
  navigation: "View · pan and zoom only",
};

const helpFor = (key) =>
  ({
    zoomAxis:
      "Choose forward/back zoom or lift/press zoom; the other motion pans vertically. The default direction profile was confirmed with a physical SpaceMouse. Reverse switches let you override it.",
    invertX:
      "Reverse only sideways model movement. This changes the SDK translation X scale.",
    invertY:
      "Reverse the forward/back cap motion, whether assigned to zoom or vertical pan. SDK translation Y scale.",
    invertZ:
      "Reverse lifting/pressing, whether assigned to vertical pan or zoom. SDK translation Z scale.",
    invertRX:
      "Reverse pitch: tipping the cap toward or away from you. SDK rotation RX scale.",
    invertRY:
      "Reverse roll: leaning the cap left or right. SDK rotation RY scale.",
    invertRZ:
      "Reverse yaw: twisting the cap clockwise or counterclockwise. SDK rotation RZ scale.",
    translationSpeed:
      "How quickly the scene pans and moves closer. Higher is faster; 0 stops translation. This changes the SDK rate, not a hidden camera multiplier.",
    rotationSpeed:
      "Orbit speed while tilting or twisting. Translation speed is independent. The SDK uses radians; this field displays degrees.",
    panSpeed:
      "Canvas travel at full sideways force, in pixels per second. Does not affect zoom.",
    zoomSpeed:
      "Zoom rate while twisting. Higher values zoom faster; 0 disables zoom.",
    responseMs:
      "Time to ease into movement. 0 responds immediately; larger values feel softer. Centering the cap still stops immediately.",
    deadzone:
      "Ignore small input around center. Increase to reject drift; decrease to respond to lighter movement.",
    curve:
      "1 gives a linear response. Above 1 makes gentle movement slower while preserving full-force speed.",
    source:
      {
        tilt: "A 2D vector: lean left/right moves horizontally; lean up/down moves vertically. Right and down are positive.",
        slide:
          "Raw lateral/forward deflection. The pan/zoom recipe applies its own screen-direction mapping.",
        axes: "The six device channels, shown once each. These are raw device coordinates, not six screen directions.",
        translation:
          "Three device translation channels. Z is pressure; it is not screen depth.",
        rotation:
          "Three device rotation channels. Use Tilt for a left/right and up/down vector.",
      }[settings.source] ??
      "The selected physical force is returned as one signed value.",
    as: {
      deflection:
        "Follows your cap deflection and returns to zero when centered.",
      velocity:
        "Returns a movement rate. The application integrates that rate over time to move a value or object.",
      direction:
        "Returns a sector index instead of a distance. Centering gives no selection unless memory is enabled.",
    }[settings.as],
    speed:
      example === "vector"
        ? "Marker travel per second at full tilt. The marker keeps its position when you release; reset returns it to center."
        : "How much the value changes per second at full deflection. Larger values make adjustment faster.",
    sectors:
      "Split the circle into this many choices. Sector 0 is right; indices increase clockwise.",
    sticky:
      "Keep the last selected direction when you center the tilt. A new interaction starts empty.",
    hysteresis:
      "Extra angle needed to leave the current sector. Increase to prevent flickering near a boundary.",
    cancelMode:
      "Keep push/pull held. Twist briefly, then let twist center. A double requires two completed twists; cancel never applies the previewed color.",
    lifetime:
      "Pressure only keeps the menu open while tilt centers. Pressure + value also ends it when the value becomes neutral.",
    holdMs:
      "How long pressure must be held before the interaction opens. 0 opens immediately.",
    releaseMs:
      "How long pressure must stay released before applying a selection. Helps reject brief release chatter.",
    requireValue:
      "If enabled, releasing without choosing a color cancels. Disabling allows an empty commit, which this canvas leaves unchanged.",
    routing:
      "View mode pans and zooms only. Edit mode gives the unused pressure/tilt axes a color menu; while open, twist cancels instead of zooming.",
  })[key] ?? "";

function syncSettings() {
  const s = puck.settings().controls;
  for (const a of axes)
    settings["invert" + a.toUpperCase()] =
      (s[a.length === 1 ? "controls.translation" : "controls.rotation"].scale?.[
        a
      ] ?? 1) !== (["x", "y"].includes(a) ? -1 : 1);
  settings.translationSpeed = s["controls.translation"].speed;
  settings.rotationSpeed = (s["controls.rotation"].speed * 180) / Math.PI;
  settings.responseMs = s["controls.translation"].responseMs;
  settings.deadzone = s["controls.translation"].deadzone;
  settings.panSpeed = s["contexts.canvas.pan"].speed;
  settings.zoomSpeed = s["contexts.canvas.zoom"].speed;
  if (example === "canvas")
    settings.responseMs = s["contexts.canvas.pan"].responseMs;
  const v = s["contexts.values.value"];
  if (example === "values")
    Object.assign(settings, {
      deadzone: v.deadzone,
      curve: v.curve,
      responseMs: v.responseMs,
      speed: typeof v.speed === "number" ? v.speed : 1,
      sectors: v.sectors,
      sticky: v.sticky,
      hysteresis: v.hysteresis,
    });
  if (
    ["scalar", "vector", "selection", "routing", "lifecycle"].includes(example)
  ) {
    const h = s["contexts." + example + ".pull"];
    settings.holdMs = h.holdMs;
    settings.releaseMs = h.releaseMs;
    if (["scalar", "vector"].includes(example))
      settings.speed = h.valueOptions?.speed ?? h.value.options.speed;
  }
}
function renderSettings() {
  syncSettings();
  const keys =
    example === "navigation"
      ? [
          "translationSpeed",
          "rotationSpeed",
          "zoomAxis",
          "invertX",
          "invertY",
          "invertZ",
          "invertRX",
          "invertRY",
          "invertRZ",
          "responseMs",
          "deadzone",
        ]
      : example === "canvas"
        ? ["panSpeed", "zoomSpeed", "responseMs"]
        : example === "values"
          ? [
              "source",
              "as",
              "deadzone",
              "curve",
              ...(settings.as === "velocity"
                ? ["speed", "responseMs"]
                : settings.as === "direction"
                  ? ["sectors", "sticky", "hysteresis"]
                  : []),
            ]
          : ["scalar", "vector"].includes(example)
            ? ["speed", "lifetime", "holdMs", "releaseMs"]
            : ["cancelMode", "lifetime", "holdMs", "releaseMs", "requireValue"];
  $("settings").replaceChildren(
    ...keys.map((k) => {
      const [label, type, min, max, step, hint] = settingsSpec[k],
        l = document.createElement("label");
      l.textContent = label;
      const i = document.createElement(type === "select" ? "select" : "input");
      i.id = "setting-" + k;
      if (type === "select") {
        for (const v of min) {
          if (
            k === "as" &&
            v === "direction" &&
            !["slide", "tilt"].includes(settings.source)
          )
            continue;
          i.add(new Option(optionNames[v] ?? v, v));
        }
        i.value = settings[k];
      } else {
        i.type = type;
        if (type === "checkbox") i.checked = settings[k];
        else Object.assign(i, { min, max, step, value: settings[k] });
      }
      i.onchange = () =>
        safe(() => {
          if (type === "number" && !i.checkValidity()) {
            i.reportValidity();
            return;
          }
          settings[k] =
            type === "checkbox"
              ? i.checked
              : type === "number"
                ? +i.value
                : i.value;
          if (k === "speed" && example === "vector")
            settings.vectorSpeed = settings.speed;
          if (
            !["slide", "tilt"].includes(settings.source) &&
            settings.as === "direction"
          )
            settings.as = "deflection";
          if (k === "zoomAxis") {
            stop("configuration-change");
          } else if (k.startsWith("invert")) {
            puck.configure(common.translation, {
              scale: navigationScale(["x", "y", "z"]),
            });
            puck.configure(common.rotation, {
              scale: navigationScale(["rx", "ry", "rz"]),
            });
          } else if (k === "routing") {
            stop("context-change");
            puck.setContext(activeContext());
            if (!connection) feed(neutralInput);
          } else if (
            [
              "translationSpeed",
              "rotationSpeed",
              "responseMs",
              "deadzone",
            ].includes(k) &&
            example === "navigation"
          ) {
            puck.configure(common.translation, {
              speed: settings.translationSpeed,
              responseMs: settings.responseMs,
              deadzone: settings.deadzone,
            });
            puck.configure(common.rotation, {
              speed: (settings.rotationSpeed * Math.PI) / 180,
              responseMs: settings.responseMs,
              deadzone: settings.deadzone,
            });
          } else if (example === "values" && !["source", "as"].includes(k)) {
            puck.configure(groups.values.value, { [k]: settings[k] });
          } else if (example === "canvas") {
            puck.configure(groups.canvas.pan, {
              speed: settings.panSpeed,
              responseMs: settings.responseMs,
            });
            puck.configure(groups.canvas.zoom, {
              speed: settings.zoomSpeed,
              responseMs: settings.responseMs,
            });
          } else if (["scalar", "vector"].includes(example) && k === "speed") {
            for (const h of Object.values(groups[example]))
              puck.configure(h, { valueOptions: { speed: settings.speed } });
          } else if (["holdMs", "releaseMs"].includes(k)) {
            for (const h of Object.values(groups[example]))
              if (h.kind === "interaction")
                puck.configure(h, { [k]: settings[k] });
          } else newRuntime();
          renderSettings();
          updateCode();
          say("Settings applied. Return to neutral.");
        });
      l.append(i);
      const explanation = document.createElement("span");
      explanation.className = "setting-help";
      explanation.id = "help-" + k;
      explanation.textContent = helpFor(k);
      i.setAttribute("aria-describedby", explanation.id);
      i.setAttribute("aria-label", label);
      l.append(explanation);
      if (
        [
          "translationSpeed",
          "rotationSpeed",
          "panSpeed",
          "zoomSpeed",
          "speed",
        ].includes(k)
      ) {
        const range = document.createElement("input");
        range.type = "range";
        Object.assign(range, { min, max, step, value: settings[k] });
        range.setAttribute("aria-label", label + " slider");
        range.oninput = () => {
          i.value = range.value;
        };
        range.onchange = () => i.onchange();
        l.append(range);
      }
      return l;
    }),
  );
}
function renderExample() {
  lastExampleSignature = "";
  const [, , heading, desc, instruction, expected] = examples[example];
  $("category").textContent = examples[example][1];
  $("title").textContent = heading;
  $("description").textContent = desc;
  $("instruction").textContent = instruction;
  $("expected").textContent = expected;
  $("debugExample").value = example;
  for (const a of $("examples").children)
    a.toggleAttribute("aria-current", a.hash === "#" + example);
  const value = ["values", "scalar", "vector"].includes(example);
  $("scene").hidden = value || isCanvasExample();
  $("canvas2d").toggleAttribute("hidden", !isCanvasExample());
  $("valueStage").hidden = !value;
  $("selectionOverlay").hidden = true;
  renderSettings();
  renderSimulation();
  $("contextModes").hidden = example !== "routing";
  for (const b of $("contextModes").querySelectorAll("button"))
    b.setAttribute("aria-pressed", String(b.dataset.mode === settings.routing));
  updateCode();
  say(
    example === "routing"
      ? settings.routing === "menu"
        ? "Edit mode: push/pull opens the color palette."
        : "View mode: only pan and zoom are assigned."
      : "Ready for input",
  );
}
function button(label, fn) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = () => safe(fn);
  return b;
}
for (const b of $("contextModes").querySelectorAll("button"))
  b.onclick = () => {
    settings.routing = b.dataset.mode;
    stop("context-change");
    puck.setContext(activeContext());
    if (!connection) feed(neutralInput);
    renderExample();
  };
function renderSimulation() {
  const items =
    example === "lifecycle"
      ? [
          [
            "Hold push",
            () => {
              stop();
              feed({ ...neutralInput, z: 0.75, rx: -0.7 });
            },
          ],
          [
            "Hold pull",
            () => {
              stop();
              feed({ ...neutralInput, z: -0.75, rx: -0.7 });
            },
          ],
          [
            "Release",
            () => {
              run = null;
              feed(neutralInput);
            },
          ],
        ]
      : example === "navigation"
        ? [
            ["Pan", () => axisRun({ x: 0.6 })],
            ["Dolly", () => axisRun({ y: 0.6 })],
            ["Orbit", () => axisRun({ rz: 0.5, rx: 0.25 })],
          ]
        : example === "canvas"
          ? [
              ["Pan", () => axisRun({ x: 0.5, y: 0.3 })],
              ["Zoom", () => axisRun({ rz: 0.45 })],
            ]
          : example === "values"
            ? [
                [
                  "Send input",
                  () => axisRun(Object.fromEntries(axes.map((a) => [a, 0.55]))),
                ],
              ]
            : [
                ["Push", () => interactionRun("push")],
                ["Pull", () => interactionRun("pull")],
                ...(["selection", "routing", "lifecycle"].includes(example)
                  ? [["Pull + cancel", () => interactionRun("pull", true)]]
                  : []),
              ];
  $("simulations").replaceChildren(
    ...items.map(([label, fn]) => {
      const b = button(label, fn);
      b.disabled = !!connection || paused;
      return b;
    }),
  );
  if (example === "lifecycle")
    $("simulations").append(
      button(paused ? "Resume input" : "Pause input", () => $("pause").click()),
      button("Cancel selection", () => {
        const a = active();
        if (a) puck.cancel(a.handle);
      }),
      button("Open view-only canvas", () => context("canvas")),
    );
}
function simulate(rows) {
  if (connection || paused) return;
  stop();
  run = {
    rows: rows.map(([t, v]) => ({ t, input: { ...neutralInput, ...v } })),
    start: performance.now(),
    index: 0,
  };
  $("status").textContent = "Simulator · sending physical samples.";
}
function axisRun(v) {
  simulate([
    [0, {}],
    [80, v],
    [900, {}],
  ]);
}
function interactionRun(direction, cancel = false) {
  if (example === "routing" && settings.routing === "navigation")
    say(
      "View mode: push/pull is intentionally unassigned. Switch to Edit to open the palette.",
    );
  const z = direction === "push" ? 0.75 : -0.75,
    value =
      example === "scalar"
        ? { rz: 0.65 }
        : example === "vector"
          ? { rx: 0.45, ry: 0.5 }
          : { ry: -0.75 };
  simulate(
    cancel
      ? [
          [0, {}],
          [60, { z }],
          [200, { z, ...value }],
          [320, { z, ...value, rz: 0.75 }],
          [440, { z, ...value }],
          [560, { z, ...value, rz: 0.75 }],
          [680, { z, ...value }],
          [1000, {}],
        ]
      : [
          [0, {}],
          [60, { z }],
          [200, { z, ...value }],
          [900, {}],
        ],
  );
}
for (const a of axes) {
  const l = document.createElement("label");
  l.textContent = a + " ";
  const out = document.createElement("output");
  out.id = "axis-value-" + a;
  out.textContent = "0.00";
  const i = document.createElement("input");
  Object.assign(i, {
    type: "range",
    min: -1,
    max: 1,
    step: 0.01,
    value: 0,
    id: "axis-" + a,
  });
  i.setAttribute("aria-label", a + " deflection");
  i.oninput = () => {
    run = null;
    feed(Object.fromEntries(axes.map((a) => [a, +$("axis-" + a).value])));
  };
  l.append(out, i);
  $("sliders").append(l);
}
function syncSliders() {
  for (const a of axes) {
    $("axis-" + a).value = input[a];
    $("axis-value-" + a).textContent = input[a].toFixed(2);
  }
}
$("neutral").onclick = () => {
  run = null;
  feed(neutralInput);
};
$("resetView").onclick = () => {
  camera = cameraHome();
  canvasPose = { x: 0, y: 0, zoom: 1 };
  point = [0, 0];
  adjusted = 0;
};
$("defaults").onclick = () => {
  Object.assign(settings, defaults);
  stop();
  newRuntime();
  renderExample();
  say("SDK defaults restored.");
};
function completeCode() {
  const entries = puck.inspect().controls,
    group = (es) =>
      "{\n" +
      es
        .map(
          (e) =>
            `  ${JSON.stringify(e.name.split(".").pop())}: ${codeControl({ ...e.definition, options: e.settings })},`,
        )
        .join("\n") +
      "\n}";
  return `import { createPuck, control } from '@clankagent/puck';\nimport { connectPuck } from '@clankagent/puck/webhid';\n\nconst controls = ${group(entries.filter((e) => e.name.startsWith("controls.")))};\nconst contexts = {\n${Object.keys(
    groups,
  )
    .map(
      (n) =>
        `  ${n}: ${group(entries.filter((e) => e.name.startsWith("contexts." + n + ".")))},`,
    )
    .join("\n")}\n};\nconst conflicts = [\n${entries
    .filter((e) => e.prefers.length)
    .map((e) => `  { prefer: ${e.name}, over: [${e.prefers.join(", ")}] },`)
    .join(
      "\n",
    )}\n];\nconst puck = createPuck({ controls, contexts, context: ${JSON.stringify(activeContext())}, conflicts, trace: true, record: true });\n// From a user action: const connection = await connectPuck(puck);\n// At teardown: await connection.close(); puck.dispose();`;
}
function updateCode() {
  if (!puck) return;
  const actual = puck.settings().controls;
  let body = `const controls = recipes.sixAxis(${JSON.stringify({ translationSpeed: actual["controls.translation"].speed, rotationSpeed: actual["controls.rotation"].speed, responseMs: actual["controls.translation"].responseMs, panDeadzone: actual["controls.translation"].deadzone, rotationDeadzone: actual["controls.rotation"].deadzone })});\nconst puck = createPuck({ controls });\nfunction render() {\n  const frame = puck.frame();\n  const translation = frame.integrate(controls.translation);\n  const rotation = frame.integrate(controls.rotation); // radians\n  // Apply deltas to your application's camera.\n  requestAnimationFrame(render);\n}\nrender();`;
  if (example === "navigation") {
    body = body.replace(
      "const puck = createPuck({ controls });",
      `const puck = createPuck({ controls });\npuck.configure(controls.translation, { scale: ${JSON.stringify(actual["controls.translation"].scale)} });\npuck.configure(controls.rotation, { scale: ${JSON.stringify(actual["controls.rotation"].scale ?? {})} });`,
    );
    body += `\n\n// Application camera mapping (not a recognizer option):\n// zoomAxis: ${JSON.stringify(settings.zoomAxis)}. See navigation.js for the example\n// object-in-hand camera implementation. SDK deltas already include the inversions.`;
  }
  if (example === "canvas")
    body = `const controls = recipes.panZoom(${JSON.stringify({ panSpeed: actual["contexts.canvas.pan"].speed, zoomSpeed: actual["contexts.canvas.zoom"].speed, responseMs: actual["contexts.canvas.pan"].responseMs })});\nconst puck = createPuck({ controls });\nfunction render() {\n  const frame = puck.frame();\n  const [dx, dy] = frame.integrate(controls.pan);\n  const zoomFactor = Math.exp(frame.integrate(controls.zoom));\n  // Pan by dx/dy; zoom around the application's anchor.\n  requestAnimationFrame(render);\n}\nrender();`;
  else if (example === "values")
    body = `const value = ${codeControl(puck.inspect(groups.values.value).controls[0].definition)};\nconst puck = createPuck({ controls: { value } });\nfunction render() {\n  const frame = puck.frame();\n  console.log(puck.read(value));${settings.as === "velocity" ? "\n  console.log(frame.integrate(value)); // delta for this frame" : ""}\n  requestAnimationFrame(render);\n}\nrender();`;
  else if (!["navigation", "canvas"].includes(example))
    body = `const pull = ${codeControl(puck.inspect(groups[example].pull).controls[0].definition)};\nconst push = ${codeControl(puck.inspect(groups[example].push).controls[0].definition)};\nconst puck = createPuck({ controls: { pull, push } });\nfor (const handle of [pull, push]) puck.on(handle, event => {\n  console.log(event.type, event); // begin / update / commit / cancel\n});${["scalar", "vector"].includes(example) ? "\nfunction render() {\n  const frame = puck.frame();\n  const delta = frame.integrate(pull);\n  const otherDelta = frame.integrate(push);\n  // Add deltas to an application value.\n  requestAnimationFrame(render);\n}\nrender();" : ""}\n// Full setup below includes movement, contexts and ownership rules.`;
  $("snippet").textContent =
    `import { createPuck, control, recipes } from '@clankagent/puck';\nimport { connectPuck } from '@clankagent/puck/webhid';\n\n${body}\n\n// From your Connect button: const connection = await connectPuck(puck);\n// At teardown: await connection.close(); puck.dispose();`;
  $("definition").textContent = completeCode();
}
async function copy(id) {
  try {
    await navigator.clipboard.writeText($(id).textContent);
    $("status").textContent = "Code copied.";
  } catch {
    $("status").textContent =
      "Clipboard unavailable. Select and copy the code below.";
  }
}
$("copy").onclick = () => copy("snippet");
$("copyDefinition").onclick = () => copy("definition");
const coverage = [
  [
    "navigation",
    "Six-axis motion",
    "Translation, rotation, integration, speed, response and deadzone",
  ],
  [
    "canvas",
    "2D motion",
    "Pan/zoom recipe, simultaneous input and anchored zoom",
  ],
  [
    "values",
    "Continuous sources",
    "All nine sources; deflection, velocity, direction; curve, sectors, hysteresis and memory",
  ],
  [
    "tester",
    "32 gesture outcomes",
    "Singles, doubles, standalone tilt, pressure + tilt, pressure + twist and four holds",
  ],
  [
    "selection",
    "Bounded interactions",
    "Push/pull, selection memory, release qualification, no-selection and cancel policies",
  ],
  [
    "scalar",
    "Scalar / vector holds",
    "Activation or combination lifetime; pressure gating and integrated values",
  ],
  [
    "routing",
    "Contexts & conflicts",
    "Exclusive claims, shared movement, observing input and neutral rearming",
  ],
  [
    "debug",
    "Inspection & delivery",
    "Inspect/explain, occurrences, independent cursor, graphs and report timing",
  ],
  [
    "lifecycle",
    "Interruptions",
    "Explicit cancel, pause, blur, disconnect and context changes",
  ],
  [
    "debug",
    "Persistence",
    "Settings save/restore, bounded recording, replay and graphs",
  ],
  [
    "lab",
    "Calibration / legacy APIs",
    "Gesture tuning, presets, recordings, calibration and compatibility tools",
  ],
];
for (const [target, label, desc] of coverage) {
  const a = document.createElement("a");
  a.href = target === "lab" ? "./lab/" : "#" + target;
  const strong = document.createElement("strong");
  strong.textContent = label;
  const span = document.createElement("span");
  span.textContent = desc;
  a.append(strong, span);
  if (target !== "lab")
    a.onclick = (e) => {
      e.preventDefault();
      if (target === "tester" || target === "debug") showPage(target);
      else {
        context(target);
        showPage("examples");
      }
      window.scrollTo(0, 0);
    };
  $("coverageRows").append(a);
}
function gestureInstruction(g) {
  const base =
    g.direction === "push"
      ? "Push down"
      : g.direction === "pull"
        ? "Pull up"
        : g.direction === "clockwise"
          ? "Twist clockwise"
          : g.direction === "counterclockwise"
            ? "Twist counterclockwise"
            : `Tilt along ${g.direction}`;
  return g.rotation
    ? `${base} first, then twist ${g.rotation}. ${g.kind === "holdstart" ? "Keep both held until the hold starts, then release." : "Briefly hold both, then release."}`
    : g.tilt
      ? `${base} first, then tilt along ${g.tilt} while holding pressure; release.`
      : `${base}, then release to neutral.${g.kind === "double" ? " Repeat promptly for a double." : " Wait for the double-gesture window to finish."}`;
}
function chooseGesture(g) {
  selectedGesture = g;
  $("gestureInstruction").textContent = gestureInstruction(g);
  const value = g.rotation
    ? {
        pressure: g.direction,
        twist: g.rotation === "clockwise" ? "cw" : "ccw",
      }
    : g.tilt
      ? { pressure: g.direction, tilt: g.tilt }
      : g.direction === "clockwise"
        ? "cw"
        : g.direction === "counterclockwise"
          ? "ccw"
          : g.direction;
  $("gestureCode").textContent =
    g.kind === "holdstart"
      ? `import { createGestures } from '@clankagent/puck';\nconst gestures = createGestures();\n// On each physical input report:\nconst events = gestures.update(input, performance.now());\n// Between reports: gestures.advance(performance.now());\n// Listen for holdstart, holdend and holdcancel.\n// Current strength and pressure: gestures.state.hold\n// On interruption: gestures.reset(performance.now());`
      : `import { createPuck, control } from '@clankagent/puck';\nimport { connectPuck } from '@clankagent/puck/webhid';\nconst action = control.gesture(${JSON.stringify(value)}${g.kind === "double" ? ", { count: 2 }" : ""});\nconst puck = createPuck({ controls: { action } });\npuck.on(action, event => console.log(event));\n// From a button: const connection = await connectPuck(puck);`;
  for (const tile of document.querySelectorAll(".gesture"))
    tile.setAttribute("aria-pressed", String(tile.dataset.key === key(g)));
}
for (const group of new Set(gestures.map((g) => g.group))) {
  const h = document.createElement("h2");
  h.textContent = group;
  h.style.marginTop = "25px";
  const grid = document.createElement("div");
  grid.className = "tile-grid";
  for (const g of gestures.filter((g) => g.group === group)) {
    const b = button("", () => chooseGesture(g));
    b.className = "gesture";
    b.dataset.key = key(g);
    const label = document.createElement("span");
    label.textContent = title(g);
    const n = document.createElement("strong");
    n.textContent = "0";
    const state = document.createElement("small");
    state.textContent = "Not detected";
    b.append(label, n, state);
    grid.append(b);
  }
  $("gestureBoard").append(h, grid);
}
function paintCounts() {
  const c = counts[$("countSource").value];
  for (const b of document.querySelectorAll(".gesture")) {
    const n = c[b.dataset.key];
    b.classList.toggle("detected", n > 0);
    b.querySelector("strong").textContent = n;
    b.querySelector("small").textContent = n ? "Detected" : "Not detected";
  }
  $("coverageCount").textContent =
    `${Object.values(c).filter(Boolean).length} / 32 detected · ${$("countSource").value}`;
  $("simulateGesture").disabled = !!connection || paused;
}
$("countSource").onchange = paintCounts;
$("resetCounts").onclick = () => {
  for (const c of Object.values(counts)) for (const k in c) c[k] = 0;
  paintCounts();
};
$("simulateGesture").onclick = () => {
  if (connection) return;
  $("countSource").value = "simulator";
  paintCounts();
  simulate(sequence(selectedGesture).map((r) => [r.t, r.input]));
};
chooseGesture(selectedGesture);
$("connect").onclick = async () => {
  try {
    $("connect").disabled = true;
    stop();
    if (connection) {
      const c = connection;
      connection = null;
      await c.close();
    } else {
      connection = await connectWebHid({
        onInput(v) {
          if (v !== neutralInput && !paused) feed(v);
        },
        onInterrupt: (reason) => stop(reason),
        onDisconnect() {
          connection = null;
          connected();
        },
      });
      if (connection) $("countSource").value = "device";
    }
    connected();
  } catch (e) {
    $("status").textContent = e.message;
  } finally {
    $("connect").disabled = false;
  }
};
function connected() {
  paused = false;
  puck.interrupt("pause");
  $("connect").textContent = connection ? "Disconnect" : "Connect SpaceMouse";
  $("status").textContent = connection
    ? "Device connected · release the cap completely to arm."
    : "Simulator · connect your device or use the example buttons.";
  for (const a of axes) $("axis-" + a).disabled = !!connection;
  $("neutral").disabled = !!connection;
  renderSimulation();
  paintCounts();
}
window.addEventListener("blur", () => {
  if (puck) stop("blur");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && puck) stop("blur");
});
function download(name, value) {
  const url = URL.createObjectURL(
      new Blob([pretty(value)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export").onclick = () =>
  download("puck-recording.json", {
    ...puck.recording(),
    preview: {
      version: 1,
      started,
      samples,
      rawReports,
      gaps: reportGaps,
      events: events.map((e) => ({ ...e, control: undefined })),
      note: "Diagnostic snapshots cover the last 30 seconds; the SDK timeline covers the full bounded recording.",
    },
  });
$("saveSettings").onclick = () =>
  download("puck-settings.json", {
    ...puck.settings(),
    preview: { zoomAxis: settings.zoomAxis },
  });
$("fresh").onclick = () => {
  newRuntime();
  say("New recording started.");
};
$("restoreSettings").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    const saved = JSON.parse(await file.text());
    if (
      saved.preview?.zoomAxis !== undefined &&
      !["forward", "vertical"].includes(saved.preview.zoomAxis)
    )
      throw new Error("Invalid preview zoom gesture.");
    puck.restoreSettings(saved);
    settings.zoomAxis = saved.preview?.zoomAxis ?? "forward";
    renderSettings();
    updateCode();
    $("status").textContent = "Settings restored. Release to neutral.";
  } catch (error) {
    $("status").textContent = error.message;
  } finally {
    e.target.value = "";
  }
};
$("pause").onclick = () => {
  paused = !paused;
  stop("pause");
  $("pause").textContent = paused ? "Resume input" : "Pause input";
  for (const a of axes) $("axis-" + a).disabled = !!connection || paused;
  $("neutral").disabled = !!connection || paused;
  renderSimulation();
  paintCounts();
  $("status").textContent = paused
    ? "Input paused. Release the cap before resuming."
    : `${source()} input resumed. Release to neutral.`;
  say(
    paused
      ? "Input paused. Color unchanged."
      : "Input resumed. Return to neutral.",
  );
};
$("cancel").onclick = () => {
  const a = active();
  if (a) puck.cancel(a.handle);
  else $("status").textContent = "No active interaction to cancel.";
};
$("interrupt").onclick = () => {
  stop("pause");
  $("status").textContent = "Session interrupted. Release to neutral.";
};
$("drain").onclick = () => {
  try {
    const rows = cursor.drain();
    $("cursorStatus").textContent =
      `Drained ${rows.length} occurrences. Subscriptions and other cursors are independent.`;
  } catch (e) {
    $("cursorStatus").textContent = e.message;
  }
};
for (const a of axes) {
  const d = document.createElement("div");
  d.className = "graph";
  const head = document.createElement("div");
  head.className = "heading";
  const b = document.createElement("strong");
  b.textContent = {
    x: "X · lateral",
    y: "Y · forward",
    z: "Z · pressure",
    rx: "RX · tilt",
    ry: "RY · tilt",
    rz: "RZ · twist",
  }[a];
  const o = document.createElement("output");
  o.id = "read-" + a;
  const c = document.createElement("canvas");
  c.id = "graph-" + a;
  c.setAttribute("aria-label", a + " raw, processed and movement rate graph");
  head.append(b, o);
  d.append(head, c);
  $("graphs").append(d);
}
function surface(canvas) {
  const w = canvas.clientWidth || 500,
    h = canvas.clientHeight || 110,
    d = Math.min(devicePixelRatio || 1, 2);
  if (
    canvas.width !== Math.round(w * d) ||
    canvas.height !== Math.round(h * d)
  ) {
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
  }
  const c = canvas.getContext("2d");
  c.setTransform(d, 0, 0, d, 0, 0);
  c.clearRect(0, 0, w, h);
  return { c, w, h };
}
function plot(canvas, rows, end, duration, fields, range = 1) {
  const { c, w, h } = surface(canvas),
    left = 26,
    right = w - 6,
    top = 8,
    bottom = h - 20,
    mid = (top + bottom) / 2;
  c.font = "10px system-ui";
  c.fillStyle = "#465d71";
  for (const v of [-range, 0, range]) {
    const y = mid - ((v / range) * (bottom - top)) / 2;
    c.strokeStyle = "#dbe3ea";
    c.beginPath();
    c.moveTo(left, y);
    c.lineTo(right, y);
    c.stroke();
    c.fillText(String(v), 0, y + 3);
  }
  for (const t of [0, 0.5, 1])
    c.fillText(
      `${((end - duration + t * duration - timeOrigin()) / 1000).toFixed(1)}s`,
      left + t * (right - left - 28),
      h - 3,
    );
  for (const [read, color, points = rows] of fields) {
    c.strokeStyle = color;
    c.lineWidth = 1.6;
    c.beginPath();
    let first = true,
      previousY = 0;
    for (const r of points) {
      if (r.t > end) break;
      const x = Math.max(
          left,
          left + ((r.t - end + duration) / duration) * (right - left),
        ),
        v = read(r);
      if (!Number.isFinite(v)) continue;
      const y =
        mid -
        ((Math.max(-range, Math.min(range, v)) / range) * (bottom - top)) / 2;
      if (first) {
        c.moveTo(x, y);
        first = false;
      } else {
        c.lineTo(x, previousY);
        c.lineTo(x, y);
      }
      previousY = y;
    }
    if (!first) c.lineTo(right, previousY);
    c.stroke();
  }
}
function debugFrame() {
  const display = replayData ?? frozenData;
  const data = display?.samples ?? samples,
    rows = display?.events ?? events;
  if (!data.length) return;
  const last = data.at(-1).t,
    first = data[0].t;
  const base = frozen ? Math.max(first, Math.min(frozenEnd, last)) : last,
    end = Math.max(
      first,
      base - (1 - +$("scrub").value / 1000) * Math.min(30000, base - first),
    ),
    duration = +$("window").value;
  const at = data.findLast((r) => r.t <= end) ?? data[0];
  $("scrubTime").textContent =
    `${replayData ? "Replay" : frozen ? "Frozen" : "Live"} · ${((end - timeOrigin()) / 1000).toFixed(2)}s`;
  for (const a of axes) {
    plot($("graph-" + a), data, end, duration, [
      [
        (r) => r.input[a],
        "#2355cb",
        display ? (display.rawReports ?? data) : rawReports,
      ],
      [(r) => r.processed?.[a], "#ad570e"],
      [(r) => r.rate?.[a], "#167552"],
    ]);
    $("read-" + a).textContent =
      `raw ${at.input[a].toFixed(2)} · rate ${at.actual?.[a]?.toFixed(2) ?? "—"}`;
  }
  const timing = display?.gaps ?? reportGaps,
    maxGap = Math.max(
      0,
      ...timing
        .filter((r) => r.t >= end - duration && r.t <= end)
        .map((r) => r.gap),
    );
  plot(
    $("timing"),
    timing,
    end,
    duration,
    [[(r) => r.gap, "#2355cb"]],
    Math.max(1, Math.ceil(maxGap)),
  );
  $("timingStats").textContent = maxGap
    ? `${replayData ? "Recorded" : reportCount + " live"} reports · max gap ${maxGap.toFixed(1)} ms in window. Delivery spacing, not a polling-rate claim.`
    : "No report gaps in this window. A held input stays held until a release report.";
  const { c, w } = surface($("timeline")),
    kinds = [
      "trigger",
      "begin",
      "update",
      "commit",
      "cancel",
      "holdstart",
      "holdend",
      "holdcancel",
      "single",
      "double",
    ];
  c.font = "10px system-ui";
  for (const [i, type] of kinds.entries()) {
    c.fillStyle = "#465d71";
    c.fillText(type, 0, 10 + i * 10);
  }
  const visible = rows.filter(
    (e) => e.timestamp >= end - duration && e.timestamp <= end,
  );
  for (const e of visible) {
    const y = 7 + Math.max(0, kinds.indexOf(e.type)) * 10;
    c.fillStyle = ["cancel", "holdcancel"].includes(e.type)
      ? "#b03b42"
      : "#2355cb";
    c.fillRect(
      66 + ((e.timestamp - end + duration) / duration) * (w - 70),
      y,
      3,
      5,
    );
  }
  const eventKey = visible
    .slice(-45)
    .map((e) => e.timestamp + e.name + e.type)
    .join("|");
  if ($("events").dataset.key !== eventKey) {
    $("events").dataset.key = eventKey;
    $("events").replaceChildren(
      ...visible
        .slice(-45)
        .reverse()
        .map((e) =>
          button(
            `${((e.timestamp - timeOrigin()) / 1000).toFixed(3)}s · ${e.name} · ${e.type}${e.reason ? " · " + e.reason : ""}`,
            () => {
              selectedEvent = e;
              $("evidence").textContent = pretty(
                e.explanation ?? {
                  event: { ...e, control: undefined },
                  note: replayData
                    ? "Replayed occurrence. Live event evidence was not persisted."
                    : "Recognition catalog occurrence. See recognizer state in the sample.",
                },
              );
            },
          ),
        ),
    );
  }
  const controls = at.inspection?.controls ?? [];
  $("routing").replaceChildren(
    ...controls
      .filter(
        (c) =>
          c.name.startsWith("controls.") ||
          c.name.startsWith("contexts." + at.inspection.context + "."),
      )
      .map((c) => {
        const d = document.createElement("div");
        d.className = "routing-row";
        const n = document.createElement("span");
        n.textContent = c.name;
        const s = document.createElement("span");
        s.textContent = c.suppressedBy
          ? `Suppressed: ${c.suppressedBy}`
          : c.sessionId !== null
            ? `Active session ${c.sessionId}`
            : c.ownership.mode;
        d.append(n, s);
        return d;
      }),
  );
  const outputRows = data.map((r) => ({
    ...r,
    value:
      typeof r.output === "number"
        ? [r.output]
        : Array.isArray(r.output)
          ? r.output
          : r.output
            ? Object.values(r.output)
            : [],
  }));
  const outputRange = Math.max(
    1,
    ...outputRows
      .filter((r) => r.t >= end - duration && r.t <= end)
      .flatMap((r) => r.value.map((v) => Math.abs(v))),
  );
  plot(
    $("outputGraph"),
    outputRows,
    end,
    duration,
    Array.from({ length: 6 }, (_, i) => [
      (r) => r.value[i],
      ["#2355cb", "#ad570e", "#167552", "#8954a8", "#b03b42", "#187d8a"][i],
    ]),
    Math.ceil(outputRange),
  );
  $("outputState").textContent =
    "Selected control: " +
    JSON.stringify(at.output ?? at.interaction?.value ?? null);
  if (!selectedEvent)
    $("evidence").textContent = pretty({
      time: at.t,
      input: at.input,
      processed: at.processed,
      movementRate: at.actual,
      context: at.inspection?.context,
      recognizer: at.recognizer,
      interaction: at.interaction,
      frameInterval: at.frameMs,
      note:
        replayData && !replayData.fullDiagnostics
          ? "Replay rates are interval averages. Live processed/ownership snapshots were not recorded."
          : undefined,
    });
}
$("focusGraphs").onclick = () => {
  const on = document.body.classList.toggle("focus-debug");
  $("focusGraphs").textContent = on ? "Exit graph focus" : "Focus graphs";
};
$("freeze").onclick = () => {
  frozen = !frozen;
  frozenData = frozen
    ? {
        samples: [...samples],
        events: [...events],
        gaps: [...reportGaps],
        rawReports: [...rawReports],
      }
    : null;
  frozenEnd = (replayData?.samples ?? samples).at(-1)?.t ?? performance.now();
  $("freeze").textContent = frozen ? "Resume display" : "Freeze display";
};
$("scrub").oninput = () => {
  if (!frozen) {
    frozen = true;
    frozenData = {
      samples: [...samples],
      events: [...events],
      gaps: [...reportGaps],
      rawReports: [...rawReports],
    };
    frozenEnd = (replayData?.samples ?? samples).at(-1)?.t ?? performance.now();
  }
  $("freeze").textContent = "Resume display";
  selectedEvent = null;
};
$("live").onclick = () => {
  replayData = null;
  frozenData = null;
  frozen = false;
  $("scrub").value = 1000;
  selectedEvent = null;
  $("freeze").textContent = "Freeze display";
  $("replayStatus").textContent =
    "Showing live input. Replay did not alter the live session.";
};
function validDiagnostics(s) {
  const value = (v) => typeof v === "number" && Number.isFinite(v);
  const axisObject = (o) => o && axes.every((a) => value(o[a]));
  return (
    value(s.started) &&
    Array.isArray(s.events) &&
    s.events.length <= 1200 &&
    s.events.every(
      (e) =>
        value(e.timestamp) &&
        typeof e.name === "string" &&
        typeof e.type === "string",
    ) &&
    Array.isArray(s.rawReports) &&
    s.rawReports.length < 20000 &&
    s.rawReports.every((r) => value(r.t) && axisObject(r.input)) &&
    Array.isArray(s.gaps) &&
    s.gaps.length < 20000 &&
    s.gaps.every((r) => value(r.t) && value(r.gap)) &&
    s.samples.every(
      (r) =>
        value(r.t) &&
        axisObject(r.input) &&
        ["processed", "actual", "rate"].every(
          (k) => r[k] === undefined || axisObject(r[k]),
        ) &&
        (!r.inspection ||
          (Array.isArray(r.inspection.controls) &&
            r.inspection.controls.every(
              (c) =>
                typeof c.name === "string" &&
                c.ownership &&
                typeof c.ownership.mode === "string",
            ))),
    )
  );
}
$("replay").onchange = async (e) => {
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 25000000)
      throw new Error("Recording exceeds the 25 MB preview limit.");
    const recording = JSON.parse(await file.text()),
      graph = createControlGraph(recording),
      r = replayPuck(recording),
      feeds = recording.timeline.filter((o) => o.type === "feed");
    let last = {},
      previous = null;
    const gaps = [],
      rows = feeds.map((o) => {
        if (previous !== null) gaps.push({ t: o.time, gap: o.time - previous });
        previous = o.time;
        return { t: o.time, input: o.input };
      });
    const translation = graph.movement.find(
        (m) => m.control === "controls.translation",
      ),
      rotation = graph.movement.find((m) => m.control === "controls.rotation");
    let index = 0;
    for (let i = 0; i < r.frames.length; i++) {
      const f = r.frames[i];
      while (index < feeds.length && feeds[index].time <= f.end)
        last = feeds[index++].input;
      const dt = (f.end - f.start) / 1000;
      if (dt <= 0) continue;
      const linear = translation?.intervals[i]?.delta ?? [0, 0, 0],
        angular = rotation?.intervals[i]?.delta ?? [0, 0, 0];
      rows.push({
        t: f.end,
        input: { ...neutralInput, ...last },
        actual: Object.fromEntries(
          axes.map((a, j) => [a, (j < 3 ? linear[j] : angular[j - 3]) / dt]),
        ),
      });
    }
    rows.sort((a, b) => a.t - b.t);
    let translationSpeed =
        recording.definition.controls?.translation?.options.speed ?? 1,
      rotationSpeed =
        recording.definition.controls?.rotation?.options.speed ?? 1;
    const changes = recording.timeline.filter((op) => op.type === "configure");
    let changeIndex = 0;
    for (const row of rows) {
      while (
        changeIndex < changes.length &&
        changes[changeIndex].time <= row.t
      ) {
        const op = changes[changeIndex++];
        if (
          op.control === "controls.translation" &&
          typeof op.settings.speed === "number"
        )
          translationSpeed = op.settings.speed;
        if (
          op.control === "controls.rotation" &&
          typeof op.settings.speed === "number"
        )
          rotationSpeed = op.settings.speed;
      }
      if (row.actual)
        row.rate = Object.fromEntries(
          axes.map((a, i) => [
            a,
            row.actual[a] / ((i < 3 ? translationSpeed : rotationSpeed) || 1),
          ]),
        );
    }
    r.puck.dispose();
    replayData = {
      samples: rows,
      events: graph.events.map((e) => ({ ...e, name: e.control })),
      gaps,
    };
    if (
      recording.preview?.version === 1 &&
      Array.isArray(recording.preview.samples) &&
      recording.preview.samples.length &&
      recording.preview.samples.length < 20000
    ) {
      const saved = recording.preview;
      if (validDiagnostics(saved)) {
        replayData = { ...saved };
        replayData.fullDiagnostics = true;
      }
    }
    replayData.started = recording.preview?.started ?? rows[0]?.t ?? 0;
    frozen = true;
    frozenEnd = replayData.samples.at(-1)?.t ?? 0;
    $("scrub").value = 1000;
    selectedEvent = null;
    $("replayStatus").textContent =
      `Replay ${graph.complete ? "complete" : "partial — limit reached"}: ${feeds.length} reports, ${graph.events.length} occurrences, ${r.frames.length} frames. Live session unchanged. Raw input and interval-average rates available; processed/ownership snapshots were not recorded.`;
    if (replayData.fullDiagnostics)
      $("replayStatus").textContent =
        `Replay ${graph.complete ? "complete" : "partial — recording limit reached"}: ${feeds.length} reports, ${graph.events.length} occurrences. Showing the saved 30-second diagnostic window with values, ownership and event evidence. Live session unchanged.`;
    $("freeze").textContent = "Resume display";
  } catch (error) {
    $("replayStatus").textContent = `Replay failed: ${error.message}`;
  } finally {
    e.target.value = "";
  }
};
let planStyle;
function drawPlan() {
  const p = canvasPose,
    parts = [
      '<rect x="-600" y="-400" width="1200" height="800" fill="#f7f8f5"/>',
    ];
  if (planStyle !== style) {
    for (let x = -600; x <= 600; x += 50)
      parts.push(`<path d="M${x} -400V400" stroke="#dce4df"/>`);
    for (let y = -400; y <= 400; y += 50)
      parts.push(`<path d="M-600 ${y}H600" stroke="#dce4df"/>`);
    parts.push(
      '<path d="M-280-150H280V150H-280Z M-80-150V150 M100-150V20H280 M-80 20H100" fill="none" stroke="#48635a" stroke-width="8"/>',
    );
    for (const [x, y, label] of [
      [-220, -30, "Studio"],
      [0, -60, "Kitchen"],
      [175, -60, "Office"],
      [75, 100, "Living room"],
    ])
      parts.push(
        `<text x="${x}" y="${y}" fill="#29493d" font-size="19">${label}</text>`,
      );
    $("plan").innerHTML = parts.join("").replaceAll("#48635a", palette[style]);
    planStyle = style;
  }
  $("plan").setAttribute(
    "transform",
    `translate(${400 + p.x} ${220 + p.y}) scale(${p.zoom})`,
  );
}
let lastExampleSignature = "";
window.addEventListener("resize", () => {
  lastExampleSignature = "";
});
function drawExample() {
  const a = active(),
    selection = ["selection", "routing", "lifecycle"].includes(example);
  const cancellation =
    selection && a ? puck.inspect(a.handle).controls[0].cancellation : null;
  const liveValue =
    example === "values"
      ? puck.read(groups.values.value)
      : example === "scalar"
        ? adjusted
        : point;
  const signature = JSON.stringify([
    example,
    a?.state,
    cancellation?.phase,
    liveValue,
    camera,
    canvasPose,
    style,
    settings.cancelMode,
    settings.routing,
    settings.zoomAxis,
  ]);
  if (signature === lastExampleSignature) return;
  lastExampleSignature = signature;
  $("selectionOverlay").hidden = !selection || !a;
  const v = a?.state.value;
  if (selection && a) {
    $("instruction").textContent =
      "Tilt to a color. Release pressure to apply it.";
    $("expected").textContent =
      settings.cancelMode === "none"
        ? "No cancellation gesture configured. Use Cancel in Debug to abort."
        : `To cancel: ${optionNames[settings.cancelMode].toLowerCase()}, then let twist center while keeping pressure held.`;
    if (!$("radial").children.length)
      $("radial").replaceChildren(
        ...styles.map((label, i) => {
          const el = document.createElement("span"),
            angle = (i * Math.PI) / 4;
          el.textContent = label;
          el.className = i === v ? "selected" : "";
          el.style.left = 50 + 34 * Math.cos(angle) + "%";
          el.style.top = 50 + 34 * Math.sin(angle) + "%";
          el.style.setProperty("--swatch", palette[i]);
          return el;
        }),
      );
    for (const [i, el] of [...$("radial").children].entries())
      el.classList.toggle("selected", i === v);
    $("menuHint").textContent = v === null ? "Tilt to choose" : styles[v];
    $("cancelFeedback").textContent =
      cancellation?.phase === "active"
        ? "Twist registered — center the twist to finish canceling."
        : cancellation?.phase === "blocked"
          ? "Center the twist to arm cancellation."
          : "Keep pressure held while canceling.";
  } else {
    $("cancelFeedback").textContent = "";
    $("instruction").textContent = examples[example][4];
    $("expected").textContent = examples[example][5];
  }
  if (example === "routing" && settings.routing === "navigation") {
    $("instruction").textContent =
      "View mode: slide to pan and twist to zoom. Push/pull has no action.";
    $("expected").textContent =
      "Choose Edit to enable the color palette on the unused pressure and tilt axes.";
  }
  if (example === "navigation") {
    $("instruction").textContent =
      settings.zoomAxis === "forward"
        ? "Slide sideways to pan, lift/press for vertical pan, and slide forward/back to zoom. Tilt to pitch/roll; twist to turn."
        : "Slide sideways/forward to pan; lift/press to zoom. Tilt to pitch/roll; twist to turn.";
    $("expected").textContent =
      "Use the six Reverse switches to match your preferred directions. These invert the SDK controls; raw Debug input stays unchanged.";
  }
  $("sessionState").textContent = a
    ? `${a.name} active · session ${a.state.sessionId}`
    : "No interaction active";
  $("visualState").textContent =
    example === "canvas"
      ? `Zoom ${canvasPose.zoom.toFixed(2)}×`
      : selection
        ? `${styles[style]} ink · ${a ? "drawing locked while selecting" : "pan + zoom available"}`
        : "Target orbit · all six axes";
  if (!$("scene").hidden) drawScene($("scene"), camera, 0);
  if (isCanvasExample()) drawPlan();
  if (["values", "scalar", "vector"].includes(example)) {
    const value = liveValue;
    $("valueCaption").textContent =
      example === "values"
        ? `${settings.source} → ${settings.as}`
        : example === "scalar"
          ? "Integrated scalar value"
          : "Marker position · stays where you leave it";
    const many =
      value &&
      (Array.isArray(value) ? value.length > 2 : typeof value === "object");
    $("axisValues").hidden = !many;
    $("valueOutput").hidden = !!many;
    if (many) {
      const pairs = Array.isArray(value)
        ? (settings.source === "rotation"
            ? ["rx", "ry", "rz"]
            : ["x", "y", "z"]
          ).map((a, i) => [a, value[i]])
        : axes.map((a) => [a, value[a]]);
      if (
        $("axisValues").dataset.channels !== pairs.map((p) => p[0]).join(",")
      ) {
        $("axisValues").dataset.channels = pairs.map((p) => p[0]).join(",");
        $("axisValues").replaceChildren(
          ...pairs.map(([name, v]) => {
            const row = document.createElement("div"),
              label = document.createElement("strong"),
              out = document.createElement("output"),
              meter = document.createElement("meter");
            label.textContent = name.toUpperCase();
            out.textContent = v.toFixed(3);
            meter.min = -1;
            meter.max = 1;
            meter.value = v;
            row.append(label, meter, out);
            return row;
          }),
        );
      }
      for (const [i, [, v]] of pairs.entries()) {
        const row = $("axisValues").children[i];
        row.querySelector("output").textContent = v.toFixed(3);
        row.querySelector("meter").value = v;
      }
    }
    $("valueOutput").textContent =
      typeof value === "number"
        ? value.toFixed(3)
        : value === null
          ? "null"
          : Array.isArray(value)
            ? value
                .map(
                  (v, i) =>
                    `${value.length === 2 ? ["Right", "Down"][i] : ["X", "Y", "Z"][i]} ${v.toFixed(2)}`,
                )
                .join(" · ")
            : axes.map((a) => `${a}: ${value[a].toFixed(2)}`).join("  ");
    $("valueOutput").style.fontSize =
      value && typeof value === "object" && !Array.isArray(value) ? "19px" : "";
    const vector = Array.isArray(value) && value.length === 2;
    $("vector").toggleAttribute("hidden", !vector);
    $("scalar").hidden = vector || typeof value !== "number";
    if (vector) {
      $("vectorDot").setAttribute(
        "cx",
        120 + Math.max(-1, Math.min(1, value[0])) * 110,
      );
      $("vectorDot").setAttribute(
        "cy",
        120 + Math.max(-1, Math.min(1, value[1])) * 110,
      );
    } else if (typeof value === "number")
      $("scalar").value = Math.max(-1, Math.min(1, value));
  }
}
const frameCosts = [];
let frameGaps = [],
  lastFrameTime = performance.now(),
  healthAt = 0,
  lastDebugDraw = 0,
  slowFrames = 0,
  worstGap = 0;
const health = document.createElement("p");
health.id = "frameHealth";
health.title =
  "Work is JavaScript time inside the render callback. Interval includes browser rendering and scheduling. Foreground gaps over 50 ms are retained until reload; device report gaps are graphed separately.";
$("graphs").before(health);
document.addEventListener("visibilitychange", () => {
  lastFrameTime = null;
});
function frame() {
  const workStart = performance.now();
  if (lastFrameTime !== null && !document.hidden) {
    const gap = workStart - lastFrameTime;
    frameGaps.push(gap);
    worstGap = Math.max(worstGap, gap);
    if (gap > 50) slowFrames++;
  }
  lastFrameTime = workStart;
  safe(() => {
    const t = performance.now();
    if (run) {
      if (t - run.start > 2500) stop();
      else if (
        run.index < run.rows.length &&
        t >= run.start + run.rows[run.index].t
      )
        feed(run.rows[run.index++].input, t);
      if (run && run.index === run.rows.length && t - run.start > 1600) {
        run = null;
        $("status").textContent =
          "Simulation finished. Device counts are separate.";
      }
    }
    receive(recognizer.advance(t));
    const f = puck.frame(t),
      linear = f.integrate(common.translation),
      angular = f.integrate(common.rotation);
    if (example === "navigation") moveCamera(camera, linear, angular, settings);
    if (isCanvasExample()) {
      const [x, y] = f.integrate(groups[activeContext()].pan),
        dz = f.integrate(groups[activeContext()].zoom),
        next = Math.max(0.15, Math.min(6, canvasPose.zoom * Math.exp(dz))),
        ratio = next / canvasPose.zoom;
      canvasPose = {
        x: canvasPose.x * ratio + x,
        y: canvasPose.y * ratio + y,
        zoom: next,
      };
    }
    if (activeContext() === "scalar")
      for (const h of Object.values(groups.scalar)) adjusted += f.integrate(h);
    if (activeContext() === "vector")
      for (const h of Object.values(groups.vector)) {
        const d = f.integrate(h);
        point = point.map((v, i) => Math.max(-1, Math.min(1, v + d[i])));
      }
    if (page === "examples") drawExample();
    if (t - lastDraw >= 33) {
      if ($("manualInputs").open) syncSliders();
      let linearRate = puck.read(common.translation),
        angularRate = puck.read(common.rotation);
      let linearSpeed = settings.translationSpeed,
        angularSpeed = (settings.rotationSpeed * Math.PI) / 180;
      if (isCanvasExample()) {
        const c = groups[activeContext()];
        linearRate = [...puck.read(c.pan), 0];
        angularRate = [0, 0, puck.read(c.zoom)];
        const config = puck.settings().controls;
        linearSpeed = config["contexts." + activeContext() + ".pan"].speed;
        angularSpeed = config["contexts." + activeContext() + ".zoom"].speed;
      }
      samples.push({
        t,
        input: { ...input },
        processed: puck.read(common.observed),
        rate: Object.fromEntries(
          axes.map((a, i) => [
            a,
            i < 3
              ? linearRate[i] / (linearSpeed || 1)
              : angularRate[i - 3] / (angularSpeed || 1),
          ]),
        ),
        actual: Object.fromEntries(
          axes.map((a, i) => [a, i < 3 ? linearRate[i] : angularRate[i - 3]]),
        ),
        inspection: {
          context: activeContext(),
          controls: puck
            .inspect()
            .controls.map(
              ({
                name,
                kind,
                ownership,
                eligible,
                suppressedBy,
                sessionId,
              }) => ({
                name,
                kind,
                ownership,
                eligible,
                suppressedBy,
                sessionId,
              }),
            ),
        },
        output:
          example === "values"
            ? puck.read(groups.values.value)
            : (active()?.state.value ?? null),
        recognizer: recognizer.state,
        interaction: active()?.state ?? null,
        frameMs: f.end - f.start,
      });
      while (samples.length && samples[0].t < t - 30000) samples.shift();
      if (page === "debug" && t - lastDebugDraw >= 100) {
        debugFrame();
        lastDebugDraw = t;
      }
      $("recognizerState").textContent =
        `${recognizer.state.phase}${recognizer.state.pending ? " · waiting for double: " + recognizer.state.pending : ""}${recognizer.state.hold ? " · hold active" : ""}`;
      if (puck.recordingFull)
        $("recordStatus").textContent =
          "Recording limit reached. Export, then start a new recording.";
      lastDraw = t;
    }
  });
  frameCosts.push(performance.now() - workStart);
  if (workStart - healthAt >= 2000) {
    const sorted = frameCosts.toSorted((a, b) => a - b);
    health.textContent = `Last 2 s: frame work p95 ${sorted[Math.floor(sorted.length * 0.95)]?.toFixed(2)} ms · interval p95 ${frameGaps.toSorted((a, b) => a - b)[Math.floor(frameGaps.length * 0.95)]?.toFixed(1) ?? "—"} ms. Since load: ${slowFrames} foreground gaps over 50 ms · worst ${worstGap.toFixed(1)} ms.`;
    frameCosts.length = 0;
    frameGaps.length = 0;
    healthAt = workStart;
  }
  requestAnimationFrame(frame);
}
newRuntime();
renderExample();
const initial = location.hash.slice(1);
if (initial in examples) {
  context(initial);
  showPage("examples");
} else showPage(["tester", "debug"].includes(initial) ? initial : "examples");
requestAnimationFrame(frame);
