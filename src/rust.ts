import { coreWasmBase64 } from "./generated/wasm.js";
interface Abi {
  memory: WebAssembly.Memory;
  puck_abi_version(): number;
  puck_alloc(length: number): number;
  puck_free(ptr: number, length: number): void;
  puck_create(ptr: number, length: number): number;
  puck_destroy(handle: number): number;
  puck_command(handle: number, ptr: number, length: number): number;
  puck_feed(
    handle: number,
    time: number,
    x: number,
    y: number,
    z: number,
    rx: number,
    ry: number,
    rz: number,
  ): number;
  puck_response_len(handle: number): number;
  puck_response_copy(handle: number, ptr: number, length: number): number;
}
const bytes = Uint8Array.from(atob(coreWasmBase64), (c) => c.charCodeAt(0));
const wasm = new WebAssembly.Instance(new WebAssembly.Module(bytes), {})
  .exports as unknown as Abi;
if (wasm.puck_abi_version() !== 1) throw Error("Unsupported Puck ABI.");
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
function buffer<T>(bytes: Uint8Array, body: (ptr: number) => T): T {
  const ptr = wasm.puck_alloc(bytes.length);
  if (!ptr) throw Error("Puck buffer allocation failed.");
  try {
    new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
    return body(ptr);
  } finally {
    wasm.puck_free(ptr, bytes.length);
  }
}
function response(handle: number): any {
  const length = wasm.puck_response_len(handle);
  if (!length) throw Error("Unknown or disposed Puck handle.");
  const ptr = wasm.puck_alloc(length);
  try {
    if (wasm.puck_response_copy(handle, ptr, length) !== length)
      throw Error("Puck response copy failed.");
    const result = JSON.parse(
      decoder.decode(new Uint8Array(wasm.memory.buffer, ptr, length)),
    );
    if (!result.ok) throw new RangeError(result.error);
    return result.value;
  } finally {
    wasm.puck_free(ptr, length);
  }
}
const finalizer = new FinalizationRegistry<number>((h) => wasm.puck_destroy(h));
/** Host-owned object identity/lifetime. Processing lives exclusively in Rust. */
export class RustEngine {
  private handle: number;
  constructor(kind: string, options: unknown) {
    const bytes = encoder.encode(JSON.stringify({ kind, options }));
    this.handle = buffer(bytes, (ptr) => wasm.puck_create(ptr, bytes.length));
    if (!this.handle) response(0);
    finalizer.register(this, this.handle, this);
  }
  call<T = any>(op: string, data: Record<string, unknown> = {}): T {
    const bytes = encoder.encode(JSON.stringify({ op, ...data }));
    return buffer(bytes, (ptr) => {
      wasm.puck_command(this.handle, ptr, bytes.length);
      return response(this.handle);
    });
  }
  feed(
    input: {
      x: number;
      y: number;
      z: number;
      rx: number;
      ry: number;
      rz: number;
    },
    time: number,
  ): any {
    wasm.puck_feed(
      this.handle,
      time,
      input.x,
      input.y,
      input.z,
      input.rx,
      input.ry,
      input.rz,
    );
    return response(this.handle);
  }
  dispose() {
    if (this.handle) {
      wasm.puck_destroy(this.handle);
      this.handle = 0;
      finalizer.unregister(this);
    }
  }
}
let utilities: RustEngine | undefined;
export function coreCall<T = any>(
  op: string,
  data: Record<string, unknown> = {},
): T {
  return (utilities ??= new RustEngine("utilities", {})).call<T>(op, data);
}
