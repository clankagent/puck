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

Dependency installation and checks use the project's pinned pnpm. Publishing
uses `pnpm dlx npm@11.15.0 publish` for OIDC support. Do not add setup-node's
registry-url setting or a placeholder NODE_AUTH_TOKEN; these can prevent the
OIDC path from activating. For a failed publication, dispatch publish.yml on
main with the existing release tag as its tag input. This retries the tagged
source without moving the tag or inventing another package version.

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
