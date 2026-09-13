# Releasing Puck

Update package.json to the intended version, run pnpm check, and commit the
change. Push main, then tag that commit as v<VERSION> and push the tag.
The publish.yml workflow checks the tag against package.json, installs locked
dependencies, builds, tests, and publishes through npm trusted publishing.
No npm token or interactive passkey is required for that workflow once the
package's trusted publisher is configured.

npm configuration: GitHub Actions, owner clankagent, repository puck,
workflow publish.yml, no environment, direct publishing enabled.
Configuration and initial publication require account authentication.

The core does not own animation or rendering. A release should preserve the
measured motion defaults unless a deliberate behavior change is documented.
