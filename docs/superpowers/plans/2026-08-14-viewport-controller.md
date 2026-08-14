# Viewport Controller & Follow Playback Implementation Plan

Implement a centralized `ViewportController` (single source of truth for time bounds and playback tracking) and `linkViewports` coordinator in `@sonogram/core`, supporting `"page"`, `"smooth"` (centered tracking), and `"off"` follow playback modes across `SpectrogramViewer` and `WaveformViewer`.

## Proposed Architecture

```
┌────────────────────────────────────────────────────────┐
│                  ViewportController                    │
│  - Single source of truth for startTime & endTime      │
│  - Pan & Zoom coordination                             │
│  - Playback tracking ("page" | "smooth" | "off")       │
│  - Audio playback synchronization                      │
└───────────┬────────────────────────────────┬───────────┘
            │                                │
            ▼                                ▼
┌───────────────────────┐        ┌───────────────────────┐
│   SpectrogramViewer   │        │    WaveformViewer     │
│  - Time: bound to ctrl│        │  - Time: bound to ctrl│
│  - Freq: local bounds │        │  - Renders peaks      │
└───────────────────────┘        └───────────────────────┘
```

## Proposed File Structure

- `packages/core/src/viewport-controller.ts`: `ViewportController` class, `linkViewports` helper, and related types.
- `packages/core/src/viewport-controller.test.ts`: Unit tests for `ViewportController`, time bounds clamping, `"page"` jumping, `"smooth"` centering, and viewer binding.
- `packages/core/src/viewer.ts` & `packages/core/src/waveform/viewer.ts`: Support `bindViewport(controller)` to listen to controller changes and forward canvas pan/zoom interactions to the controller.
- `packages/core/src/index.ts`: Export `ViewportController`, `linkViewports`, and types.
- `examples/basic/waveform.html`: Updated demo with Follow Playback toggle buttons (`"page"`, `"smooth"`, `"off"`).

---

## Tasks

### Task 1: ViewportController Core Implementation
- Implement `ViewportController` in `packages/core/src/viewport-controller.ts`:
  - Viewport getters/setters: `getViewport()`, `setViewport()`, `updateViewport()`, `zoom()`, `pan()`, `panTo()`.
  - Follow modes: `"page"`, `"smooth"`, `"off"`.
  - Playback listener: reacts to `play`, `pause`, `timeupdate`, and `requestAnimationFrame`.
  - `bind(viewer: ITimeBoundViewer)` / `unbind(viewer: ITimeBoundViewer)`.
  - Implement `linkViewports(viewers, options)`.
- Write comprehensive unit tests in `packages/core/src/viewport-controller.test.ts`.

### Task 2: Integrate `bindViewport` in SpectrogramViewer and WaveformViewer
- Add `bindViewport(controller: ViewportController): () => void` to `SpectrogramViewer` and `WaveformViewer`.
- When bound, viewport time changes in either viewer forward to the controller, and controller events update the viewer.
- Update `packages/core/src/types.ts` and `packages/core/src/waveform/types.ts`.

### Task 3: Interactive Demo & Full Verification
- Update `examples/basic/waveform.html` with playback follow controls (`"page"`, `"smooth"`, `"off"`).
- Run full test suite (`npm run check:biome`, `npm run check:types`, `npm test`, `npm run test:browser`, `npm run build`).
