# Spectrogram Performance Stage 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the spectrogram viewer responsive during realistic tile computation while adding profiling, benchmarks, and an opt-in Worker compute backend.

**Architecture:** Preserve the existing tiled viewer and `SpectrogramComputeBackend` boundary. Add a small profiler helper, minimal backend profiling metadata, generation-aware render scheduling, partial painting, and a Worker backend that moves JavaScript STFT off the main thread. Keep WebGL/WASM as measured future compute options, not Stage 2 implementations.

**Tech Stack:** TypeScript, Vite library build, Vitest unit tests, browser Web Workers, Canvas 2D, typed arrays.

## Global Constraints

- Primary success metric: viewport changes, resize, zoom/pan, and playback do not hang the UI.
- Secondary success metric: improve STFT throughput through parallel tile computation.
- Compute fallback order: JavaScript STFT in Web Workers first, WebGL STFT compute second, WASM STFT compute third.
- Keep implementation small, clear, and YAGNI-driven.
- Add abstractions only when they remove real duplication, isolate real complexity, or preserve an existing extension point.
- Do not add WebGL rendering, WebGL STFT, WASM STFT, a multi-resolution pyramid, streaming decode, plugin systems, speculative cancellation, or priority queues in this stage.
- Existing public viewer API should remain source-compatible where possible.

---

## File Structure

- Create `src/performance.ts`: lightweight profiler types and helper class. It owns timing records only; no telemetry, aggregation service, or global state.
- Modify `src/types.ts`: add `PerformanceMeasure` and `renderprofile` event type.
- Modify `src/backend.ts`: extend `ComputeTileRequest` with optional profiling, record source read and STFT compute timings in `MainThreadComputeBackend`, and export worker request/response types only if needed by the worker task.
- Create `src/worker-backend.ts`: `WorkerComputeBackend` worker pool with explicit message handling, queueing, transfer lists, and `destroy()` rejection.
- Create `src/stft-worker.ts`: Web Worker entry that receives samples and STFT config, runs `computeStftMatrix`, and posts matrix buffers back.
- Modify `src/index.ts`: export `WorkerComputeBackend` and profiler types needed by consumers.
- Modify `src/renderer.ts`: optionally accept a profiler and record `renderer.paint` without changing rendering behavior.
- Modify `src/viewer.ts`: add render generation, concurrent tile requests, partial paint, profile emission, and stale result guards.
- Create `src/performance.test.ts`: profiler tests.
- Modify `src/backend.test.ts`: backend profiling tests.
- Create `src/worker-backend.test.ts`: worker backend tests with an injectable fake Worker class to avoid browser dependence in unit tests.
- Modify `src/viewer.test.ts`: scheduler, partial paint, stale generation, and `renderprofile` tests.
- Create `src/performance.bench.ts`: compute benchmarks for JavaScript STFT and backend comparisons that can run under `vitest bench`.
- Modify `package.json`: add `bench` script.
- Create `examples/basic/performance.html` and `examples/basic/performance.ts`: manual browser profile demo.

---

### Task 1: Lightweight Profiler And Event Types

**Files:**
- Create: `src/performance.ts`
- Modify: `src/types.ts`
- Modify: `src/index.ts`
- Test: `src/performance.test.ts`

**Interfaces:**
- Consumes: no new internal interfaces.
- Produces: `PerformanceMeasure`, `PerformanceProfiler`, `PerformanceDetail`, `now()`, and `SpectrogramEvents['renderprofile']`.

- [ ] **Step 1: Write the failing profiler tests**

Create `src/performance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PerformanceProfiler } from './performance';

describe('PerformanceProfiler', () => {
  it('records measured synchronous work', () => {
    let clock = 10;
    const profiler = new PerformanceProfiler(() => clock);

    const value = profiler.measure('tile.cache.lookup', { channel: 0 }, () => {
      clock = 14;
      return 'cached';
    });

    expect(value).toBe('cached');
    expect(profiler.measures()).toEqual([
      { name: 'tile.cache.lookup', start: 10, duration: 4, detail: { channel: 0 } },
    ]);
  });

  it('records measured async work', async () => {
    let clock = 20;
    const profiler = new PerformanceProfiler(() => clock);

    await profiler.measureAsync('tile.stft.compute', { frames: 4 }, async () => {
      clock = 33;
    });

    expect(profiler.measures()).toEqual([
      { name: 'tile.stft.compute', start: 20, duration: 13, detail: { frames: 4 } },
    ]);
  });

  it('returns defensive copies of measures', () => {
    const profiler = new PerformanceProfiler(() => 1);
    profiler.record('renderer.paint', 1, 2, { tiles: 1 });

    const measures = profiler.measures();
    measures.push({ name: 'render.total', start: 0, duration: 0 });

    expect(profiler.measures()).toEqual([{ name: 'renderer.paint', start: 1, duration: 2, detail: { tiles: 1 } }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/performance.test.ts`

Expected: FAIL because `src/performance.ts` does not exist.

- [ ] **Step 3: Implement the profiler**

Create `src/performance.ts`:

```ts
export type PerformanceDetail = Record<string, string | number | boolean>;

export type PerformanceMeasure = {
  name: string;
  start: number;
  duration: number;
  detail?: PerformanceDetail;
};

export function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export class PerformanceProfiler {
  private readonly entries: PerformanceMeasure[] = [];

  constructor(private readonly clock: () => number = now) {}

  record(name: string, start: number, duration: number, detail?: PerformanceDetail): void {
    this.entries.push({ name, start, duration, ...(detail ? { detail } : {}) });
  }

  measure<T>(name: string, detail: PerformanceDetail | undefined, fn: () => T): T {
    const start = this.clock();
    try {
      return fn();
    } finally {
      this.record(name, start, this.clock() - start, detail);
    }
  }

  async measureAsync<T>(name: string, detail: PerformanceDetail | undefined, fn: () => Promise<T>): Promise<T> {
    const start = this.clock();
    try {
      return await fn();
    } finally {
      this.record(name, start, this.clock() - start, detail);
    }
  }

  measures(): PerformanceMeasure[] {
    return this.entries.map((entry) => ({ ...entry, ...(entry.detail ? { detail: { ...entry.detail } } : {}) }));
  }
}
```

- [ ] **Step 4: Add event and public exports**

Modify `src/types.ts`:

```ts
import type { PerformanceMeasure } from './performance';
```

Add to `SpectrogramEvents`:

```ts
renderprofile: { requestId: string; generation: number; measures: PerformanceMeasure[] };
```

Modify `src/index.ts` to export profiler types:

```ts
export type { PerformanceDetail, PerformanceMeasure } from './performance';
```

Do not export `PerformanceProfiler` unless a later task needs public construction.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- src/performance.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/performance.ts src/performance.test.ts src/types.ts src/index.ts
git commit -m "feat: add render performance profile types"
```

---

### Task 2: Backend Timing For Main-Thread Compute

**Files:**
- Modify: `src/backend.ts`
- Test: `src/backend.test.ts`

**Interfaces:**
- Consumes: `PerformanceProfiler` from `src/performance.ts`.
- Produces: `ComputeTileRequest.profile?: PerformanceProfiler`; `MainThreadComputeBackend` records `tile.source.read`, `tile.stft.compute`, and `tile.total`.

- [ ] **Step 1: Write failing backend profiling test**

Append to `src/backend.test.ts`:

```ts
import { PerformanceProfiler } from './performance';
```

Add test inside `describe('MainThreadComputeBackend', ...)`:

```ts
it('records source read and STFT timings when a profiler is provided', async () => {
  let clock = 0;
  const profiler = new PerformanceProfiler(() => clock);
  const source: AudioSource = {
    id: 'profiled-source',
    sampleRate: 1024,
    duration: 1,
    channelCount: 1,
    read: () => {
      clock += 3;
      return new Float32Array(1024);
    },
  };
  const backend = new MainThreadComputeBackend();

  await backend.computeTile({
    source,
    channel: 0,
    timeStart: 0,
    timeEnd: 1,
    stft: { windowSize: 256, fftSize: 256, hopSize: 128, window: 'hann' },
    profile: profiler,
  });

  const names = profiler.measures().map((measure) => measure.name);
  expect(names).toContain('tile.source.read');
  expect(names).toContain('tile.stft.compute');
  expect(names).toContain('tile.total');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/backend.test.ts`

Expected: FAIL because `ComputeTileRequest` does not accept `profile` and backend does not record timings.

- [ ] **Step 3: Implement minimal backend profiling**

Modify `src/backend.ts`:

```ts
import type { PerformanceProfiler } from './performance';
```

Extend `ComputeTileRequest`:

```ts
profile?: PerformanceProfiler;
```

Replace `computeTile` body with:

```ts
async computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix> {
  const compute = async () => {
    const samples = request.profile
      ? await request.profile.measureAsync('tile.source.read', { channel: request.channel, timeStart: request.timeStart, timeEnd: request.timeEnd }, async () => {
          return await request.source.read({ channel: request.channel, startTime: request.timeStart, endTime: request.timeEnd });
        })
      : await request.source.read({ channel: request.channel, startTime: request.timeStart, endTime: request.timeEnd });

    return request.profile
      ? request.profile.measure('tile.stft.compute', { channel: request.channel, samples: samples.length, fftSize: request.stft.fftSize }, () =>
          computeStftMatrix(samples, {
            channel: request.channel,
            timeStart: request.timeStart,
            sampleRate: request.source.sampleRate,
            stft: request.stft,
          }),
        )
      : computeStftMatrix(samples, {
          channel: request.channel,
          timeStart: request.timeStart,
          sampleRate: request.source.sampleRate,
          stft: request.stft,
        });
  };

  return request.profile ? request.profile.measureAsync('tile.total', { channel: request.channel, timeStart: request.timeStart, timeEnd: request.timeEnd }, compute) : compute();
}
```

- [ ] **Step 4: Run backend tests and typecheck**

Run: `npm test -- src/backend.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend.ts src/backend.test.ts
git commit -m "feat: profile main thread tile compute"
```

---

### Task 3: Worker Compute Backend With Injectable Worker Factory

**Files:**
- Create: `src/worker-backend.ts`
- Create: `src/stft-worker.ts`
- Modify: `src/index.ts`
- Test: `src/worker-backend.test.ts`

**Interfaces:**
- Consumes: `ComputeTileRequest`, `SpectrogramComputeBackend`, `computeStftMatrix`, `PerformanceProfiler`.
- Produces: `WorkerComputeBackend`, `WorkerComputeBackendOptions`, `SpectrogramWorkerLike`, and `createDefaultWorker()`.

- [ ] **Step 1: Write failing worker backend tests**

Create `src/worker-backend.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PerformanceProfiler } from './performance';
import type { AudioSource, SpectrogramMatrix } from './types';
import { WorkerComputeBackend, type SpectrogramWorkerLike } from './worker-backend';

class FakeWorker implements SpectrogramWorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  readonly posted: unknown[] = [];

  postMessage(message: unknown): void {
    this.posted.push(message);
    const request = message as { id: number; channel: number; timeStart: number; sampleRate: number };
    const matrix: SpectrogramMatrix = {
      channel: request.channel,
      timeStart: request.timeStart,
      timeEnd: request.timeStart + 1,
      frameStart: 0,
      frameCount: 1,
      binCount: 1,
      sampleRate: request.sampleRate,
      times: Float32Array.from([request.timeStart]),
      frequencies: Float32Array.from([0]),
      magnitude: Float32Array.from([1]),
      power: Float32Array.from([1]),
      db: Float32Array.from([0]),
    };
    queueMicrotask(() => this.onmessage?.({ data: { id: request.id, matrix, computeDuration: 5 } } as MessageEvent));
  }

  terminate(): void {
    this.terminated = true;
  }
}

function source(): AudioSource {
  return {
    id: 'worker-source',
    sampleRate: 1024,
    duration: 1,
    channelCount: 1,
    read: () => Float32Array.from([0, 1, 0, -1]),
  };
}

describe('WorkerComputeBackend', () => {
  it('reads samples on the main thread and resolves worker matrices', async () => {
    const workers: FakeWorker[] = [];
    const backend = new WorkerComputeBackend({ workerCount: 1, createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    } });

    const matrix = await backend.computeTile({
      source: source(),
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      stft: { windowSize: 4, fftSize: 4, hopSize: 2, window: 'hann' },
    });

    expect(matrix.magnitude[0]).toBe(1);
    expect(workers[0]!.posted).toHaveLength(1);
  });

  it('records queue, source read, worker compute, and total timings', async () => {
    const profiler = new PerformanceProfiler(() => 100);
    const backend = new WorkerComputeBackend({ workerCount: 1, createWorker: () => new FakeWorker() });

    await backend.computeTile({
      source: source(),
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      stft: { windowSize: 4, fftSize: 4, hopSize: 2, window: 'hann' },
      profile: profiler,
    });

    const names = profiler.measures().map((measure) => measure.name);
    expect(names).toContain('tile.queue.wait');
    expect(names).toContain('tile.source.read');
    expect(names).toContain('tile.stft.compute');
    expect(names).toContain('tile.total');
  });

  it('rejects queued jobs when destroyed', async () => {
    let release: (() => void) | undefined;
    const backend = new WorkerComputeBackend({ workerCount: 1, createWorker: () => ({
      onmessage: null,
      onerror: null,
      postMessage: () => undefined,
      terminate: () => release?.(),
    }) });

    const promise = backend.computeTile({
      source: source(),
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      stft: { windowSize: 4, fftSize: 4, hopSize: 2, window: 'hann' },
    });
    release = () => undefined;
    backend.destroy();

    await expect(promise).rejects.toThrow(/destroyed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/worker-backend.test.ts`

Expected: FAIL because `src/worker-backend.ts` does not exist.

- [ ] **Step 3: Implement worker backend**

Create `src/worker-backend.ts` with these definitions:

```ts
import type { ComputeTileRequest, SpectrogramComputeBackend } from './backend';
import type { PerformanceProfiler } from './performance';
import type { SpectrogramMatrix, StftConfig } from './types';

export type SpectrogramWorkerLike = {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
};

export type WorkerComputeBackendOptions = {
  workerCount?: number;
  workerUrl?: URL | string;
  createWorker?: () => SpectrogramWorkerLike;
};

type WorkerRequest = {
  id: number;
  channel: number;
  timeStart: number;
  sampleRate: number;
  stft: StftConfig;
  samples: Float32Array;
};

type WorkerResponse =
  | { id: number; matrix: SpectrogramMatrix; computeDuration: number }
  | { id: number; error: string };

type Job = {
  id: number;
  request: ComputeTileRequest;
  queuedAt: number;
  resolve: (matrix: SpectrogramMatrix) => void;
  reject: (error: Error) => void;
};

type WorkerSlot = {
  worker: SpectrogramWorkerLike;
  job?: Job;
};

export function createDefaultWorker(workerUrl: URL | string = new URL('./stft-worker.js', import.meta.url)): SpectrogramWorkerLike {
  return new Worker(workerUrl, { type: 'module' });
}

function defaultWorkerCount(): number {
  const cores = globalThis.navigator?.hardwareConcurrency ?? 2;
  return Math.max(1, Math.min(4, cores - 1 || 1));
}

export class WorkerComputeBackend implements SpectrogramComputeBackend {
  private nextId = 1;
  private destroyed = false;
  private readonly queue: Job[] = [];
  private readonly slots: WorkerSlot[];

  constructor(options: WorkerComputeBackendOptions = {}) {
    const createWorker = options.createWorker ?? (() => createDefaultWorker(options.workerUrl));
    const count = Math.max(1, options.workerCount ?? defaultWorkerCount());
    this.slots = Array.from({ length: count }, () => {
      const slot: WorkerSlot = { worker: createWorker() };
      slot.worker.onmessage = (event) => this.handleMessage(slot, event.data as WorkerResponse);
      slot.worker.onerror = (event) => this.handleWorkerError(slot, event.error instanceof Error ? event.error : new Error(event.message));
      return slot;
    });
  }

  computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix> {
    if (this.destroyed) return Promise.reject(new Error('WorkerComputeBackend has been destroyed'));

    const enqueue = () =>
      new Promise<SpectrogramMatrix>((resolve, reject) => {
        this.queue.push({ id: this.nextId++, request, queuedAt: performance.now(), resolve, reject });
        void this.pump();
      });
    return request.profile ? request.profile.measureAsync('tile.total', { channel: request.channel, timeStart: request.timeStart, timeEnd: request.timeEnd }, enqueue) : enqueue();
  }

  destroy(): void {
    this.destroyed = true;
    const error = new Error('WorkerComputeBackend has been destroyed');
    for (const job of this.queue.splice(0)) job.reject(error);
    for (const slot of this.slots) {
      if (slot.job) slot.job.reject(error);
      slot.job = undefined;
      slot.worker.terminate();
    }
  }

  private async pump(): Promise<void> {
    if (this.destroyed) return;
    for (const slot of this.slots) {
      if (slot.job) continue;
      const job = this.queue.shift();
      if (!job) return;
      slot.job = job;
      await this.startJob(slot, job);
    }
  }

  private async startJob(slot: WorkerSlot, job: Job): Promise<void> {
    const profile = job.request.profile;
    const start = performance.now();
    profile?.record('tile.queue.wait', job.queuedAt, start - job.queuedAt, { channel: job.request.channel });

    try {
      const samples = await readSamples(job.request, profile);
      const message: WorkerRequest = {
        id: job.id,
        channel: job.request.channel,
        timeStart: job.request.timeStart,
        sampleRate: job.request.source.sampleRate,
        stft: job.request.stft,
        samples,
      };
      slot.worker.postMessage(message, [samples.buffer]);
    } catch (error) {
      slot.job = undefined;
      job.reject(error instanceof Error ? error : new Error(String(error)));
      void this.pump();
    }
  }

  private handleMessage(slot: WorkerSlot, response: WorkerResponse): void {
    const job = slot.job;
    if (!job || job.id !== response.id) return;
    slot.job = undefined;
    if ('error' in response) {
      job.reject(new Error(response.error));
    } else {
      job.request.profile?.record('tile.stft.compute', performance.now() - response.computeDuration, response.computeDuration, {
        channel: job.request.channel,
        fftSize: job.request.stft.fftSize,
      });
      job.resolve(response.matrix);
    }
    void this.pump();
  }

  private handleWorkerError(slot: WorkerSlot, error: Error): void {
    const job = slot.job;
    slot.job = undefined;
    job?.reject(error);
    void this.pump();
  }
}

async function readSamples(request: ComputeTileRequest, profile: PerformanceProfiler | undefined): Promise<Float32Array> {
  const read = () => Promise.resolve(request.source.read({ channel: request.channel, startTime: request.timeStart, endTime: request.timeEnd }));
  return profile
    ? profile.measureAsync('tile.source.read', { channel: request.channel, timeStart: request.timeStart, timeEnd: request.timeEnd }, read)
    : read();
}
```

- [ ] **Step 4: Implement worker entry**

Create `src/stft-worker.ts`:

```ts
import { computeStftMatrix } from './stft';
import type { SpectrogramMatrix, StftConfig } from './types';

type WorkerRequest = {
  id: number;
  channel: number;
  timeStart: number;
  sampleRate: number;
  stft: StftConfig;
  samples: Float32Array;
};

function matrixTransferables(matrix: SpectrogramMatrix): Transferable[] {
  return [
    matrix.times.buffer,
    matrix.frequencies.buffer,
    matrix.magnitude.buffer,
    ...(matrix.power ? [matrix.power.buffer] : []),
    ...(matrix.db ? [matrix.db.buffer] : []),
    ...(matrix.normalized ? [matrix.normalized.buffer] : []),
  ];
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const start = performance.now();
  try {
    const request = event.data;
    const matrix = computeStftMatrix(request.samples, {
      channel: request.channel,
      timeStart: request.timeStart,
      sampleRate: request.sampleRate,
      stft: request.stft,
    });
    const computeDuration = performance.now() - start;
    self.postMessage({ id: request.id, matrix, computeDuration }, matrixTransferables(matrix));
  } catch (error) {
    self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) });
  }
};
```

- [ ] **Step 5: Export worker backend**

Modify `src/index.ts`:

```ts
export { WorkerComputeBackend, createDefaultWorker } from './worker-backend';
export type { SpectrogramWorkerLike, WorkerComputeBackendOptions } from './worker-backend';
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -- src/worker-backend.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS. If TypeScript complains about `event.error`, change worker error handling to `new Error(event.message || 'Worker compute failed')`.

- [ ] **Step 7: Run build**

Run: `npm run build`

Expected: PASS. If Vite does not emit `stft-worker.js`, change `createDefaultWorker` to `new Worker(new URL('./stft-worker.ts', import.meta.url), { type: 'module' })` and rerun.

- [ ] **Step 8: Commit**

```bash
git add src/worker-backend.ts src/stft-worker.ts src/worker-backend.test.ts src/index.ts
git commit -m "feat: add worker tile compute backend"
```

---

### Task 4: Renderer Paint Profiling

**Files:**
- Modify: `src/renderer.ts`
- Test: `src/renderer.test.ts`

**Interfaces:**
- Consumes: `PerformanceProfiler`.
- Produces: optional `profile?: PerformanceProfiler` on `RenderInput`; renderer records `renderer.paint`.

- [ ] **Step 1: Write failing renderer profiling test**

Modify imports in `src/renderer.test.ts`:

```ts
import { PerformanceProfiler } from './performance';
```

Add test inside `describe('renderer helpers', ...)`:

```ts
it('records paint timing when a profiler is provided', () => {
  let clock = 0;
  const profiler = new PerformanceProfiler(() => clock);
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(() => { clock += 1; }),
    createImageData: vi.fn((w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4), colorSpace: 'srgb' as const })),
    putImageData: vi.fn(() => { clock += 2; }),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };

  new CanvasSpectrogramRenderer().render({
    canvas: canvas(10, 10, context),
    viewport: { startTime: 0, endTime: 10, minFrequency: 0, maxFrequency: 100, frequencyScale: 'linear' },
    valueScale: { mode: 'magnitude', min: 0, max: 1, gamma: 1, clamp: true },
    colorMap: 'gray',
    tiles: [matrix],
    profile: profiler,
  });

  expect(profiler.measures().map((measure) => measure.name)).toContain('renderer.paint');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer.test.ts`

Expected: FAIL because `RenderInput` does not accept `profile`.

- [ ] **Step 3: Implement paint profiling**

Modify `src/renderer.ts` imports:

```ts
import type { PerformanceProfiler } from './performance';
```

Add to `RenderInput`:

```ts
profile?: PerformanceProfiler;
```

Wrap the existing body of `render(input)` in a local function:

```ts
render(input: RenderInput): void {
  const paint = () => {
    // existing render body unchanged
  };
  if (input.profile) {
    input.profile.measure('renderer.paint', { tiles: input.tiles.length }, paint);
    return;
  }
  paint();
}
```

- [ ] **Step 4: Run renderer tests and typecheck**

Run: `npm test -- src/renderer.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer.ts src/renderer.test.ts
git commit -m "feat: profile spectrogram paint time"
```

---

### Task 5: Generation-Aware Partial Rendering

**Files:**
- Modify: `src/viewer.ts`
- Test: `src/viewer.test.ts`

**Interfaces:**
- Consumes: `PerformanceProfiler`; `ComputeTileRequest.profile`; `CanvasSpectrogramRenderer.render(... profile)`.
- Produces: generation-aware `render()`, `renderprofile` event emission, concurrent tile requests, partial render behavior.

- [ ] **Step 1: Write failing renderprofile test**

Modify `src/viewer.test.ts` imports:

```ts
import type { AudioSource, SpectrogramMatrix } from './types';
import type { SpectrogramComputeBackend } from './backend';
```

Add helper near existing `source` fixtures:

```ts
function matrix(timeStart: number, timeEnd: number): SpectrogramMatrix {
  return {
    channel: 0,
    timeStart,
    timeEnd,
    frameStart: 0,
    frameCount: 1,
    binCount: 1,
    sampleRate: 10,
    times: Float32Array.from([timeStart]),
    frequencies: Float32Array.from([0]),
    magnitude: Float32Array.from([1]),
  };
}
```

Add test:

```ts
it('emits renderprofile measures for a render request', async () => {
  const viewer = await SpectrogramViewer.create({ canvas: canvas(), source, viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 512 } });
  const profiles: Array<{ requestId: string; generation: number; names: string[] }> = [];
  viewer.on('renderprofile', (event) => profiles.push({ requestId: event.requestId, generation: event.generation, names: event.measures.map((measure) => measure.name) }));

  await viewer.render();

  expect(profiles).toHaveLength(1);
  expect(profiles[0]!.generation).toBeGreaterThan(0);
  expect(profiles[0]!.names).toContain('render.total');
  expect(profiles[0]!.names).toContain('renderer.paint');
});
```

- [ ] **Step 2: Write failing stale generation test**

Add test:

```ts
it('does not let an older render complete after a newer viewport render', async () => {
  let resolveFirst: ((value: SpectrogramMatrix) => void) | undefined;
  const backend: SpectrogramComputeBackend = {
    computeTile: (request) => {
      if (request.timeStart === 0) return new Promise((resolve) => { resolveFirst = resolve; });
      return Promise.resolve(matrix(request.timeStart, request.timeEnd));
    },
  };
  const viewer = await SpectrogramViewer.create({
    canvas: canvas(),
    source: { ...source, duration: 10 },
    cache: { tileDurationSeconds: 1 },
    viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 512 },
    backend,
  });
  const completed: string[] = [];
  viewer.on('rendercomplete', (event) => completed.push(event.requestId));

  const first = viewer.render();
  viewer.setViewport({ startTime: 1, endTime: 2 });
  await viewer.render();
  resolveFirst!(matrix(0, 1));
  await first;

  expect(completed).toHaveLength(1);
  expect(completed[0]).toBe('render-2');
});
```

- [ ] **Step 3: Write failing concurrent tile request test**

Add test:

```ts
it('starts visible tile requests concurrently', async () => {
  let running = 0;
  let maxRunning = 0;
  const backend: SpectrogramComputeBackend = {
    computeTile: async (request) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await Promise.resolve();
      running -= 1;
      return matrix(request.timeStart, request.timeEnd);
    },
  };
  const viewer = await SpectrogramViewer.create({
    canvas: canvas(),
    source: { ...source, duration: 4 },
    cache: { tileDurationSeconds: 1 },
    viewport: { startTime: 0, endTime: 4, minFrequency: 0, maxFrequency: 512 },
    backend,
  });

  await viewer.render();

  expect(maxRunning).toBeGreaterThan(1);
});
```

- [ ] **Step 4: Run viewer tests to verify failures**

Run: `npm test -- src/viewer.test.ts`

Expected: FAIL because render profile, stale generation, and concurrent requests are not implemented.

- [ ] **Step 5: Implement render generation fields**

Modify `src/viewer.ts` imports:

```ts
import { PerformanceProfiler } from './performance';
```

Add private field:

```ts
private renderGeneration = 0;
```

- [ ] **Step 6: Replace render loop with generation-aware concurrent flow**

Replace `render()` in `src/viewer.ts` with:

```ts
async render(): Promise<void> {
  if (!this.config.source) throw new Error('Cannot render without an AudioSource');
  const requestId = `render-${++this.requestCounter}`;
  const generation = ++this.renderGeneration;
  const profile = new PerformanceProfiler();
  const tiles = this.visibleTileRanges();
  const matrices = new Map<string, SpectrogramMatrix>();
  let completed = 0;

  await profile.measureAsync('render.total', { tiles: tiles.length }, async () => {
    this.status = { state: 'rendering' };
    this.events.emit('renderstart', { requestId, total: tiles.length });
    profile.record('render.visibleTiles', performance.now(), 0, { total: tiles.length });

    const jobs = tiles.map(async (tile) => {
      const matrix = await this.getTile(tile.channel, tile.timeStart, tile.timeEnd, profile);
      completed += 1;
      matrices.set(`${tile.channel}:${tile.timeStart}:${tile.timeEnd}`, matrix);
      if (generation === this.renderGeneration) {
        this.events.emit('renderprogress', { requestId, completed, total: tiles.length, progress: tiles.length === 0 ? 1 : completed / tiles.length, phase: 'computing' });
        this.paintPartial(Array.from(matrices.values()), profile);
      }
    });

    await Promise.all(jobs);
    if (generation !== this.renderGeneration) return;

    this.paintPartial(Array.from(matrices.values()), profile);
    this.events.emit('renderprogress', { requestId, completed: tiles.length, total: tiles.length, progress: 1, phase: 'rendering' });
    this.status = { state: 'ready' };
    this.events.emit('rendercomplete', { requestId, renderedTiles: matrices.size, missingTiles: tiles.length - matrices.size });
  });

  if (generation === this.renderGeneration) {
    this.events.emit('renderprofile', { requestId, generation, measures: profile.measures() });
  }
}
```

- [ ] **Step 7: Add partial paint helper**

Add private method to `SpectrogramViewer`:

```ts
private paintPartial(matrices: SpectrogramMatrix[], profile: PerformanceProfiler): void {
  this.renderer.render({
    canvas: this.config.canvas,
    viewport: this.config.viewport,
    valueScale: this.config.valueScale,
    colorMap: this.config.colorMap,
    tiles: matrices,
    profile,
    ...(this.config.playback.showPlayhead && this.config.audio ? { playheadTime: this.config.audio.currentTime } : {}),
  });
}
```

- [ ] **Step 8: Pass profiler into tile loading and cache lookup**

Change `getTile` signature:

```ts
private async getTile(channel: number, timeStart: number, timeEnd: number, profile?: PerformanceProfiler): Promise<SpectrogramMatrix>
```

Replace cache lookup with:

```ts
const cached = profile
  ? profile.measure('tile.cache.lookup', { channel, timeStart, timeEnd }, () => this.cache.get(key))
  : this.cache.get(key);
```

Pass profile to backend:

```ts
const raw = await this.backend.computeTile({ source: this.config.source, channel, timeStart, timeEnd, stft: this.config.stft, profile });
```

Wrap transforms:

```ts
const transformed = profile
  ? await profile.measureAsync('tile.transforms.apply', { channel, timeStart, timeEnd }, async () =>
      applyTransforms(raw, this.config.transforms, {
        requestedTimeStart: timeStart,
        requestedTimeEnd: timeEnd,
        sampleRate: this.config.source!.sampleRate,
        stft: this.config.stft,
      }),
    )
  : await applyTransforms(raw, this.config.transforms, {
      requestedTimeStart: timeStart,
      requestedTimeEnd: timeEnd,
      sampleRate: this.config.source.sampleRate,
      stft: this.config.stft,
    });
```

- [ ] **Step 9: Invalidate active generation on config and viewport changes**

In `setConfig` after resolving config, add:

```ts
this.renderGeneration += 1;
```

In `setViewport` after resolving config, add:

```ts
this.renderGeneration += 1;
```

This prevents an in-flight render from painting after explicit config or viewport mutation.

- [ ] **Step 10: Run viewer tests and fix minimal issues**

Run: `npm test -- src/viewer.test.ts`

Expected: PASS. If the stale generation test expects `render-2` but request IDs differ because a prior test increments counters on another viewer instance, keep the assertion scoped to the local `completed` array length and verify the completed ID is the second render's returned request by event order.

- [ ] **Step 11: Run full tests and typecheck**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/viewer.ts src/viewer.test.ts
git commit -m "feat: render tiles with stale result protection"
```

---

### Task 6: Benchmark Harness

**Files:**
- Create: `src/performance.bench.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `computeStftMatrix`, `MainThreadComputeBackend`, `WorkerComputeBackend`, `AudioSource`.
- Produces: `npm run bench` script and repeatable synthetic compute benchmarks.

- [ ] **Step 1: Add benchmark script**

Modify `package.json` scripts:

```json
"bench": "vitest bench"
```

- [ ] **Step 2: Add compute benchmarks**

Create `src/performance.bench.ts`:

```ts
import { bench, describe } from 'vitest';
import { MainThreadComputeBackend } from './backend';
import { computeStftMatrix } from './stft';
import type { AudioSource, StftConfig } from './types';

function samples(length: number, sampleRate: number): Float32Array {
  return Float32Array.from({ length }, (_, i) => Math.sin(2 * Math.PI * 440 * (i / sampleRate)));
}

function source(sampleRate: number, duration: number): AudioSource {
  const data = samples(Math.floor(sampleRate * duration), sampleRate);
  return {
    id: `synthetic:${sampleRate}:${duration}`,
    sampleRate,
    duration,
    channelCount: 1,
    read: ({ startTime, endTime }) => data.slice(Math.floor(startTime * sampleRate), Math.ceil(endTime * sampleRate)),
  };
}

const configs: StftConfig[] = [
  { windowSize: 1024, fftSize: 1024, hopSize: 256, window: 'hann' },
  { windowSize: 2048, fftSize: 2048, hopSize: 512, window: 'hann' },
  { windowSize: 4096, fftSize: 4096, hopSize: 1024, window: 'hann' },
];

describe('STFT compute', () => {
  for (const stft of configs) {
    bench(`computeStftMatrix fft=${stft.fftSize} hop=${stft.hopSize}`, () => {
      computeStftMatrix(samples(48_000 * 5, 48_000), { channel: 0, timeStart: 0, sampleRate: 48_000, stft });
    });
  }
});

describe('MainThreadComputeBackend', () => {
  for (const stft of configs) {
    bench(`computeTile fft=${stft.fftSize} hop=${stft.hopSize}`, async () => {
      await new MainThreadComputeBackend().computeTile({ source: source(48_000, 5), channel: 0, timeStart: 0, timeEnd: 5, stft });
    });
  }
});
```

- [ ] **Step 3: Run benchmarks once**

Run: `npm run bench -- --run`

Expected: PASS and prints benchmark results. If the command syntax fails for the installed Vitest version, run `npx vitest bench --run` and update the script to the working command.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json src/performance.bench.ts
git commit -m "test: add spectrogram compute benchmarks"
```

---

### Task 7: Browser Performance Example

**Files:**
- Create: `examples/basic/performance.html`
- Create: `examples/basic/performance.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `SpectrogramViewer`, `WorkerComputeBackend`, `renderprofile` event.
- Produces: manual demo that compares main-thread and worker behavior and displays profile summaries.

- [ ] **Step 1: Create performance example HTML**

Create `examples/basic/performance.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>spectrogram-js performance</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <main>
      <h1>Performance profile</h1>
      <p>Compare main-thread and worker tile computation on synthetic audio.</p>
      <div>
        <button id="main">Render main-thread backend</button>
        <button id="worker">Render worker backend</button>
        <button id="pan">Pan viewport</button>
      </div>
      <canvas id="spectrogram" style="width: 100%; height: 320px"></canvas>
      <pre id="profile"></pre>
    </main>
    <script type="module" src="./performance.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create performance example TypeScript**

Create `examples/basic/performance.ts`:

```ts
import { MainThreadComputeBackend, SpectrogramViewer, WorkerComputeBackend, type AudioSource, type PerformanceMeasure } from '../../src';

class SyntheticSource implements AudioSource {
  readonly id = 'synthetic-performance';
  readonly sampleRate = 48_000;
  readonly duration = 60;
  readonly channelCount = 1;
  private readonly data = Float32Array.from({ length: this.sampleRate * this.duration }, (_, i) => {
    const time = i / this.sampleRate;
    return 0.6 * Math.sin(2 * Math.PI * 440 * time) + 0.3 * Math.sin(2 * Math.PI * 2200 * time);
  });

  read(options: { channel: number; startTime: number; endTime: number }): Float32Array {
    const start = Math.max(0, Math.floor(options.startTime * this.sampleRate));
    const end = Math.min(this.data.length, Math.ceil(options.endTime * this.sampleRate));
    return this.data.slice(start, end);
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#spectrogram')!;
const profile = document.querySelector<HTMLPreElement>('#profile')!;
const source = new SyntheticSource();
let viewer: SpectrogramViewer | undefined;
let viewportStart = 0;

function summarize(measures: PerformanceMeasure[]): string {
  const totals = new Map<string, number>();
  for (const measure of measures) totals.set(measure.name, (totals.get(measure.name) ?? 0) + measure.duration);
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, duration]) => `${name.padEnd(24)} ${duration.toFixed(1)} ms`)
    .join('\n');
}

async function renderWithBackend(name: string, backend: MainThreadComputeBackend | WorkerComputeBackend): Promise<void> {
  viewer?.destroy();
  viewer = await SpectrogramViewer.create({
    canvas,
    source,
    backend,
    cache: { tileDurationSeconds: 2, maxCachedTiles: 32 },
    viewport: { startTime: viewportStart, endTime: viewportStart + 8, minFrequency: 0, maxFrequency: 12_000 },
    stft: { windowSize: 2048, fftSize: 2048, hopSize: 512, window: 'hann' },
  });
  viewer.on('renderprofile', (event) => {
    profile.textContent = `${name}\nrequest: ${event.requestId}\ngeneration: ${event.generation}\n\n${summarize(event.measures)}`;
  });
  await viewer.render();
}

document.querySelector<HTMLButtonElement>('#main')!.addEventListener('click', () => {
  void renderWithBackend('MainThreadComputeBackend', new MainThreadComputeBackend());
});

document.querySelector<HTMLButtonElement>('#worker')!.addEventListener('click', () => {
  void renderWithBackend('WorkerComputeBackend', new WorkerComputeBackend());
});

document.querySelector<HTMLButtonElement>('#pan')!.addEventListener('click', () => {
  if (!viewer) return;
  viewportStart = (viewportStart + 2) % 40;
  viewer.setViewport({ startTime: viewportStart, endTime: viewportStart + 8 });
  void viewer.render();
});

void renderWithBackend('WorkerComputeBackend', new WorkerComputeBackend());
```

- [ ] **Step 3: Document the example**

Add to `README.md` near existing examples:

```md
## Performance Profiling

Run `npm run dev:example` and open `/performance.html` to compare the main-thread and worker compute backends on synthetic audio. The page listens for `renderprofile` events and summarizes tile compute and paint timings.
```

- [ ] **Step 4: Run typecheck and build**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev:example`

Expected: Vite starts and serves examples.

Open the printed local URL with `/performance.html`. Click `Render worker backend`, `Render main-thread backend`, and `Pan viewport`. Expected: spectrogram renders and profile text updates. Stop the dev server after the check.

- [ ] **Step 6: Commit**

```bash
git add examples/basic/performance.html examples/basic/performance.ts README.md
git commit -m "docs: add performance profiling example"
```

---

### Task 8: Final Verification And Stage 2 Notes

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-spectrogram-performance-stage-2-design.md` only if implementation discoveries require clarification.

**Interfaces:**
- Consumes: all previous task outputs.
- Produces: verified Stage 2 implementation and documented follow-up notes if profiling points to WebGL or WASM.

- [ ] **Step 1: Run full verification**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

Run: `npm run bench -- --run`

Expected: PASS and prints benchmark results.

- [ ] **Step 2: Inspect git status**

Run: `git status --short`

Expected: only intentional files are modified or untracked. Do not stage unrelated existing files such as `.agents/`, `skills-lock.json`, or unrelated plan files unless they were intentionally changed for this implementation.

- [ ] **Step 3: Record implementation notes if needed**

If benchmarks show `renderer.paint` dominates after worker compute, append this to the design spec under `Rendering Evaluation Criteria`:

```md

Implementation note: Stage 2 profiling showed `renderer.paint` can dominate for high-DPI or large canvases. A future WebGL rendering stage should start with matrix-as-texture color mapping before considering GPU STFT.
```

If benchmarks show `tile.stft.compute` dominates even in workers, append this to the design spec under `Compute Backend Evaluation Ladder`:

```md

Implementation note: Stage 2 profiling showed JavaScript worker STFT remains the dominant tile latency. The next compute exploration should prototype WebGL STFT against the same benchmark harness before considering WASM.
```

If neither condition is observed, do not edit the spec.

- [ ] **Step 4: Commit final notes if the spec changed**

If Step 3 changed the spec, commit:

```bash
git add docs/superpowers/specs/2026-08-12-spectrogram-performance-stage-2-design.md
git commit -m "docs: record performance stage 2 findings"
```

If Step 3 did not change the spec, skip this commit.

---

## Self-Review

- Spec coverage: Tasks cover profiling hooks, main-thread backend timing, Worker backend, stale render protection, concurrent tile requests, partial rendering, benchmarks, performance example, and final verification. WebGL and WASM are covered as evaluation criteria, not implementations.
- Placeholder scan: No task contains TBD/TODO/fill-in placeholders. Each code step includes concrete snippets and commands.
- Type consistency: `PerformanceProfiler`, `PerformanceMeasure`, `ComputeTileRequest.profile`, `WorkerComputeBackend`, `RenderInput.profile`, and `renderprofile` names match across tasks.
