import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { rustEnv } from "./rust-env.mjs";
const run = (program, args) => {
  const r = spawnSync(program, args, { stdio: "inherit", env: rustEnv });
  if (r.error) throw r.error;
  if (r.status) process.exit(r.status);
};
run("cargo", [
  "build",
  "--locked",
  "--release",
  "-p",
  "puck-core",
  "--example",
  "parity",
]);
mkdirSync("target/parity", { recursive: true });
if (process.platform === "win32")
  run(process.env.PUCK_CXX ?? "g++", [
    "-std=c++17",
    "-O2",
    "tests/native/abi-runner.cpp",
    "-o",
    resolve("target/parity/abi-runner.exe"),
  ]);
else
  run("c++", [
    "-std=c++17",
    "-O2",
    "tests/native/abi-runner.cpp",
    "-ldl",
    "-o",
    "target/parity/abi-runner",
  ]);
