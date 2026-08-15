# Core Library Folder Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `packages/core/src/` into a structured modular layout with dedicated `viewers/spectrogram/` and `viewers/waveform/` directories and common root coordinator/utility modules.

**Architecture:** 
- `src/sonoscope.ts`, `src/types.ts`, `src/events.ts`, `src/navigation.ts`, `src/performance.ts`, `src/colormap.ts`, `src/viewport-controller.ts`, `src/sources/` remain at root `packages/core/src/` as common coordinator & shared utilities.
- `src/viewers/spectrogram/` contains `types.ts`, `viewer.ts`, `config.ts`, `cache.ts`, `frequency-scale.ts`, `value-scale.ts`, `spectrogram-sampling.ts`, `transforms.ts`, `backends/`, and `renderers/`.
- `src/viewers/waveform/` contains `types.ts`, `viewer.ts`, `peaks.ts`, and `renderers/`.
- `src/index.ts` cleanly re-exports all public APIs, types, and visualizers.

**Tech Stack:** TypeScript, Vitest, Biome, Vite, Rust/WASM.

## Global Constraints

- No regressions in public API: `@sonoscope/core` top-level exports in `packages/core/src/index.ts` must maintain full backwards compatibility for all exported classes, functions, and types.
- All unit tests (40+ test files), browser tests, biome linter, and typechecks must pass cleanly.
- `scripts/build-wasm.mjs` and `biome.jsonc` paths must be updated to point to the new location of `wasm-stft-binary.ts`.

---

### Task 1: Create `src/viewers/waveform/` and Move Waveform Files

**Files:**
- Move: `packages/core/src/waveform/*` -> `packages/core/src/viewers/waveform/*`
- Modify: `packages/core/src/viewers/waveform/viewer.ts`
- Modify: `packages/core/src/viewers/waveform/types.ts`
- Modify: `packages/core/src/viewers/waveform/renderers/canvas.ts`
- Modify: `packages/core/src/viewers/waveform/renderers/webgl2.ts`

- [ ] **Step 1: Move `packages/core/src/waveform/` to `packages/core/src/viewers/waveform/`**

Use git mv:
```bash
mkdir -p packages/core/src/viewers
git mv packages/core/src/waveform packages/core/src/viewers/waveform
```

- [ ] **Step 2: Update relative imports in `packages/core/src/viewers/waveform/*`**

Fix relative imports from `../` to `../../` for common modules (`../../types`, `../../events`, `../../colormap`, `../spectrogram/config` or `../../config`).

- [ ] **Step 3: Update references in `src/sonoscope.ts` and `src/index.ts`**

Update imports from `./waveform/...` to `./viewers/waveform/...`.

- [ ] **Step 4: Run waveform tests to verify**

Run: `npx vitest run packages/core/src/viewers/waveform/`
Expected: PASS

---

### Task 2: Create `src/viewers/spectrogram/` and Move Spectrogram Modules

**Files:**
- Move: `packages/core/src/viewer.ts` -> `packages/core/src/viewers/spectrogram/viewer.ts`
- Move: `packages/core/src/viewer.test.ts` -> `packages/core/src/viewers/spectrogram/viewer.test.ts`
- Move: `packages/core/src/config.ts` -> `packages/core/src/viewers/spectrogram/config.ts`
- Move: `packages/core/src/config.test.ts` -> `packages/core/src/viewers/spectrogram/config.test.ts`
- Move: `packages/core/src/cache.ts` -> `packages/core/src/viewers/spectrogram/cache.ts`
- Move: `packages/core/src/cache.test.ts` -> `packages/core/src/viewers/spectrogram/cache.test.ts`
- Move: `packages/core/src/frequency-scale.ts` -> `packages/core/src/viewers/spectrogram/frequency-scale.ts`
- Move: `packages/core/src/frequency-scale.test.ts` -> `packages/core/src/viewers/spectrogram/frequency-scale.test.ts`
- Move: `packages/core/src/value-scale.ts` -> `packages/core/src/viewers/spectrogram/value-scale.ts`
- Move: `packages/core/src/value-scale.test.ts` -> `packages/core/src/viewers/spectrogram/value-scale.test.ts`
- Move: `packages/core/src/spectrogram-sampling.ts` -> `packages/core/src/viewers/spectrogram/spectrogram-sampling.ts`
- Move: `packages/core/src/spectrogram-sampling.test.ts` -> `packages/core/src/viewers/spectrogram/spectrogram-sampling.test.ts`
- Move: `packages/core/src/transforms.ts` -> `packages/core/src/viewers/spectrogram/transforms.ts`
- Move: `packages/core/src/transforms.test.ts` -> `packages/core/src/viewers/spectrogram/transforms.test.ts`
- Move: `packages/core/src/backends/` -> `packages/core/src/viewers/spectrogram/backends/`
- Move: `packages/core/src/renderers/` -> `packages/core/src/viewers/spectrogram/renderers/`

- [ ] **Step 1: Move spectrogram modules to `packages/core/src/viewers/spectrogram/`**

```bash
mkdir -p packages/core/src/viewers/spectrogram
git mv packages/core/src/viewer.ts packages/core/src/viewers/spectrogram/viewer.ts
git mv packages/core/src/viewer.test.ts packages/core/src/viewers/spectrogram/viewer.test.ts
git mv packages/core/src/config.ts packages/core/src/viewers/spectrogram/config.ts
git mv packages/core/src/config.test.ts packages/core/src/viewers/spectrogram/config.test.ts
git mv packages/core/src/cache.ts packages/core/src/viewers/spectrogram/cache.ts
git mv packages/core/src/cache.test.ts packages/core/src/viewers/spectrogram/cache.test.ts
git mv packages/core/src/frequency-scale.ts packages/core/src/viewers/spectrogram/frequency-scale.ts
git mv packages/core/src/frequency-scale.test.ts packages/core/src/viewers/spectrogram/frequency-scale.test.ts
git mv packages/core/src/value-scale.ts packages/core/src/viewers/spectrogram/value-scale.ts
git mv packages/core/src/value-scale.test.ts packages/core/src/viewers/spectrogram/value-scale.test.ts
git mv packages/core/src/spectrogram-sampling.ts packages/core/src/viewers/spectrogram/spectrogram-sampling.ts
git mv packages/core/src/spectrogram-sampling.test.ts packages/core/src/viewers/spectrogram/spectrogram-sampling.test.ts
git mv packages/core/src/transforms.ts packages/core/src/viewers/spectrogram/transforms.ts
git mv packages/core/src/transforms.test.ts packages/core/src/viewers/spectrogram/transforms.test.ts
git mv packages/core/src/backends packages/core/src/viewers/spectrogram/backends
git mv packages/core/src/renderers packages/core/src/viewers/spectrogram/renderers
```

- [ ] **Step 2: Create `packages/core/src/viewers/spectrogram/types.ts`**

Define spectrogram-specific types (`SpectrogramConfig`, `ResolvedSpectrogramConfig`, `ISpectrogramViewer`, `SpectrogramEvents`, `SpectrogramStatus`, `SpectrogramRenderer`, `SpectrogramComputeBackend`, `SpectrogramMatrix`, `SpectrumSlice`, `SpectrumPoint`, `StftConfig`, `FrequencyScale`, `ValueMode`, `WindowName`, `SpectrogramTransform`, `TileStateInfo`, `CacheStats`, `SpectrogramProfileStats`, etc.).

- [ ] **Step 3: Update relative imports across `packages/core/src/viewers/spectrogram/**`**

Fix relative imports from `./` or `../` to `../../` for common modules (`../../types`, `../../events`, `../../colormap`, `../../sonoscope`, `../../performance`, `../../sources/source`).

---

### Task 3: Update WASM Build Script and Biome Configuration

**Files:**
- Modify: `scripts/build-wasm.mjs:13-17`
- Modify: `biome.jsonc:8`

- [ ] **Step 1: Update `scripts/build-wasm.mjs` target path**

Change target path from `packages/core/src/backends/wasm-stft-binary.ts` to `packages/core/src/viewers/spectrogram/backends/wasm-stft-binary.ts`.

- [ ] **Step 2: Update `biome.jsonc` ignored pattern**

Change `!packages/core/src/backends/wasm-stft-binary.ts` to `!packages/core/src/viewers/spectrogram/backends/wasm-stft-binary.ts`.

---

### Task 4: Update Root Coordinator, Common Types, Main Index, and Tests

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/sonoscope.ts`
- Modify: `packages/core/src/navigation.ts`
- Modify: `packages/core/src/sonoscope.test.ts`
- Modify: `packages/core/src/sonoscope-sync.test.ts`
- Modify: `packages/core/src/navigation.test.ts`

- [ ] **Step 1: Update `packages/core/src/types.ts`**

Export shared coordinator types and re-export viewer types from `./viewers/spectrogram/types` and `./viewers/waveform/types`.

- [ ] **Step 2: Update `packages/core/src/index.ts`**

Update re-exports to use `./viewers/spectrogram/...` and `./viewers/waveform/...`.

- [ ] **Step 3: Update `packages/core/src/sonoscope.ts` and `packages/core/src/navigation.ts`**

Fix import paths to point to `./viewers/spectrogram/...` and `./viewers/waveform/...`.

- [ ] **Step 4: Update all root test imports**

Fix import paths in `sonoscope.test.ts`, `sonoscope-sync.test.ts`, `navigation.test.ts`.

---

### Task 5: Full Verification and Cleanup

**Files:**
- None (verification across repository)

- [ ] **Step 1: Type check**
Run: `npm run check:types`
Expected: PASS

- [ ] **Step 2: Biome check**
Run: `npm run check:biome`
Expected: PASS

- [ ] **Step 3: Unit tests**
Run: `npm test`
Expected: All 40 test files PASS

- [ ] **Step 4: Browser tests**
Run: `npm run test:browser`
Expected: All browser tests PASS

- [ ] **Step 5: Production build**
Run: `npm run build`
Expected: WASM build + Core dist build + React dist build succeed

- [ ] **Step 6: Git commit**
Commit the reorganization.
