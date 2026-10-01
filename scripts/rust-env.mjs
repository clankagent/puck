import { homedir } from "node:os";
// Encoded flags keep paths containing spaces as one argument. Build artifacts must
// not reveal checkout, Cargo cache, toolchain or runner home directories.
export const rustEnv = {
  ...process.env,
  CARGO_ENCODED_RUSTFLAGS: [
    ...(process.env.CARGO_ENCODED_RUSTFLAGS?.split("\x1f") ??
      process.env.RUSTFLAGS?.split(/\s+/).filter(Boolean) ??
      []),
    `--remap-path-prefix=${process.cwd()}=/puck`,
    `--remap-path-prefix=${homedir()}=/build-home`,
  ].join("\x1f"),
};
