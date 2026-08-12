# Spectrogram Viewer Design

## Summary

Build a framework-agnostic TypeScript library for rendering performant browser spectrograms into a user-provided canvas. The common API accepts an `HTMLAudioElement` and an `HTMLCanvasElement`; the viewer decodes audio for random-access sample computation and uses the audio element only for playback synchronization.

The library should be standalone, not a wrapper around Wavesurfer. Wavesurfer's current spectrogram plugin validates the general architecture: lazy windowed segments, optional workers, dB/color mapping, multiple frequency scales, and canvas rendering are all practical in the browser. This project should use those ideas as reference points while keeping independent APIs and module boundaries.

## Goals

- Render spectrograms from browser audio with good visualization accuracy and clear digital units.
- Work with any frontend framework through plain TypeScript and DOM objects.
- Compute only the visible or near-visible spectrogram data for long recordings.
- Allow external code to set and query state/configuration.
- Support playback playhead synchronization with an `HTMLAudioElement`.
- Support configurable STFT parameters, viewport ranges, frequency scales, value modes, color maps, and custom transforms.
- Expose coordinate conversion and numeric query APIs.

## Non-Goals For V1

- Web Worker backend implementation, though the backend interface should allow it later.
- WebGL rendering.
- Calibrated SPL or physical acoustic units.
- Browser-native chunked audio decode.
- Multi-resolution spectrogram pyramid.
- Axes, labels, grids, annotation UI, or framework wrappers.
- Built-in denoising transforms beyond examples.

## Public API

The main entry point is an imperative controller:

```ts
const viewer = await SpectrogramViewer.create({
  audio: audioElement,
  canvas,
  colorMap: 'viridis',
});
```

Advanced users can provide an explicit source:

```ts
const viewer = await SpectrogramViewer.create({
  audio: audioElement,
  canvas,
  source: myAudioSource,
});
```

The `audio` and `source` options have distinct roles and must be documented clearly:

- `audio` controls playback state: current time, seek events, play/pause events, and playhead synchronization.
- `source` provides sample access for STFT computation.
- If `source` is omitted, the viewer creates a `DecodedAudioSource` from `audio.currentSrc || audio.src`.

Core methods:

```ts
viewer.getConfig();
viewer.setConfig(partialConfig);

viewer.getViewport();
viewer.setViewport(partialViewport);

viewer.render();
viewer.destroy();

viewer.canvasToTimeFrequency(x, y);
viewer.timeFrequencyToCanvas(time, frequency);

await viewer.queryPoint({ time, frequency, channel: 0 });
await viewer.queryCanvasPoint({ x, y, channel: 0 });
await viewer.querySpectrum({ time, channel: 0 });
await viewer.queryFrame({ frameIndex, channel: 0 });
```

## Architecture

Major units:

- `SpectrogramViewer`: public controller, config/state ownership, render scheduling, playback sync, events.
- `AudioSource`: interface for reading sample ranges.
- `DecodedAudioSource`: initial source implementation backed by a decoded `AudioBuffer`.
- `SpectrogramCache`: lazy time-tile cache with memory-bounded eviction.
- `SpectrogramComputeBackend`: pluggable compute backend interface.
- `MainThreadComputeBackend`: initial backend implementation.
- `CanvasSpectrogramRenderer`: renderer for the provided canvas.
- `ColorMap`: named and custom color interpolation.
- `FrequencyScale`: linear, log, and mel mapping helpers.

The viewer uses a tiled pull-based renderer. On each render it resolves the current viewport, determines the needed time tiles, requests missing tiles from the cache, computes missing data through the backend, applies transforms, and paints visible tile portions.

## Audio Source Model

V1 should include an `AudioSource` abstraction to avoid coupling rendering to `AudioBuffer` forever:

```ts
interface AudioSource {
  readonly sampleRate: number;
  readonly duration: number;
  readonly channelCount: number;
  read(options: {
    channel: number;
    startTime: number;
    endTime: number;
  }): Float32Array | Promise<Float32Array>;
}
```

`DecodedAudioSource` is the first implementation. It may decode the full file initially, but the rest of the library should depend only on `AudioSource` so future chunked or server-backed sources can be added without changing the viewer API.

## STFT Configuration

V1 STFT options:

```ts
stft: {
  windowSize: number;
  fftSize: number;
  hopSize: number;
  window: 'hann' | 'hamming' | 'blackman' | 'rectangular';
}
```

Validation rules:

- `fftSize` must be a power of two.
- `fftSize >= windowSize`.
- `windowSize > 0`.
- `hopSize > 0`.
- Window names must be known.

V1 should prioritize visualization correctness with explicit digital units. It should not claim physical calibration.

## Viewport And Frequency Scales

Viewport config:

```ts
viewport: {
  startTime: number;
  endTime: number;
  minFrequency: number;
  maxFrequency: number;
  frequencyScale: 'linear' | 'log' | 'mel';
}
```

Time mapping is linear across the canvas width. Frequency mapping depends on `frequencyScale` and is inverted vertically: `y = 0` maps to `maxFrequency`, and `y = canvasHeight` maps to `minFrequency`.

The same mapping code should power rendering, `queryCanvasPoint`, pointer tools, and future annotations.

## Value Modes

Stored matrix values:

- `magnitude`: linear STFT magnitude.
- `power`: derived as `magnitude ** 2` when needed.
- `db`: derived as digital amplitude dB when needed.

Display config:

```ts
valueScale: {
  mode: 'magnitude' | 'power' | 'db';
  min?: number;
  max?: number;
  gamma?: number;
  clamp?: boolean;
}
```

Rendering converts the selected value mode into normalized `[0, 1]`, then maps through the color map.

Documentation must state that `db` values are digital spectrogram display values derived from decoded sample amplitudes. They are not dB SPL and should not be interpreted as calibrated physical units unless external calibration is added outside the library.

## Color Maps

Color map config should support named presets and custom definitions:

```ts
colorMap: 'gray';
colorMap: 'viridis';
colorMap: 'magma';
colorMap: 'inferno';
colorMap: 'plasma';
colorMap: 'turbo';

colorMap: {
  base: 'magma',
  gamma: 0.8,
  contrast: 1.2,
  brightness: 0.05,
};

colorMap: {
  points: [
    { at: 0, color: '#000000' },
    { at: 1, color: '#ffffff' },
  ],
};
```

Custom points are interpolated into an internal lookup table for fast rendering.

## Data Model And Queries

The internal compute unit is a time tile represented as a spectrogram matrix. A tile is not a pixel; it is a rectangular time-frequency chunk for one channel.

```ts
type SpectrogramMatrix = {
  channel: number;
  timeStart: number;
  timeEnd: number;
  frameStart: number;
  frameCount: number;
  binCount: number;
  sampleRate: number;
  times: Float32Array;
  frequencies: Float32Array;
  magnitude: Float32Array;
  power?: Float32Array;
  db?: Float32Array;
  normalized?: Uint8Array | Float32Array;
};
```

Matrices use frame-major indexing: `frame * binCount + bin`.

`queryPoint` returns the nearest or interpolated value at a time/frequency point:

```ts
{
  time: number;
  frequency: number;
  frameIndex: number;
  binIndex: number;
  channel: number;
  magnitude?: number;
  power?: number;
  db?: number;
  normalized?: number;
  color?: [number, number, number, number];
}
```

`querySpectrum` returns the full spectral column nearest a time:

```ts
{
  time: number;
  frameIndex: number;
  channel: number;
  frequencyScale: 'linear' | 'log' | 'mel';
  values: {
    frequency: Float32Array;
    magnitude?: Float32Array;
    power?: Float32Array;
    db?: Float32Array;
    normalized?: Float32Array | Uint8Array;
  };
}
```

Returned typed arrays should be treated as read-only by consumers.

## Transforms

Transforms operate on spectrogram matrices before rendering and querying:

```ts
type SpectrogramTransform = {
  name: string;
  version: string;
  config?: unknown;
  timePaddingSeconds?: number;
  frequencyPaddingBins?: number;
  apply(
    matrix: SpectrogramMatrix,
    context: TransformContext,
  ): SpectrogramMatrix | Promise<SpectrogramMatrix>;
};
```

This supports pointwise transforms, per-frequency row normalization, per-time column normalization, 2D filters, and transforms that need neighboring context.

If any transform requests padding, the backend computes a padded matrix, runs the transform chain, and crops back to the canonical tile bounds before caching and rendering.

The transform identity is part of the cache key:

```ts
transformHash = hash([
  transform.name,
  transform.version,
  transform.config,
]);
```

V1 should include the transform pipeline but does not need built-in denoising transforms.

## Caching And Computation

The cache stores transformed tiles keyed by:

- source identity/version
- channel
- tile time bounds
- STFT config hash
- transform hash
- frequency axis config if it affects computed bins

Initial cache policy:

```ts
cache: {
  tileDurationSeconds: 5,
  maxCachedTiles: 64,
}
```

Rendering flow:

1. Resolve viewport and canvas dimensions.
2. Determine overlapping tile IDs.
3. Request missing tiles from cache.
4. Compute missing tiles through `SpectrogramComputeBackend`.
5. Apply transforms and crop padding.
6. Store transformed tiles.
7. Paint visible tile portions.
8. Evict distant tiles once over cache limits.

The compute backend interface:

```ts
interface SpectrogramComputeBackend {
  computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix>;
  destroy?(): void;
}
```

V1 ships `MainThreadComputeBackend`. Worker and WASM backends can be added later without changing the viewer API.

Render scheduling should ignore stale compute results if the viewport or config changed while a tile was computing.

## Rendering

The renderer paints into the provided canvas. It should account for CSS size and device pixel ratio.

Inputs:

- viewport
- canvas size and device pixel ratio
- transformed tiles
- value scale
- color map
- playback/playhead state

The first implementation can use `ImageData` and either `putImageData` or `createImageBitmap`. The renderer interface should allow future `OffscreenCanvas` or WebGL implementations.

## Playback Synchronization

Playback sync is configured explicitly:

```ts
playback: {
  showPlayhead: true,
  follow: false,
  followMargin: 0.2,
  renderOnSeek: true,
}
```

Behavior:

- `showPlayhead`: draw a vertical line at `audio.currentTime` when inside the viewport.
- `follow`: while audio plays, shift the viewport to keep the playhead visible.
- `followMargin`: when following, keep the playhead away from the viewport edge.
- `renderOnSeek`: rerender if a seek changes the visible area or playhead.

The viewer should listen to relevant audio events and use `requestAnimationFrame` while playing for smooth playhead updates.

## Events And State

The viewer should expose queryable state and an event emitter:

```ts
viewer.on('configchange', handler);
viewer.on('viewportchange', handler);
viewer.on('renderstart', handler);
viewer.on('renderprogress', handler);
viewer.on('rendercomplete', handler);
viewer.on('tileload', handler);
viewer.on('error', handler);
```

`renderprogress` describes the current viewport render request, not global file processing:

```ts
{
  requestId: string;
  completed: number;
  total: number;
  progress: number;
  phase: 'computing' | 'rendering';
}
```

Possible status values:

```ts
{
  state: 'idle' | 'loading' | 'rendering' | 'ready' | 'error' | 'destroyed';
  error?: Error;
}
```

## Error Handling

Static config errors should throw at construction or `setConfig` time. Async/runtime errors should emit `error` events.

Validate:

- canvas is an `HTMLCanvasElement`
- audio is an `HTMLAudioElement` if provided
- either `source` or usable `audio.src/currentSrc` exists
- STFT sizes and window names are valid
- frequency range is valid and within Nyquist where possible
- log/mel scales handle zero or negative lower bounds safely
- color map names and points are valid
- transform names and versions are present

Runtime error phases include decode, source read, compute, transform, render, and playback sync.

Recoverable errors should preserve the previous rendered image where possible. Non-recoverable errors should put the viewer in an `error` state.

## Testing Strategy

Unit tests:

- STFT frame and bin counts
- window functions
- linear/log/mel frequency mapping
- magnitude/power/dB/normalized conversion
- color map interpolation and named maps
- coordinate conversion
- cache key invalidation
- transform padding/cropping
- query point and query spectrum behavior

Integration tests:

- create viewer with audio and canvas
- decode a small generated fixture
- render a sine wave and verify peak energy near the expected frequency
- change viewport and verify only needed tiles are requested
- seek audio and verify playhead updates
- change config and verify cache invalidation

Browser/manual tests:

- canvas rendering works
- high-DPI sizing works
- playback sync updates smoothly
- resize triggers correct rerendering
- long synthetic source does not compute unrelated ranges

## V1 Scope

V1 includes:

- TypeScript package
- `SpectrogramViewer`
- common `{ audio, canvas }` creation
- optional `AudioSource`
- `DecodedAudioSource`
- lazy time-tile cache
- main-thread compute backend behind pluggable interface
- STFT configuration
- `linear`, `log`, and `mel` frequency scales
- viewport control
- `magnitude`, `power`, and `db` value modes
- named and custom color maps
- matrix-level transform pipeline with padding support
- direct rendering to provided canvas
- playback playhead and optional follow mode
- coordinate conversion
- `queryPoint`, `queryCanvasPoint`, `querySpectrum`, and `queryFrame`
- events including `renderprogress`
- tests and a minimal example page
