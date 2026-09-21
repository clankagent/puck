import test from "node:test";
import assert from "node:assert/strict";
import { control, recipes, createPuck } from "../dist/index.js";
import { codeControl } from "../examples/playground/showcase-code.js";
test("displayed declarations reconstruct the actual configured controls including nested values", () => {
  const controls = [
    ...Object.values(recipes.sixAxis()),
    ...Object.values(recipes.panZoom()),
    control.continuous("axes", {
      scale: { x: -1 },
      as: "velocity",
      speed: { translation: 20, rotation: 2 },
    }),
    control.gesture({ pressure: "push", twist: "cw" }),
    control.gesture("pull", { count: 2 }),
    recipes.directionSelection({
      activation: "pull",
      cancel: { input: "twist", direction: "same", count: 2 },
    }),
    recipes.heldValue("push", "tilt"),
  ];
  for (const original of controls) {
    const rebuilt = Function(
      "control",
      `return ${codeControl(original)}`,
    )(control);
    assert.deepEqual(rebuilt, original);
  }
  const held = recipes.heldValue("push", "twist");
  const puck = createPuck({ controls: { held }, clock: () => 0 });
  puck.configure(held, { valueOptions: { speed: 7 } });
  const current = puck.inspect(held).controls[0].definition;
  assert.deepEqual(
    Function("control", `return ${codeControl(current)}`)(control),
    current,
  );
  puck.dispose();
});
