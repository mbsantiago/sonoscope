# Remove Source & Canvas from Config & Add Sonoscope Attach Methods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `source` and `canvas` from `SpectrogramConfig`, `ResolvedSpectrogramConfig`, `WaveformConfig`, and `ResolvedWaveformConfig` so configs strictly represent visualizer settings; and add `attachSpectrogram` / `attachWaveform` methods to `Sonoscope`.

**Architecture:** Visualizer configuration (`SpectrogramConfig` / `WaveformConfig`) should only describe display and algorithm parameters (colormap, FFT size, value scales, amplitudes, renderers). The render target (`canvas`) is held directly by the viewer (`viewer.getCanvas()`), and the audio data source is provided by the coordinator (`scope.source`). `Sonoscope` gains `attachSpectrogram(canvas, options?)` and `attachWaveform(canvas, options?)` factory methods.

**Tech Stack:** TypeScript, `@sonoscope/core`, `@sonoscope/react`, Vitest.

## Global Constraints

- Never include `canvas` or `source` inside `SpectrogramConfig` or `WaveformConfig`.
- Keep single-form constructor `new SpectrogramViewer(scope, canvas, options?)` and `new WaveformViewer(scope, canvas, options?)`.
- Expose `getCanvas(): HTMLCanvasElement` and `getScope(): ISonoscope` on both viewers.
- Provide `attachSpectrogram(canvas, options?)` and `attachWaveform(canvas, options?)` on `Sonoscope` and `ISonoscope`.
- Keep `createSpectrogram` and `createWaveform` as convenience aliases.

---

### Task 1: Update Types for SpectrogramConfig, WaveformConfig, and ISonoscope

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/waveform/types.ts`
- Modify: `packages/core/src/config.ts`

**Interfaces:**
- Consumes: `AudioSource`, `ISonoscope`, `SpectrogramConfig`, `WaveformConfig`
- Produces:
  - `SpectrogramConfig`: purely visualizer options without `canvas` or `source`
  - `ResolvedSpectrogramConfig`: without `canvas` or `source`
  - `SpectrogramOptions = SpectrogramConfig`
  - `WaveformConfig`: purely visualizer options without `canvas` or `source`
  - `ResolvedWaveformConfig`: without `canvas` or `source`
  - `WaveformOptions = WaveformConfig`
  - `ISonoscope.attachSpectrogram(canvas: HTMLCanvasElement, options?: SpectrogramOptions): ISpectrogramViewer`
  - `ISonoscope.attachWaveform(canvas: HTMLCanvasElement, options?: WaveformOptions): IWaveformViewer`
  - `ISpectrogramViewer.getCanvas(): HTMLCanvasElement`
  - `IWaveformViewer.getCanvas(): HTMLCanvasElement`
  - `resolveConfig(source: AudioSource, input?: SpectrogramOptions): ResolvedSpectrogramConfig`

- [ ] **Step 1: Update `packages/core/src/types.ts`**
  - Remove `canvas` and `source` from `SpectrogramConfig` and `ResolvedSpectrogramConfig`.
  - Set `export type SpectrogramOptions = SpectrogramConfig;`.
  - Add `attachSpectrogram` and `attachWaveform` to `ISonoscope`.
  - Add `getCanvas(): HTMLCanvasElement` to `ISpectrogramViewer`.

- [ ] **Step 2: Update `packages/core/src/waveform/types.ts`**
  - Remove `canvas` and `source` from `WaveformConfig` and `ResolvedWaveformConfig`.
  - Set `export type WaveformOptions = WaveformConfig;`.
  - Add `getCanvas(): HTMLCanvasElement` to `IWaveformViewer`.

- [ ] **Step 3: Update `packages/core/src/config.ts`**
  - Update `resolveConfig(source: AudioSource, input: SpectrogramOptions = {}): ResolvedSpectrogramConfig`.
  - Remove checks for `input.canvas` and `input.source`.
  - Update `packages/core/src/config.test.ts`.

- [ ] **Step 4: Run unit tests**
  - Run `npx vitest run packages/core/src/config.test.ts`
  - Expected: PASS

---

### Task 2: Update SpectrogramViewer and WaveformViewer

**Files:**
- Modify: `packages/core/src/viewer.ts`
- Modify: `packages/core/src/waveform/viewer.ts`
- Modify: `packages/core/src/sonoscope.ts`

**Interfaces:**
- Consumes: Updated `resolveConfig`, `resolveWaveformConfig`, `SpectrogramOptions`, `WaveformOptions`
- Produces:
  - `SpectrogramViewer` storing `private readonly canvas: HTMLCanvasElement` and `getCanvas(): HTMLCanvasElement`
  - `WaveformViewer` storing `private readonly canvas: HTMLCanvasElement` and `getCanvas(): HTMLCanvasElement`
  - `Sonoscope.attachSpectrogram` and `Sonoscope.attachWaveform`

- [ ] **Step 1: Update `packages/core/src/viewer.ts`**
  - Constructor: `constructor(private readonly scope: ISonoscope, private readonly canvas: HTMLCanvasElement, options?: SpectrogramOptions)`
  - Call `this.config = resolveConfig(this.scope.source, options);`
  - Add `getCanvas(): HTMLCanvasElement { return this.canvas; }`
  - In `render()` and `paintPartial()`, pass `canvas: this.canvas` directly to `this.renderer.render(...)`.
  - In `tileDuration`, access `this.scope.source.sampleRate`.

- [ ] **Step 2: Update `packages/core/src/waveform/viewer.ts`**
  - Constructor: `constructor(private readonly scope: ISonoscope, private readonly canvas: HTMLCanvasElement, options?: WaveformOptions)`
  - Update `resolveWaveformConfig(source: AudioSource, input: WaveformOptions = {}): ResolvedWaveformConfig`
  - Add `getCanvas(): HTMLCanvasElement { return this.canvas; }`
  - In `render()`, pass `canvas: this.canvas`.

- [ ] **Step 3: Update `packages/core/src/sonoscope.ts`**
  - Add `attachSpectrogram(canvas: HTMLCanvasElement, options?: SpectrogramOptions): SpectrogramViewer`
  - Add `attachWaveform(canvas: HTMLCanvasElement, options?: WaveformOptions): WaveformViewer`
  - Keep `createSpectrogram` and `createWaveform` as aliases.

- [ ] **Step 4: Run viewer tests**
  - Run `npx vitest run packages/core/src/sonoscope.test.ts packages/core/src/viewer.test.ts packages/core/src/waveform/viewer.test.ts`
  - Expected: PASS

---

### Task 3: Update React Components, Examples, and Full Verification

**Files:**
- Modify: `packages/react/src/Spectrogram.tsx`
- Modify: `packages/react/src/Waveform.tsx`
- Modify: `examples/basic/*.html`
- Modify: `examples/basic/react.tsx`

- [ ] **Step 1: Update React components in `@sonoscope/react`**
  - Update `SpectrogramProps` and `WaveformProps` to omit `source` and `canvas` cleanly.

- [ ] **Step 2: Update example files**
  - Showcase `scope.attachSpectrogram(canvas, ...)` and `scope.attachWaveform(canvas, ...)`.

- [ ] **Step 3: Run full verification suite**
  - `npm run check:types`
  - `npm run check:biome`
  - `npm test`
  - `npm run test:browser`
  - `npm run build`

- [ ] **Step 4: Commit changes**
  - Commit all changes with descriptive commit message.
