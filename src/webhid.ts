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
}
/** Hardware-verified combined six-axis report profile. */
export const combinedProfile: Readonly<DeviceProfile> = Object.freeze({
  vendorId: 0x256f, productId: 0xc63a, usagePage: 1, usage: 8, decode: decodeCombinedReport,
});
export interface ConnectionOptions {
  onInput(input: Readonly<InputState>): void;
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
  const isForeground = () => !focusPolicy || !document || document.hasFocus() && !document.hidden;
  const clear = (reason: CancelReason) => { options.onInput(neutralInput); options.onReset?.(); options.onInterrupt?.(reason); };
  const report = (event: Event) => {
    if (paused || closed || !isForeground()) return;
    const input = event as HidReportEvent;
    const decoded = profile.decode(input.reportId, input.data);
    if (decoded) options.onInput(decoded);
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
