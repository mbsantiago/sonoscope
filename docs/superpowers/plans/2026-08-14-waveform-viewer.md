# Waveform Viewer Implementation Plan

Implement a standalone, decoupled, high-performance `WaveformViewer` in `@sonogram/core` with multi-scale peak pyramid decimation, a flexible `WaveformRenderer` interface, a 2D Canvas renderer implementation, and seamless viewport time synchronization with `SpectrogramViewer`.

## Proposed Architecture

```
┌────────────────────────────────────────────────────────┐
│                   WaveformViewer                       │
│  - Viewport & Time Bounds (startTime, endTime)         │
│  - Playback Sync (HTMLAudioElement)                    │
│  - Coordinate Mapping (canvasToTime, timeToCanvas)     │
│  - Event System (viewportchange, rendercomplete, etc.) │
└───────────┬────────────────────────────────┬───────────┘
            │                                │
            ▼                                ▼
┌──────────────────────────────┐ ┌───────────────────────┐
│     WaveformPeakPyramid      │ │   WaveformRenderer    │
│  - Multi-scale min/max peaks │ │  - CanvasWaveformRenderer │
│  - Decimation cache (1x..4k) │ │  - (Future WebGL2)    │
└──────────────────────────────┘ └───────────────────────┘
```

## Proposed File Structure

- `packages/core/src/waveform/types.ts`: Type definitions (`WaveformConfig`, `ResolvedWaveformConfig`, `WaveformRenderInput`, `WaveformRenderer`, `IWaveformViewer`, `WaveformEvents`, `PeakBlock`).
- `packages/core/src/waveform/peaks.ts`: Peak extraction algorithm and `WaveformPeakPyramid` multi-resolution decimation caching.
- `packages/core/src/waveform/renderers/canvas.ts`: `CanvasWaveformRenderer` (2D Canvas mirrored envelope and progress rendering).
- `packages/core/src/waveform/viewer.ts`: `WaveformViewer` class implementation with factory constructors (`fromUrl`, `fromAudio`, `fromSource`, `create`).
- `packages/core/src/waveform/peaks.test.ts`: Unit tests for peak calculation and multi-scale pyramids.
- `packages/core/src/waveform/renderers/canvas.test.ts`: Unit tests for the 2D canvas renderer.
- `packages/core/src/waveform/viewer.test.ts`: Unit tests for `WaveformViewer` lifecycle, coordinate conversions, audio sync, and viewport events.
- `packages/core/src/index.ts`: Package entry exports for waveform types and viewer.
- `examples/basic/waveform.html`: Interactive dual Spectrogram + Waveform synchronization demo.

---

## Tasks

### Task 1: Waveform Types and Peak Calculation with Multi-Resolution Pyramids
- Create `packages/core/src/waveform/types.ts` defining `PeakBlock`, `WaveformConfig`, `WaveformRenderInput`, `WaveformRenderer`, and `IWaveformViewer`.
- Create `packages/core/src/waveform/peaks.ts` implementing `computePeaks(samples, samplesPerPixel)` and `WaveformPeakPyramid`.
- Write unit tests in `packages/core/src/waveform/peaks.test.ts`.

### Task 2: Canvas Waveform Renderer
- Create `packages/core/src/waveform/renderers/canvas.ts` implementing `CanvasWaveformRenderer`.
- Support high-DPR canvas rendering, top/bottom mirrored envelopes, custom wave/progress colors, and playhead indicator.
- Write unit tests in `packages/core/src/waveform/renderers/canvas.test.ts`.

### Task 3: WaveformViewer Core Class
- Create `packages/core/src/waveform/viewer.ts` implementing `WaveformViewer implements IWaveformViewer`.
- Implement `fromUrl`, `fromAudio`, `fromSource`, `create`.
- Implement `getViewport`, `setViewport`, `updateViewport`, `zoomTime`, `canvasToTime`, `timeToCanvas`, `attachAudio`, `detachAudio`, `render`, `destroy`.
- Write unit tests in `packages/core/src/waveform/viewer.test.ts`.

### Task 4: Package Exports and Integration Verification
- Export waveform modules from `packages/core/src/index.ts`.
- Run typecheck, linting, unit tests, and browser tests across the monorepo.

### Task 5: Interactive Dual Spectrogram + Waveform Demo
- Create `examples/basic/waveform.html` displaying vertically stacked Waveform and Spectrogram viewers driven by a shared audio source and synchronized viewport.
