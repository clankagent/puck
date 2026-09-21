import { replayPuck } from './puck.js';
import type { PuckRecording } from './puck.js';
import { sourceAxes } from './controls.js';

/** Renderer-neutral raw, lifecycle and integrated-motion data from the same replay. */
export function createControlGraph(recording: PuckRecording) {
  const replay = replayPuck(recording);
  const controls = [...Object.values(replay.controls), ...Object.values(replay.contexts).flatMap(Object.values)];
  return {
    complete: replay.complete,
    axes: sourceAxes.axes.map(axis => ({ axis, points: recording.timeline.filter(op => op.type === 'feed').map(op => ({ time: op.time, value: op.input[axis] })) })),
    events: replay.events.map(event => ({ ...event, control: replay.puck.inspect(event.control).controls[0].name })),
    changes: recording.timeline.filter(op => ['configure', 'context', 'interrupt', 'cancel'].includes(op.type)),
    movement: controls.filter(c => c.kind === 'continuous' && c.options.as === 'velocity' || c.kind === 'interaction' && typeof c.options.value !== 'string' && c.options.value.options.as === 'velocity').map(c => ({
      control: replay.puck.inspect(c).controls[0].name,
      intervals: replay.frames.map(frame => ({ start: frame.start, end: frame.end, delta: frame.integrate(c as any) })),
    })),
  };
}
