# Spectrogram Performance Stage 2 Design

## Summary

Stage 2 makes `spectrogram-js` usable in more realistic browser scenarios by keeping interaction responsive while spectrogram tiles compute. The primary success metric is that viewport changes, resize, zoom/pan, and playback do not hang the UI. The secondary metric is improved STFT throughput through parallel tile computation.

This stage builds on the existing tiled pull-based architecture. It adds profiling and benchmarking first-class enough to measure progress, then ships a production Web Worker compute backend for independent tile jobs. The compute fallback order is JavaScript STFT first, WebGL STFT compute second, and WASM STFT compute third. This stage should measure whether canvas painting or JavaScript FFT throughput is the bottleneck before adding another renderer or compute engine.

## Goals

- Keep the browser main thread responsive during tile computation.
- Avoid painting stale viewport results after the user changes viewport or config.
- Compute independent visible tiles concurrently in Web Workers.
- Support partial rendering as tiles become available.
- Add profiling hooks that identify where time is spent: source read, queue wait, STFT compute, transforms, cache, painting, and total render request time.
- Add repeatable benchmarks for main-thread and worker backends.
- Preserve the current public viewer API where possible.
- Keep the implementation small, clear, and YAGNI-driven. Add abstractions only when they remove real duplication, isolate real complexity, or preserve an existing extension point.

## Non-Goals

- Full WebGL renderer implementation.
- Multi-resolution spectrogram pyramid.
- Streaming/chunked browser audio decode.
- Replacing the existing tile cache model.

## Current Bottlenecks

The current implementation has two main blocking paths:

- `MainThreadComputeBackend.computeTile` reads samples and runs STFT on the main thread. `computeStftMatrix` performs per-frame FFT work synchronously, allocating arrays per frame through `fftMagnitudes`.
- `SpectrogramViewer.render` awaits each tile sequentially before painting. A viewport change starts a new render but there is no generation-based stale result handling, no cancellation signal, and no partial painting.

Rendering can also be expensive because `CanvasSpectrogramRenderer.paintTile` iterates every output pixel, maps pixel coordinates to time/frequency, searches nearest frame/bin, normalizes, and writes `ImageData`. Stage 2 should measure this cost separately before deciding whether WebGL rendering is justified.

## Architecture

Stage 2 adds four focused pieces:

- `PerformanceProfiler`: internal timing utility used by viewer, backends, transforms, and renderer.
- `WorkerComputeBackend`: worker-pool implementation of `SpectrogramComputeBackend`.
- Render scheduler changes in `SpectrogramViewer`: render generations, concurrent tile requests, stale result handling, and partial paint.
- Benchmark and profiling examples: synthetic fixtures and scripts that compare main-thread and worker behavior.

The default backend can remain `MainThreadComputeBackend` until the worker backend is stable across bundlers. The public API should allow users to opt in with `backend: new WorkerComputeBackend()`.

## Simplicity Constraints

Performance work should not turn the codebase into a framework. Prefer small, direct changes over generalized infrastructure:

- Keep profiling as a lightweight helper, not a telemetry subsystem.
- Keep scheduling logic inside `SpectrogramViewer` unless it becomes too large to read and test.
- Reuse the existing `SpectrogramComputeBackend` boundary instead of adding a larger backend framework.
- Avoid speculative cancellation, priority queues, tile graph abstractions, renderer registries, or plugin systems unless profiling shows they solve a current problem.
- Keep worker message formats explicit and minimal.
- Prefer readable JavaScript STFT improvements before adding WebGL or WASM complexity.

## Profiling Events

Add a profiling event that is detailed enough for examples and tests but not tied to browser DevTools APIs:

```ts
type PerformanceMeasure = {
  name: string;
  start: number;
  duration: number;
  detail?: Record<string, string | number | boolean>;
};

type RenderProfileEvent = {
  requestId: string;
  generation: number;
  measures: PerformanceMeasure[];
};
```

Expose it as:

```ts
viewer.on('renderprofile', handler);
```

Required measure names:

- `render.total`
- `render.visibleTiles`
- `tile.cache.lookup`
- `tile.queue.wait`
- `tile.source.read`
- `tile.stft.compute`
- `tile.transforms.apply`
- `tile.total`
- `renderer.paint`

Measures should use `performance.now()` in browsers and a compatible fallback in tests if needed. Profiling should be cheap when no listeners are attached, but correctness matters more than micro-optimizing the profiler in this stage.

## Backend Profiling Contract

The current `SpectrogramComputeBackend` interface can remain source-compatible, but Stage 2 should extend `ComputeTileRequest` with optional profiling metadata instead of adding a second backend method:

```ts
type ComputeTileRequest = {
  source: AudioSource;
  channel: number;
  timeStart: number;
  timeEnd: number;
  stft: StftConfig;
  profile?: PerformanceProfiler;
};
```

Backends that do not use profiling can ignore `profile`. `MainThreadComputeBackend` should record `tile.source.read` and `tile.stft.compute`. `WorkerComputeBackend` should record `tile.queue.wait`, `tile.source.read`, and `tile.stft.compute`, with worker-reported compute timestamps converted into durations rather than assuming worker and main-thread clocks share the same origin.

## Worker Compute Backend

Add a `WorkerComputeBackend` implementing the existing backend interface:

```ts
class WorkerComputeBackend implements SpectrogramComputeBackend {
  constructor(options?: {
    workerCount?: number;
    workerUrl?: URL | string;
  });

  computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix>;
  destroy(): void;
}
```

Worker behavior:

- Each tile compute request becomes one worker job.
- The backend limits active jobs to `workerCount`, defaulting to a conservative value based on `navigator.hardwareConcurrency` when available.
- Requests are assigned monotonic IDs so responses can resolve the correct promise.
- Sample data should be transferred to workers as `Float32Array` buffers where possible.
- Worker responses should transfer matrix typed-array buffers back to the main thread where possible.
- `destroy()` terminates workers and rejects queued or running jobs with an error.

Audio source access remains on the main thread for stage 2. The backend reads samples through `AudioSource.read`, then sends the resulting sample array to a worker for STFT. This avoids requiring every `AudioSource` implementation to be serializable while still moving the expensive FFT work off the UI thread. `DecodedAudioSource.read` already returns a sliced `Float32Array`, so transferring its buffer to a worker will not detach the original decoded audio buffer.

Transforms stay in the viewer for stage 2. They may be async and may depend on user code, so moving them to workers would require a separate transform serialization design. Profiling should measure transform time separately so this can be revisited later.

## Render Scheduling

`SpectrogramViewer.render` should become generation-aware:

- Increment a render generation for every explicit render and for config/viewport changes that trigger rendering.
- Capture viewport, config hash, and generation at render start.
- Compute all visible tile keys up front.
- Start missing tile requests concurrently, subject to backend concurrency limits.
- Paint cached tiles immediately when available.
- Paint again as new tiles complete, if the render generation is still current.
- Ignore stale render completions for painting and final state transitions.

Stale tile results may still be inserted into cache if their cache key matches the current source/STFT/transform identity. This preserves useful work when a user pans away and back. Stale results must not emit `rendercomplete` for the current request or overwrite the latest viewport image.

The scheduler does not need full abort propagation in stage 2. Generation checks are enough to protect correctness. Worker queue cancellation can be added later if benchmarks show wasted compute is a major problem.

## Partial Rendering

Partial rendering should improve perceived responsiveness without changing the matrix model:

- If some visible tiles are cached, paint those immediately.
- As additional visible tiles complete, repaint with the complete set available for the active generation.
- Emit `renderprogress` as tiles finish.
- `rendercomplete` should report rendered and missing tiles for the final active generation.

The renderer can continue drawing a full `ImageData` per paint in stage 2. Profiling will show whether repeated full paints are too expensive. If full paints become a bottleneck, a later renderer can paint dirty regions or use WebGL.

## Benchmarking

Add repeatable benchmark coverage outside normal unit tests. Benchmarks should run against synthetic sources so they are deterministic and do not depend on external audio files.

Benchmark scenarios:

- Single tile STFT compute time for common sizes: 1024/256, 2048/512, and 4096/1024.
- Full viewport render time with 1, 4, and 8 visible tiles.
- Viewport change responsiveness while previous tiles are still computing.
- Main-thread long-task proxy: measure maximum uninterrupted synchronous span during render scheduling and painting.
- Main-thread backend vs worker backend total time and time-to-first-partial-paint.

Recommended commands:

```json
{
  "bench": "vitest bench",
  "bench:browser": "vitest bench --browser"
}
```

If browser benchmark setup is too heavy for the first implementation pass, add node/jsdom-compatible compute benchmarks first and a manual browser performance example under `examples/basic/performance.*`.

## Compute Backend Evaluation Ladder

Stage 2 should optimize and measure the JavaScript STFT path first. The preferred compute path is:

1. JavaScript STFT in Web Workers.
2. WebGL STFT compute if JavaScript workers do not provide enough throughput.
3. WASM STFT compute if WebGL compute is not viable or not fast enough.

JavaScript STFT remains first because it has the simplest packaging, easiest debugging, and best compatibility with the current TypeScript code. WebGL compute comes next because it may exploit GPU parallelism without adding a native-code build pipeline, but it has algorithmic and portability risk. WASM comes last because it adds build, packaging, and typed-array boundary complexity, even though it may eventually provide the best CPU-side FFT throughput.

WebGL STFT compute exploration is justified if one or more are true:

- `tile.stft.compute` remains the dominant cost after using JavaScript workers.
- Worker parallelism improves responsiveness but total tile latency is still too high for realistic recordings.
- Straightforward JavaScript FFT optimization does not produce acceptable throughput for common STFT sizes.

WASM STFT compute exploration is justified if one or more are true:

- A WebGL compute prototype is not viable across target browsers.
- WebGL compute does not outperform optimized JavaScript workers enough to justify its complexity.
- CPU-side throughput remains the limiting factor after JavaScript and WebGL options are measured.

Both WebGL and WASM prototypes should use the same benchmark harness as the JavaScript worker backend. They should be treated as compute backend options, not replacements for the worker scheduling model.

## Rendering Evaluation Criteria

Canvas rendering should move to a WebGL renderer only if profiles show `renderer.paint` is a dominant cost after worker compute is enabled.

A future WebGL rendering stage is justified if one or more are true:

- `renderer.paint` regularly exceeds STFT worker time for realistic viewport sizes.
- Repeated partial paints cause visible jank even though workers keep STFT off the main thread.
- High-DPI canvases or large viewport sizes make `ImageData` writes dominate interaction latency.

## Testing Strategy

Unit tests:

- Profiler records nested and sequential measures with stable names.
- Worker backend resolves jobs, preserves matrix contents, and rejects on `destroy()`.
- Render generation ignores stale tile completions.
- Partial rendering emits progress and completes only the active generation.

Integration tests:

- Main-thread backend and worker backend return equivalent matrices for a synthetic sine source.
- Rapid viewport changes do not paint older viewport results last.
- Cached tiles paint before missing tiles complete.

Manual/browser tests:

- Long synthetic audio remains interactive during initial render.
- Zoom/pan/resize does not freeze while workers compute.
- Playback playhead continues updating while tiles compute.
- Performance example shows profile summaries for compute and paint phases.

## Implementation Scope

Stage 2 is complete when:

- A user can opt into `WorkerComputeBackend` through `SpectrogramViewer.create`.
- Tile STFT work no longer runs on the main thread when the worker backend is used.
- Rapid viewport changes cannot result in stale final paints.
- Cached or completed tiles can render before all visible tiles finish.
- `renderprofile` events expose timing for compute and paint phases.
- Benchmarks or a performance example compare main-thread and worker behavior.
- Existing tests still pass, and new tests cover the scheduling and backend behavior.
