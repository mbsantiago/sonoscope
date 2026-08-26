# Agent Command Reference

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
