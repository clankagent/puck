# Rust, WASM and native integration

Puck 2.0.0-alpha.2 uses one Rust processing core. The typed TypeScript facade
retains control identity, immutable results, subscriptions and the optional
WebHID adapter. Native applications supply normalized reports and timestamps.
The core opens no devices, injects no mouse events, writes no files, and makes
no network calls. Recordings and traces remain in memory until the caller
chooses to save them.

The [Unreleased fixes](../CHANGELOG.md#unreleased) improve precedence ordering,
JSON numeric portability and validation without changing C ABI 1, installation
entry points or hardware support. They are source changes; the available
published preview remains 2.0.0-alpha.2.

## Build and browser use

Install the pinned Rust toolchain and its wasm32-unknown-unknown target, Node 24,
pnpm 10.33.0 and a C++ compiler for the native comparison runner. `pnpm check`
builds Rust/WASM/native, compiles the TypeScript reference, checks public types,
and runs the existing and differential tests. `cargo test --locked --workspace`
checks the C ABI, including invalid input, stale handles and thread affinity.
Windows GNU builds need MinGW on PATH; Windows MSVC builds need Visual Studio
Build Tools. A local rustup override can select the GNU toolchain.

The npm ESM build embeds WASM as generated base64 JavaScript. Loading the module
compiles it synchronously, so `createPuck()` stays synchronous. There is no
fetch, extra asset URL, wasm-bindgen runtime, initialization promise or fallback
TypeScript engine. Consumers need WebAssembly, TextEncoder/TextDecoder, atob and
FinalizationRegistry. A CSP must permit WASM compilation (for example,
`script-src 'self' 'wasm-unsafe-eval'` where supported). Embedded WASM increases
download and startup cost; see [verification](rust-verification.md). The standalone
`puck-core.wasm` uses the same C ABI, 32-bit offsets and exported memory. It has
zero host imports. The application owns instantiation and memory access.

## C ABI 1

Include `puck.h`. Functions use the C calling convention, uint32_t handles,
size_t lengths and double-precision axes/timestamps. Load a verified library
using an absolute path in an application-owned directory. Windows x64 MSVC
release binaries require the [Microsoft x64 Visual C++ v14 runtime](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170). Match library and
process architecture; inspect `build-info.json` and SHA256SUMS.txt. A checksum
detects changes against a trusted release; it does not establish publisher
identity. These initial binaries are not Authenticode signed.

1. Verify `puck_abi_version() == 1`.
2. Pass UTF-8 JSON to `puck_create`, retaining its nonzero handle.
3. Call `puck_feed` for reports or `puck_command` for operations.
4. Read `puck_response_len`, then copy into your own buffer using
   `puck_response_copy`. Copy before another call on that handle.
5. Call `puck_destroy` exactly once when finished.

All calls, output reads and destruction for an engine must run on the same
OS thread. A single dedicated input worker is a good fit for JVM applications;
coroutines that switch threads need explicit dispatching. Responses use
`{"ok":true,"value":...}` or `{"ok":false,"error":"...","type":"RangeError"}`.
A create failure returns 0; its error response is available at handle 0.
Unknown/destroyed/wrong-thread handles fail without touching caller memory.
Short output buffers return 0 without a partial copy.

Buffers must remain valid for the specified lengths. The optional `puck_alloc`
and `puck_free` helpers require the exact original pointer and length, freed
once. They are useful for WASM; JNA can use its own Memory instead. Invalid
pointers or freeing someone else's allocation violate the C contract. The
library is an in-process component, not a sandbox for untrusted code.

Requests are capped at 16 MiB, serde JSON recursion is bounded, each runtime
allows at most 256 controls, and each thread permits 4096 engines. Recording
and event capacities are configurable and bounded. Large recordings can still
consume substantial memory. Reject externally supplied files before processing
them; retain only the data your application needs.

## Runtime protocol

Create a runtime with the serialized control definitions from the TypeScript
API. Structural definitions and tunable settings have the same JSON shape.
Native control identifiers are `controls.name` or `contexts.context.name`.

```json
{
  "kind": "puck",
  "options": {
    "controls": {
      "scroll": {
        "kind": "continuous",
        "source": "twist",
        "options": { "as": "velocity", "speed": 1 }
      }
    }
  }
}
```

Commands carry an `op` and, for mutations, a finite monotonic `time` in
milliseconds. `puck_feed(handle,time,x,y,z,rx,ry,rz)` is equivalent to the
runtime `feed` command and avoids input JSON serialization. Feed every report,
including neutral; do not fabricate neutral because reports stopped arriving.

| Operation       | Additional fields                         | Result value                                |
| --------------- | ----------------------------------------- | ------------------------------------------- |
| feed            | time, input with six axes in [-1,1]       | null                                        |
| advance         | time                                      | null                                        |
| read            | control                                   | continuous value or interaction state       |
| frame           | time                                      | start, end, results indexed by control name |
| interrupt       | time, reason (e.g. pause/disconnect/blur) | null                                        |
| cancel          | time, interaction control                 | null                                        |
| context         | time, context                             | null                                        |
| configure       | time, control, settings patch             | null                                        |
| settings        | —                                         | portable settings JSON                      |
| restoreSettings | time, settings                            | null                                        |
| inspect         | optional control                          | diagnostic state                            |
| recording       | —                                         | recording (requires record:true)            |
| recordingFull   | —                                         | boolean                                     |
| events          | —                                         | retained event log                          |

Each runtime result is `{"value":...,"events":[...]}` inside the ABI success
response. Events have control names, sequence numbers, exact semantic timestamps
and optional evidence when trace:true. Consume the events in each mutation
response, or use sequence numbers to read the retained log without duplication.
Frames integrate velocity over report boundaries with the configured frame cap;
call an initial frame before expecting displacement. Pausing cancels immediately
and requires a real fresh neutral report before rearming. The desktop host will
own the global pause shortcut, scroll injection and twist/tilt selection.

In unreleased source, precedence uses a topological order, with registration order
among ready controls. Equivalent numeric JSON spellings have the same meaning:
`responseMs:0.0` disables smoothing just like `responseMs:0`, and integral decimal
versions, counts, report IDs and bytes are accepted within their existing ranges.
Restoring numerically identical settings, including nested definitions, produces
no configuration changes or cancellation events. Invalid supplied gesture
thresholds or explicit reset times return an error before changing state; omitting
the gesture reset time still uses the last processed time.

Other engine kinds are `gestures`, `motion`, `recorder` and `utilities`.
Gestures support update/input+time, advance/time, reset/optional time and state.
Motion supports input, step/time, zoom/source and reset. Recorder supports input,
advance, reset, events, snapshot/time and full. Utilities support normalize/definition,
tune/data (omitted means default), tuneOptions/data, tuneEdit/data+edit+amount,
decode/reportId+bytes, validateRecording/recording, and calibrateGestures,
calibratePressTilts or calibrateTilts with recordings+settings. Rust callers can
use `puck_core::Engine` directly and avoid the FFI.

## JVM integration and distribution

[PuckSmoke.kt](../examples/native/PuckSmoke.kt) demonstrates C calling convention,
correct size_t width, UTF-8 buffers, double values and deterministic destruction.
Compile it against JNA and run with the native library's absolute path. No JNI
bridge, Rust UI or native Kotlin toolchain is required. Kotlin/JVM owns the
Windows APIs later; the core stays the same. C# can call the same ABI using
Cdecl P/Invoke with uint handles, nuint lengths and double values.

GitHub prerelease assets are built from the tagged commit after parity and
privacy checks. The allowlist contains the library, standalone WASM, header,
this document, license, build information and hashes. It excludes captures,
test fixtures, debug symbols, PDBs, caches, paths, credentials and host metadata.
The npm tarball contains the ESM facade and embedded WASM, with linked docs.
Releases do not run an installer, access HID devices, or add background services.
