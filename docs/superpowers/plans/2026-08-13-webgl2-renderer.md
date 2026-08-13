# WebGL2 Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a WebGL2 spectrogram renderer selected by default through `renderer: "auto"`, with Canvas 2D fallback.

**Architecture:** Introduce a shared renderer interface and factory, keep the existing Canvas renderer intact, and add a focused `WebGL2SpectrogramRenderer` behind the same interface. `SpectrogramViewer` owns renderer selection but never contains WebGL-specific code.

**Tech Stack:** TypeScript, Vite, Vitest, Canvas 2D, WebGL2 GLSL ES 3.00.

## Global Constraints

- `renderer: "auto"` is the default.
- `renderer: "auto"` attempts WebGL2 first and falls back to Canvas 2D when WebGL2 is unavailable.
- `renderer: "webgl2"` throws a clear error when WebGL2 is unavailable.
- `renderer: "canvas2d"` always uses the existing Canvas renderer.
- Do not remove or degrade the Canvas renderer.
- Do not add WebGL1 support in this iteration.
- Do not move STFT computation to the GPU.
- Do not redesign the tile cache.
- Do not add public GPU memory accounting yet.

---

## File Structure

- Modify `src/types.ts`: add `RendererMode` and `renderer?: RendererMode` to `SpectrogramConfig`; add resolved `renderer: RendererMode`.
- Modify `src/config.ts`: default `renderer` to `"auto"` and preserve it through `resolveConfig`.
- Modify `src/renderer.ts`: export the shared renderer interface and mark `CanvasSpectrogramRenderer.kind = "canvas2d"`.
- Create `src/renderer-factory.ts`: select Canvas/WebGL2 based on config and WebGL2 availability.
- Create `src/webgl2-renderer.ts`: implement `WebGL2SpectrogramRenderer` using WebGL2 textures and shaders.
- Modify `src/viewer.ts`: construct renderer via factory, call `destroy()`, and preserve renderer mode across config changes.
- Modify `src/index.ts`: export factory, WebGL2 renderer, and renderer types.
- Add/modify tests in `src/config.test.ts`, `src/renderer-factory.test.ts`, `src/viewer.test.ts`, and targeted WebGL2 smoke tests.

---

### Task 1: Renderer Config And Interface

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Modify: `src/renderer.ts`
- Modify: `src/config.test.ts`

**Interfaces:**
- Produces: `RendererMode = "auto" | "webgl2" | "canvas2d"`
- Produces: `SpectrogramRenderer` interface with `kind`, `invalidate`, `render`, `renderPlayhead`, `renderLoading`, optional `destroy`
- Produces: `CanvasSpectrogramRenderer.kind: "canvas2d"`

- [ ] **Step 1: Add failing config tests**

Add to `src/config.test.ts`:

```ts
it('defaults renderer mode to auto', () => {
  expect(resolveConfig({ canvas, source }).renderer).toBe('auto');
});

it('preserves explicit renderer modes', () => {
  expect(resolveConfig({ canvas, source, renderer: 'canvas2d' }).renderer).toBe('canvas2d');
  expect(resolveConfig({ canvas, source, renderer: 'webgl2' }).renderer).toBe('webgl2');
});
```

- [ ] **Step 2: Run config tests and verify failure**

Run: `npm test -- --run src/config.test.ts`

Expected: FAIL because `renderer` is not in config types or resolved config.

- [ ] **Step 3: Add renderer mode types**

Modify `src/types.ts`:

```ts
export type RendererMode = 'auto' | 'webgl2' | 'canvas2d';
```

Add to `SpectrogramConfig`:

```ts
renderer?: RendererMode;
```

Add to `ResolvedSpectrogramConfig`:

```ts
renderer: RendererMode;
```

- [ ] **Step 4: Resolve renderer mode**

Modify the returned object in `src/config.ts`:

```ts
renderer: input.renderer ?? 'auto',
```

- [ ] **Step 5: Add renderer interface**

Add to `src/renderer.ts` near render input types:

```ts
export type RendererKind = 'webgl2' | 'canvas2d';

export interface SpectrogramRenderer {
  readonly kind: RendererKind;
  invalidate(): void;
  render(input: RenderInput): void;
  renderPlayhead(input: PlayheadRenderInput): boolean;
  renderLoading(input: LoadingRenderInput): void;
  destroy?(): void;
}
```

Update class declaration:

```ts
export class CanvasSpectrogramRenderer implements SpectrogramRenderer {
  readonly kind = 'canvas2d' as const;
```

- [ ] **Step 6: Run config tests**

Run: `npm test -- --run src/config.test.ts`

Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/config.ts src/renderer.ts src/config.test.ts
git commit -m "feat: add renderer mode config"
```

---

### Task 2: Renderer Factory And Viewer Integration

**Files:**
- Create: `src/renderer-factory.ts`
- Create: `src/renderer-factory.test.ts`
- Modify: `src/viewer.ts`
- Modify: `src/index.ts`
- Modify: `src/viewer.test.ts`

**Interfaces:**
- Consumes: `RendererMode`, `SpectrogramRenderer`, `CanvasSpectrogramRenderer`
- Produces: `createSpectrogramRenderer(canvas: HTMLCanvasElement, mode: RendererMode): SpectrogramRenderer`
- Produces: viewer renderer construction through the factory

- [ ] **Step 1: Write failing factory tests**

Create `src/renderer-factory.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { CanvasSpectrogramRenderer } from './renderer';
import { createSpectrogramRenderer } from './renderer-factory';

function canvas(context: unknown = null): HTMLCanvasElement {
  return { getContext: vi.fn(() => context) } as unknown as HTMLCanvasElement;
}

describe('createSpectrogramRenderer', () => {
  it('creates canvas renderer when requested', () => {
    expect(createSpectrogramRenderer(canvas(), 'canvas2d')).toBeInstanceOf(CanvasSpectrogramRenderer);
  });

  it('falls back to canvas renderer in auto mode when webgl2 is unavailable', () => {
    expect(createSpectrogramRenderer(canvas(null), 'auto')).toBeInstanceOf(CanvasSpectrogramRenderer);
  });

  it('throws when webgl2 is requested but unavailable', () => {
    expect(() => createSpectrogramRenderer(canvas(null), 'webgl2')).toThrow(/WebGL2/);
  });
});
```

- [ ] **Step 2: Run factory tests and verify failure**

Run: `npm test -- --run src/renderer-factory.test.ts`

Expected: FAIL because `renderer-factory.ts` does not exist.

- [ ] **Step 3: Implement factory with temporary Canvas fallback only**

Create `src/renderer-factory.ts`:

```ts
import { CanvasSpectrogramRenderer, type SpectrogramRenderer } from './renderer';
import type { RendererMode } from './types';

export function createSpectrogramRenderer(canvas: HTMLCanvasElement, mode: RendererMode): SpectrogramRenderer {
  if (mode === 'canvas2d') return new CanvasSpectrogramRenderer();
  const context = canvas.getContext('webgl2');
  if (!context) {
    if (mode === 'webgl2') throw new Error('WebGL2 renderer requested but WebGL2 is unavailable');
    return new CanvasSpectrogramRenderer();
  }
  return new CanvasSpectrogramRenderer();
}
```

This intentionally returns Canvas even when WebGL2 exists. Task 3 replaces that branch with `WebGL2SpectrogramRenderer`.

- [ ] **Step 4: Run factory tests**

Run: `npm test -- --run src/renderer-factory.test.ts`

Expected: PASS.

- [ ] **Step 5: Integrate factory into viewer**

Modify `src/viewer.ts` imports:

```ts
import { createSpectrogramRenderer } from './renderer-factory';
import type { SpectrogramRenderer } from './renderer';
```

Remove field initializer:

```ts
private readonly renderer = new CanvasSpectrogramRenderer();
```

Add constructor parameter/field:

```ts
private readonly renderer: SpectrogramRenderer;
```

Inside constructor body:

```ts
this.renderer = createSpectrogramRenderer(config.canvas, config.renderer);
```

Update `destroy()`:

```ts
this.renderer.destroy?.();
```

- [ ] **Step 6: Preserve renderer mode in viewer config updates**

In `setConfig`, ensure existing renderer mode is preserved unless `input.renderer` is provided:

```ts
renderer: input.renderer ?? this.config.renderer,
```

This field should be included in the object passed to `resolveConfig`.

- [ ] **Step 7: Export factory**

Modify `src/index.ts`:

```ts
export { createSpectrogramRenderer } from './renderer-factory';
export type { RendererKind, SpectrogramRenderer } from './renderer';
```

- [ ] **Step 8: Add viewer fallback test**

Add to `src/viewer.test.ts`:

```ts
it('creates with auto renderer when webgl2 is unavailable', async () => {
  const target = canvas();
  const viewer = await SpectrogramViewer.create({ canvas: target, source, renderer: 'auto' });

  expect(viewer.getConfig().renderer).toBe('auto');
});
```

- [ ] **Step 9: Run tests**

Run: `npm test -- --run src/renderer-factory.test.ts src/viewer.test.ts`

Expected: PASS.

- [ ] **Step 10: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/renderer-factory.ts src/renderer-factory.test.ts src/viewer.ts src/index.ts src/viewer.test.ts
git commit -m "feat: add renderer factory"
```

---

### Task 3: WebGL2 Renderer Skeleton And Selection

**Files:**
- Create: `src/webgl2-renderer.ts`
- Modify: `src/renderer-factory.ts`
- Modify: `src/index.ts`
- Modify: `src/renderer-factory.test.ts`

**Interfaces:**
- Consumes: `SpectrogramRenderer`, `RenderInput`, `PlayheadRenderInput`, `LoadingRenderInput`
- Produces: `WebGL2SpectrogramRenderer implements SpectrogramRenderer`
- Produces: `WebGL2SpectrogramRenderer.isSupported(canvas: HTMLCanvasElement): boolean`

- [ ] **Step 1: Add failing WebGL2 selection test**

Append to `src/renderer-factory.test.ts`:

```ts
it('creates webgl2 renderer when webgl2 is available', () => {
  const gl = { getExtension: vi.fn(), canvas: {} };
  const renderer = createSpectrogramRenderer(canvas(gl), 'webgl2');

  expect(renderer.kind).toBe('webgl2');
});
```

- [ ] **Step 2: Run factory tests and verify failure**

Run: `npm test -- --run src/renderer-factory.test.ts`

Expected: FAIL because factory still returns Canvas when WebGL2 exists.

- [ ] **Step 3: Create WebGL2 renderer skeleton**

Create `src/webgl2-renderer.ts`:

```ts
import { CanvasSpectrogramRenderer, type LoadingRenderInput, type PlayheadRenderInput, type RenderInput, type SpectrogramRenderer } from './renderer';

export class WebGL2SpectrogramRenderer implements SpectrogramRenderer {
  readonly kind = 'webgl2' as const;
  private readonly fallback = new CanvasSpectrogramRenderer();

  constructor(private readonly gl: WebGL2RenderingContext) {}

  static create(canvas: HTMLCanvasElement): WebGL2SpectrogramRenderer | undefined {
    const gl = canvas.getContext('webgl2');
    return gl ? new WebGL2SpectrogramRenderer(gl) : undefined;
  }

  invalidate(): void {
    this.fallback.invalidate();
  }

  render(input: RenderInput): void {
    this.fallback.render(input);
  }

  renderPlayhead(input: PlayheadRenderInput): boolean {
    return this.fallback.renderPlayhead(input);
  }

  renderLoading(input: LoadingRenderInput): void {
    this.fallback.renderLoading(input);
  }

  destroy(): void {
    this.fallback.invalidate();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
```

This skeleton selects WebGL2 but delegates drawing to Canvas. Task 4 replaces `render` internals with real GL drawing.

- [ ] **Step 4: Use WebGL2 renderer in factory**

Modify `src/renderer-factory.ts`:

```ts
import { WebGL2SpectrogramRenderer } from './webgl2-renderer';
```

Replace WebGL2 branch:

```ts
const renderer = WebGL2SpectrogramRenderer.create(canvas);
if (!renderer) {
  if (mode === 'webgl2') throw new Error('WebGL2 renderer requested but WebGL2 is unavailable');
  return new CanvasSpectrogramRenderer();
}
return renderer;
```

- [ ] **Step 5: Export WebGL2 renderer**

Modify `src/index.ts`:

```ts
export { WebGL2SpectrogramRenderer } from './webgl2-renderer';
```

- [ ] **Step 6: Run factory tests**

Run: `npm test -- --run src/renderer-factory.test.ts`

Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/webgl2-renderer.ts src/renderer-factory.ts src/index.ts src/renderer-factory.test.ts
git commit -m "feat: select webgl2 renderer"
```

---

### Task 4: WebGL2 Shader Pipeline

**Files:**
- Modify: `src/webgl2-renderer.ts`
- Add tests if practical: `src/webgl2-renderer.test.ts`

**Interfaces:**
- Consumes: `buildColorMap`, `valueDataForMode`, `RenderInput`
- Produces: real `WebGL2SpectrogramRenderer.render(input)` implementation for tile drawing

- [ ] **Step 1: Add WebGL2 helper types inside `src/webgl2-renderer.ts`**

Add internal types:

```ts
type ProgramInfo = {
  program: WebGLProgram;
  position: number;
  uniforms: Record<string, WebGLUniformLocation>;
};

type TextureEntry = {
  texture: WebGLTexture;
  width: number;
  height: number;
};
```

- [ ] **Step 2: Add shader source constants**

Add vertex shader:

```ts
const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;
```

Add fragment shader with these responsibilities:

- Convert `v_uv` to viewport time/frequency.
- Convert frequency to linear/log/mel scaled value.
- Map time/frequency into tile texture coordinates.
- Sample scalar tile texture with `texture(u_tile, tileUv).r`.
- Normalize with `u_valueMin`, `u_valueMax`, `u_gamma`, and `u_clamp`.
- Sample color map texture `u_colormap`.
- Output RGBA.

Use exact GLSL helpers:

```glsl
float hzToMel(float hz) { return 2595.0 * log(1.0 + hz / 700.0) / log(10.0); }
float melToHz(float mel) { return 700.0 * (pow(10.0, mel / 2595.0) - 1.0); }
float hzToScale(float hz, int scale) {
  if (scale == 1) return log(max(1.0, hz)) / log(10.0);
  if (scale == 2) return hzToMel(hz);
  return hz;
}
float scaleToHz(float value, int scale) {
  if (scale == 1) return pow(10.0, value);
  if (scale == 2) return melToHz(value);
  return value;
}
```

- [ ] **Step 3: Implement shader compilation helpers**

Add private methods:

```ts
private compileShader(type: number, source: string): WebGLShader
private createProgram(vertexSource: string, fragmentSource: string): ProgramInfo
```

Each method should throw an `Error` with the shader/program info log when compilation/linking fails.

- [ ] **Step 4: Initialize GL resources in constructor**

In `constructor`, create:

- shader program
- fullscreen quad buffer with `[-1,-1, 1,-1, -1,1, 1,1]`
- 1D color map texture, represented as `256 x 1` RGBA `UNSIGNED_BYTE`
- texture cache `Map<string, TextureEntry>`

- [ ] **Step 5: Implement texture upload**

Add:

```ts
private textureForTile(tile: SpectrogramMatrix, valueScale: Required<ValueScaleConfig>): TextureEntry
```

Use `valueDataForMode(tile, valueScale.mode)`.

Upload as `R32F` when available in WebGL2:

```ts
gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, tile.frameCount, tile.binCount, 0, gl.RED, gl.FLOAT, values);
```

Set:

```ts
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
```

If the data is a `Uint8Array`, convert to `Float32Array` before upload for this first implementation.

- [ ] **Step 6: Implement `render(input)` with GL path**

Implement:

- set canvas backing size from CSS size and DPR
- set viewport to device size
- clear background
- upload/update color map texture when `input.colorMap` changes
- draw placeholder rectangles first using a simple fallback solid color path or skip shader sampling with a placeholder uniform
- draw each tile rectangle by setting uniforms and issuing `gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)`
- store enough frame metadata for `renderPlayhead` to know whether a playhead-only render can happen

If any GL error occurs during development checks, emit by throwing `Error('WebGL2 renderer failed')`; viewer error handling will catch render failures.

- [ ] **Step 7: Implement `renderLoading(input)` pragmatically**

Keep `renderLoading(input)` delegated to the internal Canvas fallback:

```ts
this.fallback.renderLoading(input);
this.invalidate();
```

- [ ] **Step 8: Run full tests and build**

Run: `npm test -- --run`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 9: Manual smoke test**

Run: `npm run dev:example`

Open the minimap and React examples in a browser with WebGL2 support.

Expected:

- Spectrogram renders.
- Mel/log/linear scales visually update.
- Color map changes work.
- Canvas fallback still works when `renderer: "canvas2d"` is passed.

- [ ] **Step 10: Commit**

```bash
git add src/webgl2-renderer.ts
git commit -m "feat: render spectrogram with webgl2"
```

---

### Task 5: WebGL2 Playhead And Lifecycle Polish

**Files:**
- Modify: `src/webgl2-renderer.ts`
- Modify: `src/viewer.test.ts` or add focused tests if practical

**Interfaces:**
- Consumes: WebGL2 renderer render state from Task 4
- Produces: `renderPlayhead(input): boolean` that avoids texture rebuilds when the scene is valid

- [ ] **Step 1: Implement WebGL playhead overlay**

Add a simple line shader or reuse the existing program with a solid-color mode.

`renderPlayhead(input)` should:

- return `false` when there is no valid previous GL scene
- return `false` when canvas size or viewport changed
- redraw the previous spectrogram scene if necessary using existing textures
- draw a vertical line at `playheadTime`
- return `true`

- [ ] **Step 2: Ensure `invalidate()` clears GL scene state**

`invalidate()` should:

- clear stored frame metadata
- keep reusable shader/program resources
- not delete tile textures unless config/source change requires it

For the first version, deleting all textures on `invalidate()` is acceptable if simpler and correct.

- [ ] **Step 3: Ensure `destroy()` deletes GL resources**

Delete:

- tile textures
- color map texture
- buffers
- shader programs

Then call `WEBGL_lose_context` when available.

- [ ] **Step 4: Add lifecycle smoke test with mocked GL**

Add a test that constructs `WebGL2SpectrogramRenderer` with a mocked context enough to call `destroy()` and verify no throw.

If mocking complete WebGL is too brittle, test `destroy()` through a minimal object with `deleteTexture`, `deleteBuffer`, `deleteProgram`, and `getExtension` methods and cast as `WebGL2RenderingContext`.

- [ ] **Step 5: Run verification**

Run: `npm test -- --run`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/webgl2-renderer.ts src/viewer.test.ts
git commit -m "feat: add webgl2 playhead rendering"
```

---

### Task 6: Examples And Final Validation

**Files:**
- Modify: `examples/basic/performance.html`
- Modify: `examples/basic/controls.html` or `examples/basic/react.ts` if a visible renderer selector is useful
- Modify: docs only if public API needs a short note

**Interfaces:**
- Consumes: `renderer?: "auto" | "webgl2" | "canvas2d"`
- Produces: examples that demonstrate renderer selection and fallback

- [ ] **Step 1: Add renderer selection to performance example**

In `examples/basic/performance.html`, add a select control:

```html
<label>Renderer
  <select id="renderer">
    <option value="auto">auto</option>
    <option value="webgl2">webgl2</option>
    <option value="canvas2d">canvas2d</option>
  </select>
</label>
```

Read it in JS:

```js
const rendererMode = document.querySelector('#renderer');
```

Pass to viewer creation:

```js
renderer: rendererMode.value,
```

- [ ] **Step 2: Add renderer mode to profile output**

When a viewer is created, include:

```js
const config = viewer.getConfig();
profile.textContent = `Renderer mode: ${config.renderer}\nRendering with ${name}...`;
```

The exact active renderer kind is not exposed in this plan. Do not add public API just for that unless it becomes necessary.

- [ ] **Step 3: Manual fallback checks**

Run: `npm run dev:example`

Verify:

- `renderer: auto` renders in a WebGL2-capable browser.
- `renderer: canvas2d` renders with the existing path.
- `renderer: webgl2` renders or clearly errors if WebGL2 is disabled.

- [ ] **Step 4: Run final verification**

Run: `npm test -- --run`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/basic/performance.html
git commit -m "docs: demonstrate renderer selection"
```

---

## Self-Review

Spec coverage:

- Renderer config and default: Task 1.
- Renderer interface: Task 1.
- Factory and fallback behavior: Task 2 and Task 3.
- WebGL2 tile texture rendering: Task 4.
- Playhead rendering and lifecycle: Task 5.
- Loading and placeholder support: Task 4.
- Examples and validation: Task 6.
- Non-goals preserved: no WebGL1, no GPU STFT, no tile cache redesign, no public GPU memory accounting.

Placeholder scan:

- No TBD/TODO placeholders remain.
- The plan intentionally allows pragmatic `renderLoading` delegation and simple placeholder drawing, matching the design spec.

Type consistency:

- `RendererMode`, `SpectrogramRenderer`, `createSpectrogramRenderer`, and `WebGL2SpectrogramRenderer` names are consistent across tasks.
- Renderer mode string literals match the spec: `"auto"`, `"webgl2"`, `"canvas2d"`.
