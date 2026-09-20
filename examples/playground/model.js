export const axes = ['x', 'y', 'z', 'rx', 'ry', 'rz'];
export const labels = { clockwise: 'Clockwise', counterclockwise: 'Counterclockwise', push: 'Push', pull: 'Pull', 'rx+': 'Tilt rx+', 'rx-': 'Tilt rx−', 'ry+': 'Tilt ry+', 'ry-': 'Tilt ry−' };
export const tilts = ['rx+', 'rx-', 'ry+', 'ry-'];
export const gestures = [
  ...Object.keys(labels).flatMap(direction => ['single', 'double'].map(kind => ({ direction, kind, group: tilts.includes(direction) ? 'Standalone tilt' : 'Twist & press' }))),
  ...['push', 'pull'].flatMap(direction => tilts.map(tilt => ({ direction, tilt, kind: 'single', group: 'Press + tilt' }))),
];
export const key = event => `${event.direction}.${event.tilt ?? event.kind}`;
export const title = event => `${labels[event.direction]}${event.tilt ? ' + ' + event.tilt.replace('-', '−') : ' · ' + event.kind}`;
export function enabledGesture(gesture, options) {
  if (gesture.tilt) return options.pressMode === 'auto' || options.pressMode === 'tilt';
  if (tilts.includes(gesture.direction)) return Boolean(options.standaloneTilt);
  return !(options.pressMode === 'tilt' && ['push', 'pull'].includes(gesture.direction) && gesture.kind === 'single');
}
export function createCounts() {
  const counts = Object.fromEntries(gestures.map(g => [key(g), 0]));
  return { counts, add(events) { for (const event of events) if (Object.hasOwn(counts, key(event))) counts[key(event)]++; }, reset() { for (const k of Object.keys(counts)) counts[k] = 0; } };
}
export function deflection(direction, force = .75) {
  const value = Object.fromEntries(axes.map(a => [a, 0]));
  if (direction === 'clockwise' || direction === 'counterclockwise') value.rz = force * (direction === 'clockwise' ? 1 : -1);
  else if (direction === 'push' || direction === 'pull') value.z = force * (direction === 'push' ? 1 : -1);
  else value[direction.slice(0, -1)] = force * (direction.endsWith('+') ? 1 : -1);
  return value;
}
// Actual input reports, never fabricated recognition events. The SDK decides what counts.
export function sequence(gesture, force = .75) {
  const neutral = deflection('x+', 0), value = deflection(gesture.direction, force);
  const rows = [{ t: 0, input: neutral }, { t: 60, input: value }];
  if (gesture.tilt) rows.push({ t: 140, input: { ...value, ...Object.fromEntries(Object.entries(deflection(gesture.tilt, force)).filter(([, v]) => v !== 0)) } });
  rows.push({ t: gesture.tilt ? 260 : 180, input: neutral });
  if (gesture.kind === 'double') rows.push({ t: 300, input: value }, { t: 420, input: neutral });
  return rows;
}
