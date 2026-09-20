import { createGestures, createGestureRecorder, defaultGestureTune, neutralInput } from '@clankagent/puck';
import { connectWebHid } from '@clankagent/puck/webhid';

/** Call from a click handler. Returns null when the chooser is cancelled. */
export async function connectGestureSession({ tune = defaultGestureTune, options = {}, onEvents = console.log, onDisconnect = () => {} } = {}) {
  const configuration = {...tune.toOptions(),...options};
  const gestures = createGestures(configuration);
  let recorder = null;
  let frameId;
  let stopped = false;
  function emit(events) { recorder?.events(events); if (events.length) onEvents(events); }
  function reset() { const now = performance.now(); emit(gestures.reset(now)); recorder?.reset(now); }
  const connection = await connectWebHid({
    onInput(input) {
      // Lifecycle sentinel is followed by onReset, not a physical release.
      if (input === neutralInput) return;
      const now = performance.now();
      recorder?.input(input, now);
      emit(gestures.update(input, now));
    },
    onReset: reset,
    onDisconnect() { stopped = true; cancelAnimationFrame(frameId); onDisconnect(); },
  });
  if (!connection) return null;
  function frame() {
    if (stopped) return;
    // Same current clock as reports, not rAF's earlier frame timestamp.
    const now = performance.now();
    recorder?.advance(now);
    emit(gestures.advance(now));
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);
  return {
    startRecording() {
      if (stopped) throw new Error('Session has ended.');
      if (recorder) throw new Error('Stop the current recording first.');
      reset();
      recorder = createGestureRecorder({ startTimeMs: performance.now(), options:configuration, source: 'device' });
    },
    stopRecording() {
      if (!recorder) return null;
      const recording = recorder.snapshot(performance.now());
      recorder = null;
      return recording;
    },
    get recordingFull() { return recorder?.full ?? false; },
    pause: connection.pause,
    resume: connection.resume,
    async close() {
      stopped = true;
      cancelAnimationFrame(frameId);
      await connection.close();
    },
  };
}
