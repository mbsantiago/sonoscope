# Flatten Spectrogram Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flatten `SpectrogramConfig` and `ResolvedSpectrogramConfig` so that options are top-level properties instead of nested group objects (`stft`, `viewport`, `valueScale`, `playback`, `cache`, `superpowers`), while keeping modular polymorphic unions (`renderer`, `backend`, `colorMap`, `transforms`).

**Architecture:**
1. Update `SpectrogramConfig` and `ResolvedSpectrogramConfig` in `src/types.ts` to have flat top-level properties (e.g. `windowSize`, `fftSize`, `hopSize`, `window`, `startTime`, `endTime`, `minFrequency`, `maxFrequency`, `frequencyScale`, `minViewportDuration`, `maxViewportDuration`, `valueMode`, `minValue`, `maxValue`, `valueGamma`, `clampValues`, `showPlayhead`, `followPlayback`, `followMargin`, `renderOnSeek`, `tileDuration`, `maxCachedTiles`, `prefetchTiles`, `secretSpectrogram3d`).
2. Update `src/config.ts` to resolve flat properties (with backwards-compatible fallback for any nested objects during transition).
3. Update `src/viewer.ts` to use flat resolved config properties for internal computations, state tracking, and `viewer.updateConfig()`.
4. Update test suites and demo examples to use the flat config format.

**Tech Stack:** TypeScript, Vitest, Playwright browser test.

## Global Constraints

- Keep modular unions for `renderer`, `backend`, `colorMap`, and `transforms`.
- Backward compatibility: `resolveConfig` accepts flat properties as primary, while gracefully falling back to nested object keys if passed.
- All existing tests and browser tests must continue to pass.
- Zero external runtime dependencies.

---

## File Structure

- Modify `src/types.ts`: Update `SpectrogramConfig` and `ResolvedSpectrogramConfig` to flat structure. Keep `StftConfig`, `ViewportConfig`, `ValueScaleConfig` as helper types for renderers/transforms.
- Modify `src/config.ts`: Update `resolveConfig` to extract top-level flat properties and produce flat `ResolvedSpectrogramConfig`.
- Modify `src/config.test.ts`: Update tests to assert on flat config structure.
- Modify `src/viewer.ts`: Update viewer config consumption and `updateConfig` to use flat properties.
- Modify `src/viewer.test.ts`: Update viewer tests to use flat config.
- Modify `examples/basic/*.html` & `examples/basic/react.ts`: Update all demos to use flat configuration.

---

### Task 1: Update Config Types in `src/types.ts`

**Files:**
- Modify: `src/types.ts`

**Interfaces:**
- Produces flat `SpectrogramConfig` & `ResolvedSpectrogramConfig`.

- [x] **Step 1: Update `SpectrogramConfig` and `ResolvedSpectrogramConfig` in `src/types.ts`**
- [x] **Step 2: Verify type check failure pointing to places needing updates**

---

### Task 2: Update `resolveConfig` in `src/config.ts` & Tests

**Files:**
- Modify: `src/config.ts`
- Modify: `src/config.test.ts`

**Interfaces:**
- `resolveConfig(input: SpectrogramConfig): ResolvedSpectrogramConfig`

- [x] **Step 1: Update `src/config.ts` to resolve flat properties**
- [x] **Step 2: Update `src/config.test.ts` with unit tests for flat config and legacy fallback**
- [x] **Step 3: Run `npx vitest run src/config.test.ts` to verify pass**

---

### Task 3: Update `SpectrogramViewer` in `src/viewer.ts` & Tests

**Files:**
- Modify: `src/viewer.ts`
- Modify: `src/viewer.test.ts`

- [x] **Step 1: Update `src/viewer.ts` property accesses to use flat config**
- [x] **Step 2: Update `src/viewer.test.ts`**
- [x] **Step 3: Run `npx vitest run src/viewer.test.ts` to verify pass**

---

### Task 4: Update All Examples and Demos

**Files:**
- Modify: `examples/basic/*.html`
- Modify: `examples/basic/react.ts`

- [x] **Step 1: Update all HTML and TS demo files in `examples/basic/` to use flat config**
- [x] **Step 2: Verify with Biome lint and type check**

---

### Task 5: Full Verification & Browser Tests

- [x] **Step 1: Run `npm test`**
- [x] **Step 2: Run `npm run test:browser`**
- [x] **Step 3: Run `npm run check:types` and `npm run check:biome`**
- [x] **Step 4: Run `npm run build`**
