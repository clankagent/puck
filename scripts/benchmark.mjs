// Diagnostic comparison, not a timing assertion. No physical captures.
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import * as old from "../tests/reference/dist/index.js";
import * as rust from "../dist/index.js";
for (const [label, api] of [
  ["TypeScript reference", old],
  ["Rust/WASM facade", rust],
]) {
  const pan = api.control.continuous("slide", { as: "velocity" }),
    p = api.createPuck({ controls: { pan }, clock: () => 0 }),
    input = { ...api.neutralInput, x: 0.5, y: 0.2 };
  let time = 0;
  const run = () => {
    p.feed(input, time++);
    p.frame(time++).integrate(pan);
  };
  for (let i = 0; i < 1000; i++) run();
  const values = [];
  for (let round = 0; round < 5; round++) {
    const start = performance.now();
    for (let i = 0; i < 10000; i++) run();
    values.push((performance.now() - start) / 10000);
  }
  values.sort((a, b) => a - b);
  p.dispose(time);
  console.log(
    JSON.stringify({
      implementation: label,
      medianMicrosecondsPerFeedAndFrame: values[2] * 1000,
      p95BatchMicroseconds: values.at(-1) * 1000,
    }),
  );
}
const bytes = readFileSync(
  "target/wasm32-unknown-unknown/release/puck_ffi.wasm",
);
console.log(
  JSON.stringify({
    wasmBytes: bytes.length,
    gzipWasmBytes: gzipSync(bytes).length,
    embeddedJavaScriptBytes: readFileSync("dist/generated/wasm.js").length,
  }),
);
