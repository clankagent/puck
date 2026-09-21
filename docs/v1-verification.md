# unreleased v1 preview verification

The application-facing SDK is an **unreleased v1 preview** (development version 1.0.0-dev.0). npm remains at 0.5.0. Automated checks do not establish hardware comfort or compatibility.

**Release gate:** the user must test with their real physical controller and explicitly approve release before any release tag, GitHub release or npm publication, including prereleases. Fixes must be retested before approval. Preview deployment supports testing and is not a release.

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
responsive layout. The package artifact must also pass a clean tarball install
before publication and a clean registry install afterward.

Before any v1 release, the user must test with a supported physical controller:
full six-axis movement and speed settings, gestures and held controls,
selection comfort while maintaining pressure, incidental twist rejection,
double-cancel usability, and unintended activation during ordinary movement.
The supported profile remains 256f:c63a on the previously verified transport;
no additional device compatibility is claimed.
