/** Normalized cap deflection, in device coordinates. Not distance or velocity. */
export interface InputState {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

export const neutralInput: Readonly<InputState> = Object.freeze({
  x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0,
});

/** Decode the measured combined report. Non-motion reports return null. */
export function decodeCombinedReport(reportId: number, data: DataView): InputState | null {
  if (reportId !== 1 || data.byteLength !== 12) return null;
  const axis = (offset: number) => Math.max(-1, Math.min(1, data.getInt16(offset, true) / 350));
  return { x: axis(0), y: axis(2), z: axis(4), rx: axis(6), ry: axis(8), rz: axis(10) };
}
