# Agent Command Reference

## Architecture and Abstraction Boundaries

- Keep generic layers source-agnostic. `Sonoscope`, viewers, and shared interfaces must depend on the `AudioSource` contract and explicit capabilities, not concrete source classes, source IDs, formats, or source-specific flags.
- Put format-specific parsing, duration discovery, progressive availability, and cancellation behavior in source implementations or source-layer adapters. Communicate those behaviors upward through small, documented contracts/events that are meaningful for every implementation that supports them.
- Preserve one owner for each piece of state. Avoid mirroring source, readiness, or duration state across the scope, viewers, and demos unless the relationship and synchronization contract are explicit.
- Prefer cohesive modules with narrow responsibilities and stable interfaces. Avoid adding special cases to a generic coordinator when a capability or adapter at the boundary can express the behavior.
- Keep practical coupling explicit: before adding a cross-layer dependency, identify why it is needed, keep its surface minimal, and add tests at the interface that guarantees the behavior.
- Treat format-specific demos as consumers of generic APIs. They may display format-specific details, but must not implement core source lifecycle, cancellation, or viewer invalidation themselves.
- Use explicit named imports and exports in barrel modules; do not use `import *` or `export *`.

## Simplicity, Demo Quality, and Performance

- Keep demo code as simple as possible. Demos should show how easily library users can express the desired behavior; complexity in a demo is a signal to reconsider the API and whether refactoring or library development is needed.
- After preserving modularity and abstraction boundaries, prioritize performance: provide quick user feedback and fast visualization, especially for progressive sources.
- Prefer simple code as evidence of sound design: use adequate abstractions, loose coupling, and shallow control flow.
- Apply YAGNI. Avoid features that are not needed, and require clear justification before adding features that increase API or implementation complexity.

## Documentation Writing

- Explain why a feature exists and when someone would use it, not just what it does. Preserve the author's intended explanation and tone when editing prose.
- Write naturally for readers who may not know software-development terms. Do not turn explanations into slogan-like contrasts or a string of short, clipped sentences; use as much detail as the idea needs.
- Do not use the unslop skill to rewrite documentation unless the user asks for it. Avoid adding caveats or distinctions that repeat what the explanation already makes clear.

Commands for building, testing, linting, and releasing in this monorepo.

## Building

- `npm run build` — Build WASM and all monorepo packages.
- `npm run build:wasm` — Compile Rust STFT code to WebAssembly (`wasm/stft`).
- `npm run build:docs` — Build the Astro documentation site (`docs/`).

## Testing and Quality Checks

- `npm test` — Run unit and integration tests (Vitest).
- `npm run test:browser` — Run browser visual regression tests (Playwright).
- `npm run check:types` — Run TypeScript type checking.
- `npm run check:biome` — Run Biome linter and formatter check.
- `npm run fix:format` — Auto-format code with Biome.
- `npm run fix:lint` — Auto-fix lint errors with Biome.

## Development Servers

- `npm run dev:example` — Start Vite dev server for the basic example (`examples/basic`).
- `npm run dev:docs` — Start Astro docs dev server (`docs/`).
- `npm run dev:ascii` — Start ASCII plugin demo server.

## Versioning and Releases

- `npm run changeset` — Create a change record and specify bump type (patch, minor, major).
- `npm run version-packages` — Bump all package versions, update workspace dependencies, generate changelogs, and sync `packages/anywidget/pyproject.toml`.
- `npm run release` — Build all packages and publish to NPM via Changesets.
