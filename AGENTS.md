# Package development

For requested Puck updates, complete implementation, tests, linked changelog/docs,
commit and push, CI verification, versioned npm publication, and a clean install
check before reporting completion. Stop only for an actual blocker or an explicit
source-only request.

## V1 release gate

The v1 API change is an unreleased preview. Implementation, tests and preview
deployment are authorized. Do not create release tags, GitHub releases or npm
publications (including release candidates and other prereleases) until the user
has tested the change with their real physical controller and explicitly approved
release. Automated checks and browser simulations do not satisfy this gate.
This gate overrides the default publication workflow above.

Puck is a public library hosted at https://github.com/clankagent/puck, published as @clankagent/puck. Maintain the focused library scope: source, tests, documentation and small code examples. Do not add a website, test page, local server or router setup unless explicitly requested.

Keep the package self-contained. Do not introduce references to private applications, internal servers, local recordings, machine paths, or user metadata. No dependencies on surrounding workspaces. Preserve the established feel when extracting or optimizing; validate timing and neutral behavior with tests.

Input transport, motion processing, and application rendering are separate responsibilities. The core owns no DOM, global listeners or render loop. Browser lifecycle belongs to the optional adapter; camera limits and zoom anchors belong to the consuming application. Avoid framework adapters and additional device abstractions without a concrete use case.

Use pnpm. This library uses the TypeScript compiler and Node's test runner; no Vite application is being created. Run `pnpm check` before delivery. Additional device profiles require evidence; do not claim untested compatibility. Synthetic fixtures are generated from documented report layouts and physical observations, without original capture metadata.
