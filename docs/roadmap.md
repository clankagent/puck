# Roadmap after 1.0

Puck 1.0 establishes the application-facing continuous, gesture and interaction
contracts, symmetric push/pull sessions, explicit ownership, contexts, settings,
inspection and bounded recording/replay. Existing low-level APIs remain supported.
See the [release changelog](../CHANGELOG.md) and [tested scope](v1-verification.md).

Remaining work is driven by measured application needs:

- Per-device continuous-motion calibration: neutral offsets and separate signed
  ranges. Existing gesture calibration does not equalize continuous tilt travel.
- Longer-duration performance and recording tests in consuming applications.
- Additional device profiles and hardware buttons, only with descriptors and
  physical captures. The verified profile remains 256f:c63a.
- Broader browser/platform and real-application integration evidence.

There is no committed schedule for these items. Framework adapters, renderers,
servers and automatic storage are not part of the core. Breaking public-contract
changes require an appropriate version and migration guidance.
