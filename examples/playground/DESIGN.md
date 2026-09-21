# Public playground

Movement revision: continuous movement is now the entry point. Put editable speed,
deadzone and response controls beside a sticky live view, with a single-column
phone layout. Separate motion settings from gesture force profiles. Provide 2D
pan/zoom and an all-axis object view, held input, visible units and immediate
neutral stopping. Keep the gray/green gesture board as a separate section below.

Audience: anyone checking recognition and developers exploring the SDK. Main action:
perform a gesture, see its count, reset and repeat. Continue the lab's Manual
direction: quiet chapter rail, white workspace, blue-gray supporting surfaces,
system sans, tabular numbers. The tester is first; signals, motion and advanced
recording follow. Gray tiles become green and say Detected, with persistent counts.
Tiles represent independent gestures, not decorative feature cards. Phone layout
puts section links above content and collapses traces to one column.

Rendered reference inspected: https://hardwaretester.com/gamepad on 2026-09-20.
The neutral controller drawing, device slots, connection instruction and numeric
axis readouts make absence of input explicit. Adopt visible connection state and
zero values, with a simulator so an unconnected visitor can still explore.
Retain the existing lab's inspected Stripe documentation reference for navigation.

Rationale: https://www.nngroup.com/articles/visibility-system-status/ . Feedback
should show what registered and let the visitor decide what to do next. Therefore
raw input remains visible independently of recognition, pending singles have a
waiting state, and device/simulator counts are separate. No hardware certification
is implied by completing the board. Data stays in the browser on the public site.

Application-controls workbench: retain the established Manual layout and tokens. Put the six-axis view beside the active session, with context selection above them; raw/effective graphs and inspection follow. Counter reset is distinct from session cancellation. Collapse the two-column workbench on phones. Public recipes own movement and selection; this page owns drawing only.

## 2026-09-21: complete preview workspace

Audience: a SpaceMouse owner evaluating physical behavior and an application
writer trying every public control. Primary action: choose an example, follow
its physical instruction and judge the result; inspect the same session when
something surprises you.

Continue Manual's readable type, white surface and chapter navigation, but use
an application workspace instead of a long documentation page. Examples, the
32-outcome tester and debugging are distinct views. Instructions and results
are prominent; implementation detail lives in code/inspection sections. Keep
16px body text, larger changing instructions, blue actions and gray-to-green
physical coverage tiles. The scene contains a stepped mechanical assembly so
perspective, occlusion, orientation and distance are visible. It is application
camera code, not a new SDK recognizer.

Reuse the inspected gamepad tester and Stripe documentation references above:
clear neutral/connected state and practical adjacent examples. The system-status
rationale applies to a menu that opens only while active and explicitly reports
commit/cancel. Navigation conventions were checked against 3Dconnexion's object,
camera and target-camera description:
https://3dconnexion.com/se/applications/alcads-alcad/learn-more/
Choose target orbit for this example, with a stable visible pivot and quaternion
orientation. Do not claim hardware feel has been validated by these checks.

Debug view shows six raw/observer/rate graphs, event lanes, report delivery gaps,
selected output and ownership. Graph focus puts these together on desktop.
Freeze copies the visible capture; it does not freeze input. Browser recordings
include a bounded 30-second diagnostics window in addition to the public SDK
recording. Imported plain SDK recordings explicitly lack these UI snapshots.
