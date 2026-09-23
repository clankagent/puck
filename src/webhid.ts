import { decodeCombinedReport, neutralInput } from './input.js';
import type { InputState } from './input.js';
import type { Puck, CancelReason } from './puck.js';

/** Structural browser interfaces keep WebHID globals out of the core package. */
export interface HidReportEvent extends Event { reportId: number; data: DataView }
export interface HidDevice extends EventTarget {
  readonly vendorId: number;
  readonly productId: number;
  readonly opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
}
export interface HidAccess extends EventTarget {
  requestDevice(options: { filters: Array<{ vendorId: number; productId: number; usagePage?: number; usage?: number }> }): Promise<HidDevice[]>;
}
export interface DeviceProfile {
  vendorId: number;
  productId: number;
  usagePage?: number;
  usage?: number;
  decode(reportId: number, data: DataView): InputState | null;
  /** Return the currently held, one-based button numbers, or null for other reports. */
  decodeButtons?(reportId: number, data: DataView): readonly number[] | null;
}
export type ButtonEvent = Readonly<{ button: number; type: 'down' | 'up' }> |
  Readonly<{ button: number; type: 'cancel'; reason: CancelReason }>;

/** Measured 256f:c63a button report: two bits followed by constant padding. */
export function decodeWirelessButtons(reportId: number, data: DataView): readonly (1 | 2)[] | null {
  if (reportId !== 3 || data.byteLength !== 12) return null;
  const mask = data.getUint8(0);
  const buttons: (1 | 2)[] = [];
  if (mask & 1) buttons.push(1);
  if (mask & 2) buttons.push(2);
  return buttons;
}

/** Hardware-verified 256f:c63a motion and button profile. */
export const combinedProfile: Readonly<DeviceProfile> = Object.freeze({
  vendorId: 0x256f, productId: 0xc63a, usagePage: 1, usage: 8,
  decode: decodeCombinedReport, decodeButtons: decodeWirelessButtons,
});
export interface ConnectionOptions {
  onInput(input: Readonly<InputState>): void;
  /** Button edges. A held button emits cancel on lifecycle interruption, never up. */
  onButton?(event: ButtonEvent): void;
  /** Reset processor timing/response on pause, blur, hidden, close or disconnect. */
  onReset?(): void;
  /** Explicit lifecycle reason for application runtimes. */
  onInterrupt?(reason: CancelReason): void;
  onDisconnect?(): void;
  profile?: DeviceProfile;
  /** Inject for tests or an alternative WebHID implementation. */
  hid?: HidAccess;
  /** Default true: blur/hidden clears input and waits for a fresh report on return. */
  pauseOnBlur?: boolean;
}
export interface InputConnection {
  readonly device: HidDevice;
  pause(): void;
  resume(): void;
  close(): Promise<void>;
}

/** Call from a user gesture. Cancellation returns null. No frame loop is started. */
export async function connectWebHid(options: ConnectionOptions): Promise<InputConnection | null> {
  const hid = options.hid ?? (globalThis.navigator as Navigator & { hid?: HidAccess } | undefined)?.hid;
  if (!hid) throw new Error('This browser does not provide WebHID.');
  const profile = options.profile ?? combinedProfile;
  const candidates = await hid.requestDevice({ filters: [{ vendorId: profile.vendorId, productId: profile.productId, usagePage: profile.usagePage, usage: profile.usage }] });
  const device = candidates.find(candidate => candidate.vendorId === profile.vendorId && candidate.productId === profile.productId);
  if (!device) return null;
  await device.open();
  const page = typeof window === 'undefined' ? undefined : window;
  const document = page?.document;
  const focusPolicy = options.pauseOnBlur ?? true;
  let paused = false;
  let closed = false;
  let heldButtons = new Set<number>();
  let buttonsNeedNeutral = false;
  const isForeground = () => !focusPolicy || !document || document.hasFocus() && !document.hidden;
  const clear = (reason: CancelReason) => {
    const canceled = heldButtons;
    heldButtons = new Set();
    buttonsNeedNeutral = true;
    for (const button of canceled) options.onButton?.({ button, type: 'cancel', reason });
    options.onInput(neutralInput); options.onReset?.(); options.onInterrupt?.(reason);
  };
  const report = (event: Event) => {
    if (paused || closed || !isForeground()) return;
    const input = event as HidReportEvent;
    const decoded = profile.decode(input.reportId, input.data);
    if (decoded) options.onInput(decoded);
    if (paused || closed || !isForeground()) return;
    const buttons = profile.decodeButtons?.(input.reportId, input.data);
    if (buttons === null || buttons === undefined) return;
    if (buttonsNeedNeutral) {
      if (buttons.length === 0) buttonsNeedNeutral = false;
      return;
    }
    const next = new Set(buttons);
    const released = [...heldButtons].filter(button => !next.has(button));
    const pressed = [...next].filter(button => !heldButtons.has(button));
    for (const button of released) {
      if (paused || closed || !isForeground()) return;
      heldButtons.delete(button);
      options.onButton?.({ button, type: 'up' });
    }
    for (const button of pressed) {
      if (paused || closed || !isForeground()) return;
      heldButtons.add(button);
      options.onButton?.({ button, type: 'down' });
    }
  };
  const blur = () => { if (focusPolicy) clear('blur'); };
  const visibility = () => { if (document?.hidden) blur(); };
  const detach = () => {
    device.removeEventListener('inputreport', report);
    hid.removeEventListener('disconnect', disconnect);
    page?.removeEventListener('blur', blur);
    document?.removeEventListener('visibilitychange', visibility);
  };
  const disconnect = (event: Event) => {
    if ((event as Event & { device: HidDevice }).device !== device) return;
    closed = true;
    detach();
    clear('disconnect');
    options.onDisconnect?.();
  };
  device.addEventListener('inputreport', report);
  hid.addEventListener('disconnect', disconnect);
  page?.addEventListener('blur', blur);
  document?.addEventListener('visibilitychange', visibility);
  return {
    device,
    pause() { if (!closed) { paused = true; clear('pause'); } },
    resume() { if (!closed) paused = false; },
    async close() {
      if (closed) return;
      closed = true;
      detach();
      try { clear('close'); } finally { await device.close(); }
    },
  };
}

/** Optional browser bridge. Owns deadline ticking, never a rendering loop. */
export async function connectPuck(puck: Puck, options: Omit<ConnectionOptions, 'onInput' | 'onReset' | 'onInterrupt'> & { onError?: (error: unknown) => void } = {}): Promise<InputConnection | null> {
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => { if (timer !== undefined) clearInterval(timer); timer = undefined; };
  const connection = await connectWebHid({ ...options,
    onInput(value) { if (value !== neutralInput) puck.feed(value); },
    onInterrupt(reason) { puck.interrupt(reason); },
    onDisconnect() { stop(); options.onDisconnect?.(); },
  });
  if (!connection) return null;
  timer = setInterval(() => { try { puck.advance(); } catch (error) { stop(); options.onError?.(error); } }, 16);
  return { device: connection.device, pause() { connection.pause(); }, resume() { connection.resume(); }, async close() { stop(); await connection.close(); } };
}
