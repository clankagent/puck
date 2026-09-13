# Local preparation checks

- TypeScript build and 13 tests pass. Tests cover report bounds/signs, zero and non-motion handling, frame-rate independence, held input through report gaps, reversal, zoom-axis switching, snapshots, render-owned zoom anchors/limits, adapter pause/resume/disconnect, foreground interruption and cleanup.
- A separate local comparison against the working prototype evaluated 3,558 frames at 60, 144 and 240 Hz, both zoom mappings, neutral/reversal and mixed-axis input. Pan and camera zoom matched exactly (maximum difference zero). The comparison harness remains outside this package.
- Packed artifact installs into a separate ESM TypeScript consumer. Both public entry points resolve, declarations type-check, and importing the adapter in Node does not access browser globals. The packed artifact contains emitted code/declarations, package metadata and README; original captures and workspace documentation are excluded.
- The extracted adapter has not yet been exercised with physical hardware. Physical testing established the report layout and motion defaults in a prototype; adapter lifecycle coverage is currently synthetic.
- Package name: @clankagent/puck. License: MIT. Publication status is available from GitHub releases and the npm registry.
