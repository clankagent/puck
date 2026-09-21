import { createPuck, control, recipes } from '../../dist/index.js';
import type { Vec2, Vec3, Velocity } from '../../dist/index.js';
const move = control.continuous('slide', { as: 'velocity', speed: 2 });
const raw = control.continuous('axes');
const action = control.gesture('push');
const held = control.interaction({ activation: 'pull', value: 'tilt' });
const choose = recipes.directionSelection({ activation: 'push' });
const rate = control.interaction({ activation: 'pull', value: control.continuous('rotation', { as: 'velocity' }) });
const puck = createPuck({ controls: { move, raw, action, held, choose, rate } });
const velocity: Velocity<Vec2> = puck.read(move);
const delta: Vec2 = puck.frame(0).integrate(move);
const axes: number = puck.read(raw).rz;
const state = puck.read(held);
if (state.status === 'active') { const value: Vec2 = state.value; }
puck.on(choose, e => {
  if (e.type === 'commit') { const selected: number = e.value; }
  if (e.type === 'begin') { const preview: number | null = e.value; }
  if (e.type === 'cancel') { const reason: string = e.reason; }
});
const r: Vec3 = puck.frame(1).integrate(rate);
puck.configure(move, { speed: 3 });
// @ts-expect-error occurrences do not have a continuous state
puck.read(action);
// @ts-expect-error continuous values do not emit lifecycle/command events
puck.on(move, () => {});
// @ts-expect-error raw deflection is not integrated movement
puck.frame(2).integrate(raw);
// @ts-expect-error a raw vector-valued interaction is not a velocity
puck.frame(3).integrate(held);
// @ts-expect-error changing the source is a structural change
puck.configure(move, { source: 'twist' });
// @ts-expect-error a vector is not a scalar
const scalar: number = puck.read(move);
// @ts-expect-error inactive sessions have no live value
if (state.status === 'inactive') state.value;
