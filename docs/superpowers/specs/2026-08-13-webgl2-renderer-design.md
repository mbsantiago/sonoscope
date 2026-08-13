# WebGL2 Renderer Design

## Goal

Add a second spectrogram renderer backed by WebGL2. The default renderer should use WebGL2 when available and fall back to the current Canvas 2D renderer when WebGL2 is unavailable.

The change should keep the viewer API stable, preserve the current Canvas renderer as a reliable fallback, and isolate renderer-specific details behind a small interface.

## Public API

Add an optional renderer selection field to `SpectrogramConfig`:

```ts
renderer?: "auto" | "webgl2" | "canvas2d";
```

Behavior:

- `"auto"` is the default.
- `"auto"` attempts to create a WebGL2 renderer. If WebGL2 is unavailable, it uses the Canvas 2D renderer.
- `"webgl2"` requires WebGL2. If unavailable, viewer creation fails with a clear error.
- `"canvas2d"` always uses the existing Canvas renderer.

## Renderer Interface

Introduce a renderer interface used by `SpectrogramViewer`:

```ts
interface SpectrogramRenderer {
  readonly kind: "webgl2" | "canvas2d";
  invalidate(): void;
  render(input: RenderInput): void;
  renderPlayhead(input: PlayheadRenderInput): boolean;
  renderLoading(input: LoadingRenderInput): void;
  destroy?(): void;
}
```

The viewer should depend only on this interface. It should not contain WebGL-specific code.

## Renderer Factory

Add a small factory that selects the renderer:

```ts
createSpectrogramRenderer(canvas: HTMLCanvasElement, mode: "auto" | "webgl2" | "canvas2d"): SpectrogramRenderer
```

The factory should:

- Return `CanvasSpectrogramRenderer` for `"canvas2d"`.
- Return `WebGL2SpectrogramRenderer` for `"webgl2"`, or throw if unavailable.
- Try `WebGL2SpectrogramRenderer` first for `"auto"`; on failure, return `CanvasSpectrogramRenderer`.

## WebGL2 Rendering Model

The WebGL2 renderer should render spectrogram tiles as GPU textures.

For each visible tile:

- Prepare the active scalar value data from `SpectrogramMatrix` using the selected value mode.
- Upload the scalar data as a texture.
- Draw a rectangle covering the tile's time span in the viewport.
- In the fragment shader, map screen position to time and frequency.
- Convert frequency using the viewport scale: linear, log, or mel.
- Sample the tile texture with linear filtering.
- Apply value normalization.
- Apply the selected color map.

The CPU-side `SpectrogramMatrix` cache remains unchanged. The WebGL renderer owns a separate texture cache keyed by tile identity and render-relevant settings.

## Playhead Rendering

The WebGL2 renderer should render the playhead as an overlay line.

`renderPlayhead(...)` should be cheap and should avoid rebuilding spectrogram tile textures. It may redraw the current scene plus the overlay, or use a lightweight overlay pass if that is simpler and reliable.

If the cached WebGL scene is invalid because the viewport, canvas size, or renderer state changed, `renderPlayhead(...)` should return `false`, matching the current Canvas renderer behavior.

## Loading And Placeholders

The renderer must support the existing loading and placeholder behavior.

- `renderLoading(...)` may use a simple Canvas 2D overlay even in the WebGL renderer if that keeps the implementation smaller.
- Placeholders should be drawn for missing tile ranges. A simple solid or hatched GL placeholder is acceptable for the first version, as long as missing ranges remain visually distinct.

## Fallback And Errors

Fallback behavior must be deterministic:

- `renderer: "auto"` never fails solely because WebGL2 is unavailable.
- `renderer: "webgl2"` fails if `canvas.getContext("webgl2")` is unavailable.
- Runtime WebGL initialization failures in `"auto"` should fall back to Canvas 2D.
- Runtime failures after WebGL2 renderer creation should emit the existing viewer error event and avoid silent corruption.

## Testing

Unit tests should cover:

- Config default is `"auto"`.
- Factory selects Canvas 2D when requested.
- Factory falls back to Canvas 2D when WebGL2 is unavailable in `"auto"` mode.
- Factory throws when `"webgl2"` is requested and unavailable.
- `SpectrogramViewer` uses a renderer through the shared interface.
- Canvas renderer behavior remains covered by existing tests.

WebGL shader correctness should be tested pragmatically. Unit tests can mock WebGL2 context creation and renderer selection. Pixel-perfect WebGL rendering tests are out of scope for the first version.

## Non-Goals

- Do not remove or degrade the Canvas renderer.
- Do not add WebGL1 support in this iteration.
- Do not move STFT computation to the GPU.
- Do not redesign the tile cache.
- Do not add public GPU memory accounting yet.

## Implementation Notes

The first WebGL2 implementation should prioritize clear boundaries over advanced optimization. The renderer abstraction is the foundation; after it lands, GL internals can be improved incrementally.
