import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { homedir, arch } from "node:os";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const target = spawnSync("rustc", ["-vV"], { encoding: "utf8" }).stdout.match(
  /^host: (.+)$/m,
)?.[1];
if (!target) throw Error("Could not identify native target.");
const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
if (git.status) throw Error("Could not identify source commit.");
const platform =
  process.platform === "win32"
    ? "windows"
    : process.platform === "linux"
      ? "linux"
      : process.platform === "darwin"
        ? "macos"
        : null;
if (!platform || arch() !== "x64")
  throw Error("Only x64 release artifacts are verified.");
const native =
  process.platform === "win32"
    ? "puck_ffi.dll"
    : process.platform === "linux"
      ? "libpuck_ffi.so"
      : "libpuck_ffi.dylib";
const out = `artifacts/runtime-${platform}-x64`;
mkdirSync(out, { recursive: true });
const files = [
  ["target/wasm32-unknown-unknown/release/puck_ffi.wasm", "puck-core.wasm"],
  [
    `target/release/${native}`,
    `puck-ffi-${platform}-x64.${native.split(".").at(-1)}`,
  ],
  ["include/puck.h", "puck.h"],
  ["docs/native.md", "NATIVE.md"],
  ["LICENSE", "LICENSE"],
];
const allowed = [
  ...files.map(([, name]) => name),
  "build-info.json",
  "SHA256SUMS.txt",
];
for (const name of readdirSync(out))
  if (!allowed.includes(name)) throw Error(`Unexpected release file: ${name}`);
if (!readFileSync("Cargo.toml", "utf8").includes(`version = "${pkg.version}"`))
  throw Error("Cargo and npm versions must match.");
const forbidden = [
  process.cwd(),
  homedir(),
  /C:[\\/]Users[\\/]/i,
  /\/home\/(runner|[^/\s]+)/,
  /-----BEGIN .*PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
];
const hashes = [];
for (const [source, name] of files) {
  const bytes = readFileSync(source),
    text = bytes.toString("latin1");
  if (
    forbidden.some((pattern) =>
      typeof pattern === "string" ? text.includes(pattern) : pattern.test(text),
    )
  )
    throw Error(`Privacy scan failed for ${name}`);
  if (
    name.endsWith(".wasm") &&
    WebAssembly.Module.imports(new WebAssembly.Module(bytes)).length
  )
    throw Error("Unexpected WASM host imports.");
  copyFileSync(source, `${out}/${name}`);
  hashes.push(`${createHash("sha256").update(bytes).digest("hex")}  ${name}`);
}
const info = {
  version: pkg.version,
  abi: 1,
  commit: git.stdout.trim(),
  nativeTarget: target,
  wasmTarget: "wasm32-unknown-unknown",
  rust: spawnSync("rustc", ["--version"], { encoding: "utf8" }).stdout.trim(),
  debugSymbols: false,
  hostImports: 0,
};
writeFileSync(`${out}/build-info.json`, JSON.stringify(info, null, 2) + "\n");
hashes.push(
  `${createHash("sha256")
    .update(readFileSync(`${out}/build-info.json`))
    .digest("hex")}  build-info.json`,
);
writeFileSync(`${out}/SHA256SUMS.txt`, hashes.join("\n") + "\n");
console.log(`Verified release allowlist and hashes: ${out}`);
