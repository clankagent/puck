# 1.0 candidate verification

The application-facing SDK is introduced as **1.0.0-rc.1** on npm's `next` tag.
Stable 0.5 stays on `latest`. This is a candidate for physical evaluation, not a
claim that simulator coverage establishes hardware comfort or compatibility.

Automated checks cover the existing 32 recognition outcomes and compatibility
APIs; all 28 discrete outcomes through typed declarations; both pressure directions;
hold/release/cancel lifecycles; selection memory and absence; double cancellation;
ownership and rearming; clocks and report-boundary integration; 30/60/144 Hz;
settings and contexts; independent cursors; trace retention; recording/replay;
renderer-neutral graphs; and the optional WebHID bridge.

Public TypeScript fixtures check inferred vectors, rates, selection commit values
and errors for invalid reads, event subscriptions, raw-value integration and
structural settings changes. Tests consume built JavaScript/declarations.

Browser checks cover command detection, both push/pull selection, single/double
twist cancellation, held adjustment, counters, reset, real speed settings and
responsive layout. The published artifact must also pass a clean tarball install
before publication and a clean registry install afterward.

Before promoting to stable 1.0, test with a supported physical controller:
selection comfort while maintaining pressure, incidental twist rejection,
double-cancel usability, and unintended activation during ordinary movement.
The supported profile remains 256f:c63a on the previously verified transport;
no additional device compatibility is claimed.
