# Releasing Puck

Update package.json to the intended version, run pnpm check, and commit the
change. Push main, then tag that commit as v<VERSION> and push the tag.
The publish.yml workflow (displayed as Release package) checks the tag against
package.json, installs locked dependencies, builds, tests, and uploads the
tarball as the release-package artifact. CI does not publish to npm or hold
npm credentials. Successful packaging is not a completed publication.

Publish from the CLI as clankagent. Check `pnpm whoami`; if authentication has
expired, run `pnpm login --auth-type=web --registry=https://registry.npmjs.org`.
Give the generated login link to the account owner to open on their other PC
with their passkey. Keep the CLI process running while they approve. Do not
require the passkey to be available on this VM or assume login bypasses 2FA.

The core does not own animation or rendering. A release should preserve the
measured motion defaults unless a deliberate behavior change is documented.

Download the verified CI tarball, or pack the exact tagged source using pnpm.
Run `pnpm publish /path/to/package.tgz --access public --ignore-scripts --no-git-checks`.
If npm prints a separate publish-approval link, give that link to the account
owner too and keep the process running. Never report success before npm confirms
publication. Install the exact version from the registry in a clean consumer,
verify all public entry points and packaged docs, and create GitHub release
notes linking to the tagged changelog and upgrade guide.

For a failed build, dispatch publish.yml on main with the existing tag input.
For a failed publication, first check whether the version reached npm; retry
only if absent. Do not move release tags or invent versions to repair auth.
Trusted publishing was attempted but npm rejected the OIDC exchange; it is
not configured as a working release path. Do not reintroduce it without an
explicitly authorized setup and a successful end-to-end verification.

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


## 1.0 approval

The physical-testing gate for 1.0.0 was explicitly satisfied on 2026-09-21. This authorizes the 1.0.0 tag, npm publication and GitHub release after documentation and package checks. Retain the measured scope in docs/v1-verification.md; do not claim broader compatibility from release approval.
