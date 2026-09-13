# Contributing

Use Node 24 and the pnpm version in package.json. Run pnpm install and pnpm check.
Small fixes can go straight to a pull request. For a new API or device profile,
open an issue describing the use case first so we can agree on the scope.

Keep transport, processing and rendering separate. Preserve neutral stopping,
held input between reports and frame-rate independence. Include a regression
test for behavioral changes. Avoid adding dependencies or per-frame work without
a measured need.

For device support, include vendor/product IDs, connection type, browser/OS,
report descriptor and a short sequence of report IDs and hexadecimal payloads
for neutral, each single-axis gesture, hold and release. Relative timestamps
are sufficient. Remove serial numbers, device names, account information and
other personal metadata. Do not infer support from a shared vendor ID.

Only describe physical behavior as tested when someone has actually tested it.
Synthetic report tests establish decoding and lifecycle behavior, not hardware
compatibility or subjective feel.
