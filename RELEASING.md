# Releasing Puck

## Rust preview distribution

The Rust preview is intended for main after its pull request passes review and
checks. Prerelease distribution remains separate from the stable npm channel.
Pin package/Cargo versions and toolchain. Run pnpm check, native ABI tests,
Clippy, browser smoke and dependency audits, then review the source/package diff.
No real device captures or personal metadata belong in the repository or artifacts.

The Check and Release package workflows build Windows/Linux native libraries
and WASM, run parity checks, and call scripts/release-artifacts.mjs. This explicit
allowlist strips debug information, remaps build paths, rejects host paths and
obvious secret patterns, and writes checksums plus source/toolchain metadata.
Download the exact successful tag artifacts before creating a GitHub prerelease.
Publish only the generated allowlist and npm tarball; never upload target/, work/,
debug symbols, logs, captures, Cargo caches or the frozen comparison source.
Verify downloaded checksums and clean installation before announcing availability.
GitHub checksums are not Authenticode signatures. CI has read-only repository
permissions and no npm credentials; GitHub release creation remains an explicit
operator action after successful checks.

Document the available installation channels and exact versions. Provide a
verified tarball download for GitHub previews. Publish npm previews with
`--tag next`, preserving the stable `latest` tag at 1.0.0 until a stable release
is explicitly approved. Publish from the exact verified commit and tag. Keep
Unreleased source fixes distinct from the currently available 2.0.0-alpha.2 preview
until the next version has been published and verified.

## Stable npm releases

Update package.json to the intended version, run pnpm check, and commit the
change. Push main, then tag that commit as v<VERSION> and push the tag.
The publish.yml workflow (displayed as Release package) checks the tag against
package.json, installs locked dependencies, builds, tests, and uploads the
tarball as the release-package artifact. CI does not publish to npm or hold
npm credentials. Successful packaging is not a completed publication.

Use an authorized npm publisher identity and verify it with `pnpm whoami`
before publication. Follow npm's current authentication and approval flow.

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
