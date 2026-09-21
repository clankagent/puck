import test from "node:test";
import assert from "node:assert/strict";
import { createPuck, recipes, neutralInput } from "../dist/index.js";
import {
  cameraHome,
  moveCamera,
  projection,
  rotate,
  navigationDefaults,
  navigationScale,
} from "../examples/playground/navigation.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);

test("confirmed navigation profile reverses sideways, forward/back and twist without changing raw or 2D recipes", () => {
  const controls = recipes.sixAxis({
    responseMs: 0,
    panDeadzone: 0,
    rotationDeadzone: 0,
  });
  const puck = createPuck({ controls, clock: () => 0 });
  assert.deepEqual(
    controls.translation.options.scale,
    navigationScale(["x", "y", "z"]),
  );
  assert.deepEqual(
    controls.rotation.options.scale,
    navigationScale(["rx", "ry", "rz"]),
  );
  puck.configure(
    controls.translation,
    { scale: navigationScale(["x", "y", "z"]) },
    0,
  );
  puck.configure(
    controls.rotation,
    { scale: navigationScale(["rx", "ry", "rz"]) },
    0,
  );
  puck.feed({ x: 0.5, y: 0.5, z: 0.5, rx: 0.5, ry: 0.5, rz: 0.5 }, 0);
  assert.deepEqual(puck.read(controls.translation), [300, 300, 300]);
  const angular = Math.PI / 4;
  assert.deepEqual(puck.read(controls.rotation), [angular, angular, -angular]);
  assert.equal(puck.inspect().input.rz, 0.5);
  assert.deepEqual(recipes.panZoom().pan.options.scale, { x: -1, y: -1 });
  assert.equal(navigationDefaults.zoomAxis, "forward");
  puck.dispose(0);
});

test("object-in-hand zoom modes and six SDK inversions affect only their assigned motion", () => {
  const home = () => ({
    target: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    distance: 450,
  });
  for (const zoomAxis of ["forward", "vertical"]) {
    for (const axis of ["x", "y", "z", "rx", "ry", "rz"]) {
      const outcomes = [];
      for (const inverted of [false, true]) {
        const controls = recipes.sixAxis({
          responseMs: 0,
          panDeadzone: 0,
          rotationDeadzone: 0,
        });
        const puck = createPuck({ controls, clock: () => 0 });
        const h = axis.length === 1 ? controls.translation : controls.rotation;
        if (inverted)
          puck.configure(
            h,
            {
              scale: {
                ...h.options.scale,
                [axis]: -(h.options.scale?.[axis] ?? 1),
              },
            },
            0,
          );
        puck.feed({ ...neutralInput, [axis]: 0.5 }, 0);
        puck.frame(0);
        const f = puck.frame(20),
          c = home();
        moveCamera(
          c,
          f.integrate(controls.translation),
          f.integrate(controls.rotation),
          { zoomAxis },
        );
        outcomes.push(c);
        puck.dispose(20);
      }
      const [a, b] = outcomes;
      a.target.forEach((v, i) => near(v, -b.target[i]));
      near(a.distance - 450, 450 - b.distance);
      a.orientation.slice(0, 3).forEach((v, i) => near(v, -b.orientation[i]));
    }
  }
  const forward = home();
  moveCamera(forward, [0, -20, 0], [0, 0, 0]);
  near(forward.distance, 470);
  const lift = home();
  moveCamera(lift, [0, 0, -20], [0, 0, 0], { zoomAxis: "vertical" });
  near(lift.distance, 430);
  const pan = home();
  moveCamera(pan, [0, -20, 0], [0, 0, 0], { zoomAxis: "vertical" });
  near(pan.target[1], 20);
  near(pan.distance, 450);
});
test("camera orbit keeps the pivot centered while preserving distance and orientation norm", () => {
  const c = cameraHome(),
    target = [...c.target],
    distance = c.distance;
  for (let i = 0; i < 10000; i++)
    moveCamera(c, [0, 0, 0], [0.002, 0.001, -0.003]);
  assert.deepEqual(c.target, target);
  near(c.distance, distance);
  near(Math.hypot(...c.orientation), 1);
  const p = projection(c.target, c, 800, 500);
  near(p[0], 400);
  near(p[1], 250);
});
test("screen-relative panning follows the camera after orbit; forward motion dollies", () => {
  const c = cameraHome();
  moveCamera(c, [0, 0, 0], [0.6, 0.4, 0.7]);
  const before = [...c.target],
    q = [...c.orientation];
  moveCamera(c, [12, 0, 8], [0, 0, 0]);
  const expected = rotate([-12, 8, 0], q);
  c.target.forEach((v, i) => near(v - before[i], expected[i]));
  const d = c.distance;
  moveCamera(c, [0, -30, 0], [0, 0, 0]);
  near(c.distance, d + 30);
  assert.deepEqual(c.orientation, q);
});
test("dolly changes perspective scale, bounds prevent crossing the pivot, neutral is stationary", () => {
  const c = cameraHome(),
    point = [120, 70, 0],
    a = projection(point, c, 800, 500);
  moveCamera(c, [0, 80, 0], [0, 0, 0]);
  const b = projection(point, c, 800, 500);
  assert.ok(Math.abs(b[0] - 400) > Math.abs(a[0] - 400));
  moveCamera(c, [0, 100000, 0], [0, 0, 0]);
  assert.equal(c.distance, 90);
  moveCamera(c, [0, -100000, 0], [0, 0, 0]);
  assert.equal(c.distance, 5000);
  const saved = structuredClone(c);
  moveCamera(c, [0, 0, 0], [0, 0, 0]);
  c.orientation.forEach((v, i) => near(v, saved.orientation[i]));
  assert.deepEqual(c.target, saved.target);
});

test("physical left tilt rolls the object left, and clockwise twist turns its front right", () => {
  const c = { target: [0, 0, 0], orientation: [0, 0, 0, 1], distance: 450 };
  moveCamera(c, [0, 0, 0], [0, 0.2, 0]);
  assert.ok(projection([0, 70, 0], c, 800, 500)[0] < 400);
  const yaw = { target: [0, 0, 0], orientation: [0, 0, 0, 1], distance: 450 };
  moveCamera(yaw, [0, 0, 0], [0, 0, 0.2]);
  assert.ok(projection([0, 0, 70], yaw, 800, 500)[0] > 400);
});
