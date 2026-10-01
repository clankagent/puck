# Rust rewrite verification

The frozen comparison implementation is source commit `0078217` (Puck 1.1.0).
It is compiled only for tests and excluded from distributed packages. It must
not be edited to make the Rust implementation pass.

The existing 141 behavior tests pass through the Rust-backed TypeScript API,
as do the public TypeScript compile fixtures. Six additional differential tests
compare 127 engines and 15,667 result/state snapshots against that frozen
implementation. The same corpus runs through WASM, direct native Rust and an
independently loaded DLL/shared library. Event types, directions, ordering,
timestamps, durations, sequences and lifecycle outcomes compare exactly.
Numerical motion/tune values allow relative/absolute tolerance 1e-11 for
platform math differences. Coverage includes all 32 catalog sequences and three
presets, 24 seeded streams of 250 noisy reports, four response times, configuration,
ownership, context changes, cancellation, frames, traces, recordings, and complete
simple/combined/standalone calibration datasets. Fixtures are synthetic.

Three native ABI tests cover malformed JSON/options, numeric validation,
atomic structural rejection, null/short buffers, oversized requests, stale
handles, destruction, allocation and calls from another thread. These tests
exercise valid memory contracts; they do not establish that arbitrary invalid
C pointers are safe. Rustfmt and Clippy with warnings denied pass. Dependency
audits reported zero known RustSec and pnpm advisories on 2026-10-01; this is a
point-in-time check, not a guarantee of absence of defects.

A Kotlin 2.4.20 / JNA 5.19.1 / Java 21 library smoke loads the x64 Windows GNU
DLL, creates a twist velocity control, feeds 0.5, reads 0.5 and destroys it.
The DLL depends only on Windows system libraries in the checked GNU build.
No mouse events were injected and no SpaceMouse was connected for this rewrite.
The prior physical device scope remains unchanged; see
[v1 verification](v1-verification.md) and [buttons](buttons.md).

Headless Chromium 154 imported all three ESM entry points under a CSP allowing
WASM compilation, integrated a synthetic report, interrupted it and observed
zero movement. All module requests were intercepted locally; there were no
WASM fetches or external requests. Browser HID permissions and actual-device
latency were not retested. CI repeats the browser smoke in Chromium.

## Cost measurements

`pnpm benchmark` compares the frozen TypeScript implementation with the WASM
facade using one continuous slide control, a feed and a frame per iteration,
warm-up followed by five batches of 10,000 iterations. A Windows Node 24 run
measured approximately 1.8 microseconds for TypeScript and 17.4 microseconds for
the Rust/WASM facade per feed+frame. The browser smoke's cold module import took
about 90 ms. Results vary with machine, contention and engine version.

The checked WASM binary was 525,352 bytes (170,969 gzip bytes); the base64 ESM
asset was 700,547 bytes before compression. Exact release sizes may change with
compiler and source changes. The bridge allocates and uses JSON responses, so
this rewrite is **not a demonstrated browser speed improvement**. It provides
one processing implementation for browser and native consumers while retaining
the measured semantics. Normal input rates leave substantial timing margin in
this synthetic case, but the eventual desktop app needs its own end-to-end
latency measurements. `pnpm browser:check` and `pnpm benchmark` reproduce these
software checks without device access or a local server.

Release generation remaps checkout/home paths, strips debug information, checks
WASM host imports, scans the explicit asset allowlist for host paths and obvious
secret formats, and writes SHA-256 checksums with commit/toolchain metadata.
The checks are scoped to the distributed artifacts. See [native integration](native.md)
for the boundary contract and [release process](../RELEASING.md).
