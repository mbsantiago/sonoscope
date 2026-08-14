# WebGL2 Waveform Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a hardware-accelerated `WebGL2WaveformRenderer` for `@sonogram/core` with smooth antialiased GPU envelope & line rendering, playhead progress coloring, fallback to Canvas2D, and interactive demo toggle.

**Architecture:** A dedicated `WebGL2WaveformRenderer` implementing `WaveformRenderer` (`kind: "webgl2"`) that compiles optimized vertex/fragment GLSL 3.00 ES shaders, uploads peak buffers into GPU attribute buffers, supports both envelope mesh and line modes, and integrates cleanly into `WaveformViewer`.

**Tech Stack:** TypeScript, WebGL2 (GLSL ES 3.00), Vitest, HTML5 Canvas.

## Global Constraints
- Target packages: `packages/core`
- Follow established WebGL2 patterns and `WaveformRenderer` interface
- Full type safety, Biome linting, and 0 warnings
- Graceful Canvas2D fallback when WebGL2 context is unavailable (e.g. headless tests/browsers)

---

### Task 1: WebGL2 Waveform Shaders & Helper Functions

**Files:**
- Create: `packages/core/src/waveform/renderers/webgl2-shaders.ts`
- Test: `packages/core/src/waveform/renderers/webgl2-shaders.test.ts`

**Interfaces:**
- Produces:
  - `WEBGL2_WAVEFORM_VERTEX_SHADER: string`
  - `WEBGL2_WAVEFORM_FRAGMENT_SHADER: string`
  - `compileWaveformShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader`
  - `createWaveformProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram`

- [ ] **Step 1: Write failing shader compilation tests**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement GLSL shaders and program compilation helpers**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 2: Implement `WebGL2WaveformRenderer`

**Files:**
- Create: `packages/core/src/waveform/renderers/webgl2.ts`
- Modify: `packages/core/src/waveform/types.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/waveform/renderers/webgl2.test.ts`

**Interfaces:**
- Produces:
  - `WebGL2WaveformRenderer implements WaveformRenderer`
  - `kind: "webgl2"`
  - Methods: `render(input: WaveformRenderInput): void`, `destroy(): void`
  - Automatic Canvas2D fallback when WebGL2 is not supported

- [ ] **Step 1: Write failing tests for `WebGL2WaveformRenderer` (creation, render, destroy, fallback)**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `WebGL2WaveformRenderer` with GPU buffer uploads and drawing**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: Integrate `WebGL2WaveformRenderer` into `WaveformViewer` & Export

**Files:**
- Modify: `packages/core/src/waveform/viewer.ts`
- Modify: `packages/core/src/waveform/types.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/waveform/viewer.test.ts`

**Interfaces:**
- Consumes: `WebGL2WaveformRenderer`
- Produces:
  - `WaveformConfig.renderer?: WaveformRenderer | "canvas2d" | "webgl2"`
  - Automatic instantiation of `WebGL2WaveformRenderer` when string `"webgl2"` is provided

- [ ] **Step 1: Write failing test in `viewer.test.ts` for `{ renderer: "webgl2" }` option**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Update `WaveformViewer` factory resolution and export `WebGL2WaveformRenderer` from index**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 4: Update Dual Demo with Renderer Selector

**Files:**
- Modify: `examples/basic/waveform.html`

- [ ] **Step 1: Add Renderer dropdown selector (`Canvas 2D` vs `WebGL2 (GPU)`) in `waveform.html`**
- [ ] **Step 2: Verify live switching between Canvas2D and WebGL2 renderers**
- [ ] **Step 3: Run full verification suite (`check:biome`, `check:types`, `test`, `test:browser`, `build`)**
- [ ] **Step 4: Commit**
