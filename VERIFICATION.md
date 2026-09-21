# Verification

Puck 1.0.0: 137 automated tests and public TypeScript fixtures pass. The release
was approved after physical playground testing and review of a real-device
performance trace on 2026-09-21.

See [the full scope and limitations](docs/v1-verification.md) for software coverage,
physical observations, measured timing and unsupported hardware/calibration cases.
The former preview-only release gate has been satisfied for 1.0.0.

Reproduce the source checks with pnpm install --frozen-lockfile, pnpm check and
pnpm site:build. Follow [RELEASING.md](RELEASING.md) for artifact inspection,
clean-consumer checks, tag CI, npm publication and registry verification.
CI artifacts and Git history preserve prior verification milestones; private
physical recordings and trace files are intentionally not shipped.
