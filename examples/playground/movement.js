import { createPuck, recipes, motionDefaults } from '../../dist/index.js';

export const movementDefaults = Object.freeze({ ...motionDefaults, rotationSpeed: motionDefaults.rotationSpeed * 180 / Math.PI, zoomInput: 'twist' });
export const panZoomKeys = ['panSpeed', 'zoomSpeed', 'panDeadzone', 'zoomDeadzone', 'responseMs', 'maxFrameMs', 'zoomInput'];
export function panZoomOverrides(config) { return Object.fromEntries(panZoomKeys.filter(key => config[key] !== movementDefaults[key]).map(key => [key, config[key]])); }
export const movementFields = [
  ['panSpeed', 'Pan speed', 0, 5000, 10, 'px/s', 'Full-deflection speed in the 2D view.'],
  ['zoomSpeed', 'Zoom speed', 0, 5, .05, 'log units/s', '1.5 gives approximately 4.48× zoom per second at full force.'],
  ['panDeadzone', 'Movement deadzone', 0, .5, .01, '', 'Ignore small translations below this force.'],
  ['zoomDeadzone', 'Zoom deadzone', 0, .5, .01, '', 'Ignore small twist or pressure in the 2D view.'],
  ['responseMs', 'Acceleration response', 0, 500, 5, 'ms', '0 is immediate. Larger values ease into motion. Neutral still stops immediately.'],
  ['maxFrameMs', 'Maximum frame interval', 1, 100, 1, 'ms', 'Caps a stalled frame to prevent large jumps.'],
  ['translationSpeed', '3D translation speed', 0, 1000, 10, 'units/s', 'Full-deflection travel on x, y and z.'],
  ['rotationSpeed', '3D rotation speed', 0, 360, 5, 'degrees/s', 'Full-deflection rotation on rx, ry and rz.'],
  ['rotationDeadzone', '3D rotation deadzone', 0, .5, .01, '', 'Ignore small rotational deflections.'],
];

// Rendering remains demo code; every motion channel uses public SDK recipes.
export function createMovement(options = movementDefaults) {
  const config = { ...movementDefaults, ...options };
  const controls = { ...recipes.panZoom(config), ...recipes.sixAxis({ ...config, rotationSpeed: config.rotationSpeed * Math.PI / 180 }) };
  let runtime = createPuck({ controls, maxFrameMs: config.maxFrameMs, clock: () => 0 }), pending, previous, lastTime = 0;
  return {
    setInput(input, time) {
      if (time === undefined) pending = { ...input };
      else { runtime.feed(input, time); lastTime = time; pending = undefined; }
    },
    reset() { runtime.dispose(lastTime); runtime = createPuck({ controls, maxFrameMs: config.maxFrameMs, clock: () => 0 }); previous = undefined; pending = undefined; lastTime = 0; },
    step(t) {
      // Compatibility callers without report timestamps update at the previous frame.
      // The playground supplies actual report times to setInput.
      if (pending) { runtime.feed(pending, previous ?? t); pending = undefined; }
      const frame = runtime.frame(t); previous = t; lastTime = t;
      const [panX, panY] = frame.integrate(controls.pan), logZoom = frame.integrate(controls.zoom);
      return { panX, panY, zoomFactor: Math.exp(logZoom), moving: panX !== 0 || panY !== 0 || logZoom !== 0,
        translation: frame.integrate(controls.translation), rotation: frame.integrate(controls.rotation).map(v => v * 180 / Math.PI) };
    },
  };
}
export function initialPose() { return { position: [0, 0, 0], angles: [0, 0, 0] }; }
export function advancePose(pose, delta) {
  for (let i = 0; i < 3; i++) { pose.position[i] += delta.translation[i]; pose.angles[i] = (pose.angles[i] + delta.rotation[i]) % 360; }
}
export function projectCube(pose) {
  const [rx, ry, rz] = pose.angles.map(v => v * Math.PI / 180);
  const rotate = ([x, y, z]) => {
    [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
    [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
    return [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz), z];
  };
  return [-1, 1].flatMap(z => [-1, 1].flatMap(y => [-1, 1].map(x => {
    const p = rotate([x * 55, y * 55, z * 55]).map((v, i) => v + pose.position[i]);
    // Isometric projection makes z travel visible without a perspective near-plane singularity.
    return [400 + .866 * (p[0] - p[2]), 150 + p[1] + .5 * (p[0] + p[2])];
  })));
}
