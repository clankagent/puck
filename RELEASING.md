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

## Release notes and adoption guidance

For user-facing changes, add an Unreleased entry to CHANGELOG.md explaining
what changed, compatibility impact, and links to integration docs. Update
docs/upgrading.md when adoption requires changes or new behavior choices.
Do not describe source-only APIs as already available from npm.

When releasing, move applicable entries under the exact package version and
release date, link the version comparison, and update version-status notes in
README.md and llms.txt. Pin documentation links to the release tag in GitHub
release notes; include the adoption guide. Verify the packed artifact contains
the changelog and linked user documentation before pushing a release tag.
After publication, verify the published version and exports before announcing
installation instructions as available.
