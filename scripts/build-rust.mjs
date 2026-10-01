import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { rustEnv } from "./rust-env.mjs";
// TypeScript does not remove outputs of deleted sources. Only this generated
// directory is cleaned; otherwise obsolete JS implementations reach npm.
rmSync(new URL("../dist/", import.meta.url), { recursive: true, force: true });
const build = (args) => {
  const r = spawnSync("cargo", args, { stdio: "inherit", env: rustEnv });
  if (r.error) throw r.error;
  if (r.status) process.exit(r.status);
};
build([
  "build",
  "--locked",
  "--release",
  "-p",
  "puck-ffi",
  "--target",
  "wasm32-unknown-unknown",
]);
mkdirSync("src/generated", { recursive: true });
const bytes = readFileSync(
  "target/wasm32-unknown-unknown/release/puck_ffi.wasm",
);
const module = new WebAssembly.Module(bytes);
if (WebAssembly.Module.imports(module).length)
  throw Error("Puck WASM must have no host imports.");
writeFileSync(
  "src/generated/wasm.ts",
  `// Generated from puck-ffi. Do not edit.\nexport const coreWasmBase64 = '${bytes.toString("base64")}';\n`,
);
if (process.argv.includes("--native"))
  build(["build", "--locked", "--release", "-p", "puck-ffi"]);
console.log(
  `Puck WASM: ${bytes.length} bytes; synchronous ESM loading, no host imports.`,
);
