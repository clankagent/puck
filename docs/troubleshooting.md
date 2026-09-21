# Troubleshooting

[Documentation](../README.md) · [API reference](api.md)

| Symptom | Check / fix |
|---|---|
| Import or graph entry point missing | Application controls require 1.0.0; retained gesture/graph APIs require 0.2.0 or later. Check your installed version and package exports; see the upgrade guide. |
| Bare import fails in browser | Resolve package imports with a bundler or import map. A browser cannot resolve npm package names by itself. |
| WebHID unavailable / chooser fails | Use a supporting browser and secure context; connect from a user click and display the caught error. Core processing works without WebHID. |
| Chooser cancelled | A null connection is expected; allow another click. |
| Device selected but no usable input | Verify the exact profile/report format. Matching vendor alone does not establish support. |
| First gesture ignored | Startup/reset is blocked until a fresh neutral input. Start recording before moving the cap. |
| Single feels delayed | Exclusive mode waits for the double window (default 400 ms). Immediate mode fires a single first and then an additive double; it does not undo the single. |
| Double becomes two singles | Inspect the completion interval and neutral valley. Check doubleMs and release/dwell settings. Do not blindly increase the activation threshold. |
| Stronger gesture rejected | Typical high is not a rejection cutoff. Check hold duration, competing axis dominance, and neutral return. |
| Push/pull harder than twist | Use the separate push/pull bands or calibrate; do not force identical thresholds on all axes. |
| Nothing fires during report silence | Keep calling advance using the same monotonic clock as update. |
| Clock throws RangeError | Use performance.now() in both report and frame callbacks for gestures. rAF's supplied timestamp can be older than a report already processed. |
| Actions fire when leaving the page | Treat the WebHID lifecycle sentinel as reset, not a physical release. See the complete session example. |
| Calibration incomplete | Show missing/counts; add at least three singles and three doubles per direction. Combining distinct captures is supported. |
| Calibration ambiguous | Close singles may resemble a double; runs of three or more fast pulses are ambiguous. Inspect raw graph and repeat only unclear actions with pauses between independent actions. |
| Saved tune has no methods | JSON stores data only. Call createGestureTune(JSON.parse(saved)). |
| Tune edit throws on assignment | Tunes and toJSON data are frozen. Copy nested objects before editing, or use the immutable methods. |
| Interaction suppressed | Inspect ownership/context with puck.inspect(); release fully to satisfy neutral rearming. |
| Twist cancel does not finish | Keep pressure held and complete the twist by returning it to center; inspect cancellation state. |
| Continuous tilt travels different amounts | Compare raw signed rx/ry values. Equal sensor values are shaped symmetrically; gesture calibration does not equalize physical response. |
| 3D directions differ from preference | Use per-axis scale overrides. Camera transforms are application-specific; raw input signs do not change. |
| Recorder stops adding entries | Inspect full; stop/save and start another capture. The legacy gesture recorder defaults to two minutes / 50000 timeline entries. Application recording has a separate recordingLimit (50000 by default). |
| Graph overlays wrong session | Pass the zero-based recordingIndex used in the combined calibration. |

When reporting a problem, include package version, runtime/browser, OS, device IDs and connection type, relevant configuration, expected/actual events and a minimal synthetic reproduction when possible. Remove personal information from any raw capture. See [contribution guidance](../CONTRIBUTING.md) for evidence needed for a new profile.
