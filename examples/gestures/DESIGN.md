# Gesture lab design

Audience: developers tuning SpaceMouse cap pulses. Primary action: perform a gesture, see recognition, adjust thresholds, compare a saved setting.

Manual direction adapted to an instrument panel: a quiet settings rail, larger live input/result column, compact event table below. White surface, blue-gray rail, blue twist and brown pressure traces; system sans with tabular numbers. On phones, the testing surface comes first and settings follow. No illustrative assets are needed: the trace represents actual input.

Reference inspected: https://docs.stripe.com/keys (rendered desktop, 2026-09-18). Persistent left rail, clear heading scale, thin dividers and an open main column keep dense controls readable. Adapt these relationships without copying its branding or three-column navigation.

Rationale read: https://www.nngroup.com/articles/response-times-3-important-limits/ . Delays affect perceived direct manipulation. Show raw input immediately even when the exclusive single recognizer waits for a double. Make the additive/exclusive tradeoff explicit instead of presenting one as universally best.

This lab is example application code using the published low-level gesture APIs. Hardware scope and physical evidence are documented in docs/v1-verification.md. New public APIs and device profiles still require the contribution-guidance discussion.

## Calibration and graphs refinement

Continue the existing Manual direction and the previously inspected Stripe
layout reference. The primary task is now record → see coverage → inspect shape
→ use/export the tune. Preserve the quiet typography and rail for advanced
controls. Put analysis above advanced tuning. Use four labeled direction lanes,
not overlapping signed axes. Direct text ties each gate to its lane; steps show
held input; a selected action narrows the time range. Green/gray dash patterns
make activation/release distinguishable without relying on color. Readiness
shows eight real counts, and incomplete evidence cannot enable applying a tune.
