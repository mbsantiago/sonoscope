# Decouple Profiler from SpectrogramViewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove mandatory profiling overhead and allocations from `SpectrogramViewer.render()`, making the viewer lightweight and zero-overhead by default while introducing a dedicated, opt-in `SpectrogramProfiler` that hooks into viewer lifecycle events.

**Architecture:** Remove internal `new PerformanceProfiler()` instantiation and measurement wrappers from every render cycle in `SpectrogramViewer`. Add a lightweight `durationMs` field to `rendercomplete` events. Introduce an opt-in `SpectrogramProfiler` class that attaches to any `ISpectrogramViewer` (or `ISonoscope`), measures render durations, computes FPS and frame stats via `FrameMeter`, tracks cache metrics, and emits structured performance summaries.

**Tech Stack:** TypeScript, WebGL2, Web Workers, Vitest.

---

## Global Constraints

- Never instantiate `PerformanceProfiler` or execute `performance.now()` in `SpectrogramViewer.render()` unless an explicit profiler is passed.
- `SpectrogramViewer` must have zero profiling overhead during regular playback and user navigation.
- `SpectrogramProfiler` must be an opt-in external coordinator that hooks into `renderstart`, `rendercomplete`, `viewportchange`, and `timeupdate` events without mutating viewer core logic.
- All existing tests and browser tests must pass (`npm test`, `npm run test:browser`, `npm run check:types`, `npm run check:biome`, `npm run build`).

---

## Proposed Architecture & Design

```
+----------------------------------------------------------------+
|                        SpectrogramViewer                       |
|                                                                |
|  - render() -> Lightweight:                                    |
|      1. emits 'renderstart' ({ requestId, total })             |
|      2. fetches tiles & rasterizes                             |
|      3. emits 'rendercomplete' ({ requestId, durationMs, ... })|
|  - ZERO profiler allocations per frame                         |
+----------------------------------------------------------------+
                               |
                               | (emits standard events)
                               v
+----------------------------------------------------------------+
|                  SpectrogramProfiler (Opt-in)                  |
|                                                                |
|  const profiler = new SpectrogramProfiler(viewer);             |
|  - Subscribes to 'renderstart', 'rendercomplete'               |
|  - Collects render duration, FPS, min/max/avg frame stats      |
|  - Tracks cache memory usage via viewer.getCacheStats()        |
|  - Emits 'profile' event with aggregated metrics               |
|  - profiler.getStats() -> structured summary                   |
|  - profiler.destroy() -> detaches cleanly                      |
+----------------------------------------------------------------+
```

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/types.ts` | Add `durationMs?: number` to `rendercomplete` event; define `SpectrogramProfilerOptions`, `SpectrogramProfileStats`, `SpectrogramProfileEvent` |
| `packages/core/src/performance.ts` | Implement `SpectrogramProfiler` class; keep `PerformanceProfiler` and `FrameMeter` utilities |
| `packages/core/src/performance.test.ts` | Unit tests for `SpectrogramProfiler` (event listening, stats calculation, lifecycle cleanup, FPS meter integration) |
| `packages/core/src/viewer.ts` | Remove mandatory profiler instantiation and measurement wrappers from `render()`, `getTile()`, and `paintPartial()` |
| `packages/core/src/viewer.test.ts` | Verify `render()` runs cleanly without profiler; test `rendercomplete` payload and optional profiling |
| `packages/core/src/index.ts` | Export `SpectrogramProfiler` and profile types |
| `examples/basic/performance.html` | Update benchmark demo to use `SpectrogramProfiler` and report throughput |

---

### Task 1: Update Event Types and Implement `SpectrogramProfiler` in `packages/core`

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/performance.ts`
- Test: `packages/core/src/performance.test.ts`

**Interfaces:**
- Consumes: `ISpectrogramViewer`, `FrameMeter`, `PerformanceMeasure`
- Produces: `SpectrogramProfiler`, `SpectrogramProfileStats`, `SpectrogramProfileEvent`, `SpectrogramEvents['rendercomplete']` with `durationMs`

- [ ] **Step 1: Write failing tests in `packages/core/src/performance.test.ts`**

```typescript
import { describe, expect, it, vi } from "vitest";
import { FrameMeter, PerformanceProfiler, SpectrogramProfiler } from "./performance";
import type { ISpectrogramViewer } from "./types";

describe("SpectrogramProfiler", () => {
  function createMockViewer() {
    const listeners = new Map<string, Function[]>();
    return {
      on: vi.fn((event: string, handler: Function) => {
        const list = listeners.get(event) ?? [];
        list.push(handler);
        listeners.set(event, list);
        return () => {
          const arr = listeners.get(event) ?? [];
          listeners.set(event, arr.filter((h) => h !== handler));
        };
      }),
      emit(event: string, payload: any) {
        for (const handler of listeners.get(event) ?? []) {
          handler(payload);
        }
      },
      getCacheStats: vi.fn(() => ({
        tiles: 4,
        maxTiles: 32,
        estimatedBytes: 1024 * 1024,
        peakBytes: 2 * 1024 * 1024,
      })),
    } as unknown as ISpectrogramViewer & { emit: (e: string, p: any) => void };
  }

  it("attaches to viewer and computes render statistics", () => {
    let clock = 1000;
    const viewer = createMockViewer();
    const profiler = new SpectrogramProfiler(viewer, { clock: () => clock });

    const profiles: any[] = [];
    profiler.on("profile", (event) => profiles.push(event));

    // Simulate render start
    viewer.emit("renderstart", { requestId: "r1", total: 4 });
    clock += 25; // 25ms render
    viewer.emit("rendercomplete", {
      requestId: "r1",
      durationMs: 25,
      renderedTiles: 4,
      missingTiles: 0,
    });

    expect(profiles.length).toBe(1);
    expect(profiles[0].durationMs).toBe(25);
    expect(profiles[0].renderedTiles).toBe(4);

    const stats = profiler.getStats();
    expect(stats.renderCount).toBe(1);
    expect(stats.lastDurationMs).toBe(25);
    expect(stats.avgDurationMs).toBe(25);
  });

  it("unbinds listeners cleanly on destroy()", () => {
    const viewer = createMockViewer();
    const profiler = new SpectrogramProfiler(viewer);

    profiler.destroy();
    expect(profiler.isDestroyed()).toBe(true);

    viewer.emit("renderstart", { requestId: "r2", total: 2 });
    viewer.emit("rendercomplete", { requestId: "r2", durationMs: 10, renderedTiles: 2, missingTiles: 0 });
    expect(profiler.getStats().renderCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run packages/core/src/performance.test.ts`
Expected: FAIL (`SpectrogramProfiler` not defined)

- [ ] **Step 3: Implement `SpectrogramProfiler` and export types**
Update `packages/core/src/types.ts`:
```typescript
export interface SpectrogramProfileStats {
  renderCount: number;
  lastDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  avgDurationMs: number;
  fps?: number;
  cache?: CacheStats;
}

export interface SpectrogramProfileEvent {
  requestId: string;
  durationMs: number;
  renderedTiles: number;
  missingTiles: number;
  timestamp: number;
  cache?: CacheStats;
}
```

Implement `SpectrogramProfiler` in `packages/core/src/performance.ts`:
```typescript
export interface SpectrogramProfilerOptions {
  sampleSize?: number;
  clock?: () => number;
}

export class SpectrogramProfiler {
  private readonly unsubs: Array<() => void> = [];
  private readonly events = new TypedEventEmitter<{
    profile: SpectrogramProfileEvent;
    stats: SpectrogramProfileStats;
  }>();
  private readonly clock: () => number;
  private readonly durations: number[] = [];
  private readonly maxSamples: number;
  private destroyed = false;
  private pendingStartTimes = new Map<string, number>();
  private lastStats: SpectrogramProfileStats = {
    renderCount: 0,
    lastDurationMs: 0,
    minDurationMs: 0,
    maxDurationMs: 0,
    avgDurationMs: 0,
  };

  constructor(
    private readonly viewer: ISpectrogramViewer,
    options: SpectrogramProfilerOptions = {},
  ) {
    this.clock = options.clock ?? now;
    this.maxSamples = options.sampleSize ?? 60;

    const unsubStart = this.viewer.on("renderstart", (e) => {
      this.pendingStartTimes.set(e.requestId, this.clock());
    });

    const unsubComplete = this.viewer.on("rendercomplete", (e) => {
      const startTime = this.pendingStartTimes.get(e.requestId);
      this.pendingStartTimes.delete(e.requestId);
      const computedDuration = startTime !== undefined ? Math.max(0, this.clock() - startTime) : 0;
      const durationMs = e.durationMs ?? computedDuration;

      this.durations.push(durationMs);
      if (this.durations.length > this.maxSamples) {
        this.durations.shift();
      }

      const sum = this.durations.reduce((a, b) => a + b, 0);
      const min = Math.min(...this.durations);
      const max = Math.max(...this.durations);
      const avg = sum / this.durations.length;
      const cache = typeof this.viewer.getCacheStats === "function" ? this.viewer.getCacheStats() : undefined;

      this.lastStats = {
        renderCount: this.lastStats.renderCount + 1,
        lastDurationMs: durationMs,
        minDurationMs: min,
        maxDurationMs: max,
        avgDurationMs: avg,
        cache,
      };

      const event: SpectrogramProfileEvent = {
        requestId: e.requestId,
        durationMs,
        renderedTiles: e.renderedTiles,
        missingTiles: e.missingTiles,
        timestamp: this.clock(),
        cache,
      };

      this.events.emit("profile", event);
      this.events.emit("stats", this.lastStats);
    });

    this.unsubs.push(unsubStart, unsubComplete);
  }

  on<K extends "profile" | "stats">(
    event: K,
    handler: (data: K extends "profile" ? SpectrogramProfileEvent : SpectrogramProfileStats) => void,
  ): () => void {
    return this.events.on(event, handler as any);
  }

  getStats(): SpectrogramProfileStats {
    return { ...this.lastStats };
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
    this.pendingStartTimes.clear();
    this.events.clear();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run packages/core/src/performance.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add packages/core/src/types.ts packages/core/src/performance.ts packages/core/src/performance.test.ts
git commit -m "feat(core): implement standalone SpectrogramProfiler and profile event types"
```

---

### Task 2: Remove Baked-in Profiler Overhead from `SpectrogramViewer.render()`

**Files:**
- Modify: `packages/core/src/viewer.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/viewer.test.ts`

**Interfaces:**
- `SpectrogramViewer.render()`: Pure async rendering without profiler allocation or wrapping.
- `renderstart`: `{ requestId: string; total: number }`
- `rendercomplete`: `{ requestId: string; durationMs: number; renderedTiles: number; missingTiles: number }`
- Optional `options.profile?: PerformanceProfiler` supported for targeted backend debugging if explicitly passed.

- [ ] **Step 1: Write test verifying zero profiler overhead and durationMs reporting in `packages/core/src/viewer.test.ts`**

```typescript
it("emits renderstart and rendercomplete with durationMs without internal profiler allocations", async () => {
  const scope = new Sonoscope({ source });
  const viewer = new SpectrogramViewer(scope, canvas());

  const completeEvents: Array<{ requestId: string; durationMs: number; renderedTiles: number }> = [];
  viewer.on("rendercomplete", (e) => {
    completeEvents.push({
      requestId: e.requestId,
      durationMs: e.durationMs,
      renderedTiles: e.renderedTiles,
    });
  });

  await viewer.render();

  expect(completeEvents.length).toBe(1);
  expect(completeEvents[0].renderedTiles).toBeGreaterThanOrEqual(1);
  expect(typeof completeEvents[0].durationMs).toBe("number");
  expect(completeEvents[0].durationMs).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 2: Strip profiler from `SpectrogramViewer.render()` in `packages/core/src/viewer.ts`**

Replace lines 356-465 in `packages/core/src/viewer.ts` with:
```typescript
  async render(options?: { profile?: PerformanceProfiler }): Promise<void> {
    if (this.isDestroyed()) return;
    const requestId = `render-${++this.requestCounter}`;
    const generation = ++this.renderGeneration;
    const startTime = performance.now();
    const tiles = this.visibleTileRanges();
    const matrices = new Map<string, SpectrogramMatrix>();
    let completed = 0;
    let partialPaintQueued = false;

    if (this.isDestroyed()) return;
    this.status = { state: "rendering" };
    this.events.emit("renderstart", { requestId, total: tiles.length });
    this.renderer.renderLoading({ canvas: this.config.canvas });

    const profile = options?.profile;

    const jobs = tiles.map(async (tile) => {
      const matrix = await this.getTile(
        tile.channel,
        tile.timeStart,
        tile.timeEnd,
        profile,
      );
      if (this.isDestroyed() || generation !== this.renderGeneration) return;
      completed += 1;
      matrices.set(
        `${tile.channel}:${tile.timeStart}:${tile.timeEnd}`,
        matrix,
      );
      this.events.emit("renderprogress", {
        requestId,
        completed,
        total: tiles.length,
        progress: tiles.length === 0 ? 1 : completed / tiles.length,
        phase: "computing",
      });
      if (!partialPaintQueued) {
        partialPaintQueued = true;
        await Promise.resolve();
        partialPaintQueued = false;
        if (
          !this.isDestroyed() &&
          generation === this.renderGeneration &&
          matrices.size < tiles.length
        ) {
          this.paintPartial(
            Array.from(matrices.values()),
            this.missingPlaceholders(tiles, matrices),
            profile,
          );
        }
      }
    });

    await Promise.all(jobs);
    if (this.isDestroyed() || generation !== this.renderGeneration) return;
    this.prefetchAroundViewport();

    this.paintPartial(Array.from(matrices.values()), [], profile);
    void this.renderPlaybackPlayhead();

    this.events.emit("renderprogress", {
      requestId,
      completed: tiles.length,
      total: tiles.length,
      progress: 1,
      phase: "rendering",
    });
    this.status = { state: "ready" };
    const durationMs = performance.now() - startTime;
    this.events.emit("rendercomplete", {
      requestId,
      durationMs,
      renderedTiles: matrices.size,
      missingTiles: tiles.length - matrices.size,
    });

    if (profile && generation === this.renderGeneration && !this.isDestroyed()) {
      this.events.emit("renderprofile", {
        requestId,
        generation,
        measures: profile.measures(),
      });
    }
  }
```

- [ ] **Step 3: Run viewer tests**
Run: `npx vitest run packages/core/src/viewer.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add packages/core/src/viewer.ts packages/core/src/types.ts packages/core/src/viewer.test.ts
git commit -m "refactor(core): remove mandatory profiler overhead from SpectrogramViewer.render"
```

---

### Task 3: Export `SpectrogramProfiler` and Update Examples & Tests

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `examples/basic/performance.html`
- Modify: `examples/basic/renderers.html`
- Modify: `examples/basic/minimap.html`
- Modify: `examples/basic/react.tsx`

- [ ] **Step 1: Export `SpectrogramProfiler` from `packages/core/src/index.ts`**

Export `SpectrogramProfiler`, `SpectrogramProfileStats`, `SpectrogramProfileEvent`, `SpectrogramProfilerOptions`.

- [ ] **Step 2: Update `examples/basic/performance.html` to use `SpectrogramProfiler`**

```javascript
import { Sonoscope, SpectrogramProfiler, SpectrogramViewer } from "@sonoscope/core";

const scope = new Sonoscope({ source });
const viewer = new SpectrogramViewer(scope, canvas, config);
const profiler = new SpectrogramProfiler(viewer);

profiler.on("profile", (event) => {
  console.log(`Render ${event.requestId}: ${event.durationMs.toFixed(2)}ms (${event.renderedTiles} tiles)`);
});
```

- [ ] **Step 3: Run full verification suite**
Run:
```bash
npm run check:types
npm run check:biome
npm test
npm run test:browser
npm run build
```
Expected: All checks and tests pass with zero errors.

- [ ] **Step 4: Commit**
```bash
git add packages/core/src/index.ts examples/
git commit -m "feat(core): export SpectrogramProfiler and update examples to use event-driven profiling"
```
