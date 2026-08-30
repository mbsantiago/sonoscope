# Core Rendering Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven development or execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 30-second spectrogram navigation responsive by prioritizing the latest viewport, limiting progressive paints, and reducing WebGL resource work without changing analysis output.

**Architecture:** Keep STFT tile identities and analysis parameters unchanged. Replace the viewer's all-at-once `Promise.all` tile loading with a generation-aware priority scheduler, then batch presentation at animation-frame cadence. Follow with renderer and cache resource optimizations that retain existing Canvas/WebGL visual behavior.

**Tech Stack:** TypeScript, Vitest, Playwright/Chromium, Web Workers, WebAssembly STFT, Canvas2D, WebGL2.

## Global Constraints

- Preserve the current public spectrogram API unless a new diagnostic is essential.
- Preserve the spectral output and Canvas/WebGL parity behavior for identical inputs.
- Do not make STFT resolution depend on viewport width in this work; tile pyramids and display LOD require a separate design.
- Treat current visible work as higher priority than prefetch work.
- Keep browser timing reports informational until fixed-environment baselines are collected.

---

## Baseline

At 44.1 kHz with `fftSize: 2048`, `hopSize: 256`, and default `tileMaxCells: 131_072`, a tile holds 128 frames and spans about 0.743 seconds. A 30-second viewport therefore selects 41 tiles. The current viewer starts every visible tile concurrently and paints placeholders, each completed tile, and the final state. The resulting interaction cost is primarily stale queued compute work and repeated full renderer paints.

## Task 1: Add Multi-Tile Performance Coverage

**Files:**
- Modify: `packages/core/src/viewers/spectrogram/viewer.test.ts`
- Modify: `packages/core/src/performance.bench.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/benchmark.browser.test.ts`

**Produces:** A deterministic 30-second, multi-tile fixture and measurements for tile count, paint count, first partial paint, final completion, and cache behavior.

- [ ] Add a 44.1 kHz synthetic source with a 30-second viewport, `fftSize: 2048`, and `hopSize: 256`.
- [ ] Assert that the fixture selects 41 visible tiles when its viewport begins at zero.
- [ ] Instrument test renderers to count placeholder, partial, and final paints.
- [ ] Extend browser benchmarks to report cold and warm p50/p95 render duration at DPR 1 and DPR 2.
- [ ] Run `npm test -- --run packages/core/src/viewers/spectrogram/viewer.test.ts` and the relevant browser benchmark.

## Task 2: Prioritize the Latest Viewport

**Files:**
- Modify: `packages/core/src/viewers/spectrogram/viewer.ts`
- Modify: `packages/core/src/viewers/spectrogram/backends/backend.ts`
- Modify: `packages/core/src/viewers/spectrogram/backends/worker-backend.ts`
- Modify: `packages/core/src/viewers/spectrogram/viewer.test.ts`
- Modify: `packages/core/src/viewers/spectrogram/backends/worker-backend.test.ts`

**Consumes:** The multi-tile fixture from Task 1.

**Produces:** An internal generation-aware priority queue. Visible tiles dispatch within bounded backend capacity; queued stale and prefetch work cannot delay the newest viewport.

- [ ] Define an internal render-session generation with a cancellation signal and current-viewport priority metadata.
- [ ] Replace `Promise.all(visibleTiles.map(...))` with a bounded dispatcher that schedules visible tiles nearest the viewport center first.
- [ ] Extend worker requests with a cancellable queued-job path. Running worker jobs may finish, but queued stale jobs must be removed before new visible jobs.
- [ ] Mark prefetch jobs as lower priority and dispatch them only after no visible work remains queued.
- [ ] Keep completed stale tiles eligible for caching, but prevent stale sessions from painting or emitting `rendercomplete`.
- [ ] Add tests for rapid navigation during a 41-tile render: newest visible jobs start before stale queued jobs, concurrency remains bounded, and stale sessions do not paint.
- [ ] Run viewer, worker-backend, and navigation tests.

## Task 3: Batch Partial Painting Per Frame

**Files:**
- Modify: `packages/core/src/viewers/spectrogram/viewer.ts`
- Modify: `packages/core/src/viewers/spectrogram/viewer.test.ts`

**Consumes:** The render sessions from Task 2.

**Produces:** Immediate placeholders, no more than one progressive paint per animation frame, and one final paint for the active generation.

- [ ] Keep the initial placeholder render synchronous with a new active session.
- [ ] Accumulate completed visible matrices until the next `requestAnimationFrame` callback.
- [ ] Ensure an obsolete generation cannot execute a queued animation-frame paint.
- [ ] Retain a final paint after all visible tiles for the active session resolve.
- [ ] Replace exact progressive-paint-count assertions with tests that multiple same-frame completions yield one paint containing all completed matrices.
- [ ] Run viewer tests and the multi-tile benchmark from Task 1.

## Task 4: Reduce WebGL Upload and Draw Work

**Files:**
- Modify: `packages/core/src/viewers/spectrogram/renderers/webgl2.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/webgl2-normal-program.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/webgl2.test.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/webgl2.browser.test.ts`

**Consumes:** Batched renderer calls from Task 3.

**Produces:** Single-channel normalized tile textures, one placeholder pass, and tile-bounded rendering work.

- [ ] Replace per-cell RGBA expansion with WebGL2 single-channel `R8`/`RED` texture uploads while retaining current normalized value quantization.
- [ ] Update the normal shader to sample the red channel and preserve current color-map lookup behavior.
- [ ] Replace repeated identical placeholder fullscreen draws with one placeholder pass.
- [ ] Use scissor rectangles or tile-bounded geometry so individual tile passes avoid rasterizing unrelated canvas regions.
- [ ] Add mocked WebGL tests for texture format, upload count, and draw count.
- [ ] Run real-browser Canvas/WebGL parity tests for linear, mel, and logarithmic scales and tile-boundary cases.

## Task 5: Bound CPU and GPU Cache Lifetime

**Files:**
- Modify: `packages/core/src/viewers/spectrogram/cache.ts`
- Modify: `packages/core/src/viewers/spectrogram/viewer.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/webgl2.ts`
- Modify: `packages/core/src/viewers/spectrogram/cache.test.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/webgl2.test.ts`

**Consumes:** Scheduler ownership information from Task 2 and WebGL texture keys from Task 4.

**Produces:** Correct cache clearing and reconfiguration, bounded texture residency, and diagnostics for CPU/GPU cache pressure.

- [ ] Make `maxCachedTiles` updates alter the active cache and evict immediately when necessary.
- [ ] Add an optional byte-based cache limit that complements tile count while preserving existing defaults.
- [ ] Prevent in-flight computations from repopulating a cache generation cleared by the caller.
- [ ] Delete WebGL textures when their matrices are evicted, invalidated, or destroyed.
- [ ] Add tests for runtime capacity reduction, clearing during deferred compute, repeated navigation, and renderer destruction.
- [ ] Run cache, renderer, type, and browser tests.

## Validation and Release Gate

- [ ] Run `npm test`.
- [ ] Run `npm run check:types`.
- [ ] Run `npm run check:biome`.
- [ ] Run `npm run test:browser`.
- [ ] Compare the Task 1 30-second cold and warm baselines before and after each task.
- [ ] Require improved latest-viewport time-to-first-partial-paint and fewer paint calls without Canvas/WebGL parity regression.

## Deferred Work

Adaptive STFT resolution, tile pyramids, and display LOD are intentionally excluded. They alter analysis resolution, cache identity, and query semantics, so they need a separate API and correctness design after the scheduler, presentation, and resource work has been measured.
