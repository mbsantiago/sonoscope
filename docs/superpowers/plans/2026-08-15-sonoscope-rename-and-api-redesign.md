# Sonoscope Rename and API Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the package ecosystem from `sonogram` to `sonoscope` and restructure the core API around a unified `Sonoscope` audio & viewport coordinator that powers `SpectrogramViewer` and `WaveformViewer`.

**Architecture:** Introduce `Sonoscope` as the single source of truth for audio source management, time viewport state, navigation, and playback clock synchronization. `SpectrogramViewer` and `WaveformViewer` subscribe to the `Sonoscope` instance to render their respective domains (frequency & amplitude) in lock-step synchronization while maintaining fine-grained control over rendering configurations.

**Tech Stack:** TypeScript, WebGL2, WebAudio, Canvas 2D, Web Workers, WASM (Rust/C++), React 19, Vite, Vitest, Biome.

## Global Constraints
- Preserve all existing capabilities: WebGL2 and Canvas2D rendering, streaming audio, WASM/Worker STFT compute, peak decimation, colormaps, frequency scaling (mel/log/linear).
- Maintain backward compatibility where reasonable by providing static factory methods on `SpectrogramViewer` and `WaveformViewer` that delegate to `Sonoscope`.
- Ensure all tests (508+ tests), type checking (`tsc --noEmit`), and linter (`biome check`) pass cleanly.

---

### Task 1: Package and Repository Renaming (`sonogram` -> `sonoscope`)

**Files:**
- Modify: `package.json`
- Modify: `packages/core/package.json`
- Modify: `packages/react/package.json`
- Modify: `tsconfig.json`
- Modify: `vite.config.ts`
- Modify: `vite.browser.config.ts`
- Modify: `packages/react/src/Spectrogram.tsx`
- Modify: `packages/react/src/useSpectrogram.ts`
- Modify: `packages/react/src/react.test.ts`
- Modify: `examples/basic/react.tsx`

**Interfaces:**
- Renames `@sonogram/core` -> `@sonoscope/core`
- Renames `@sonogram/react` -> `@sonoscope/react`
- Renames root package `sonogram-monorepo` -> `sonoscope-monorepo`

- [x] **Step 1: Update package names in package.json files**
  - In `package.json`: change `"name": "sonoscope-monorepo"` and update build script to `@sonoscope/core` and `@sonoscope/react`.
  - In `packages/core/package.json`: change `"name": "@sonoscope/core"`.
  - In `packages/react/package.json`: change `"name": "@sonoscope/react"` and `"@sonoscope/core": "workspace:*"`.

- [x] **Step 2: Update path aliases and Vite configs**
  - In `tsconfig.json`: change paths to `"@sonoscope/core"` and `"@sonoscope/react"`.
  - In `vite.config.ts` and `vite.browser.config.ts`: change resolve aliases to `@sonoscope/core` and `@sonoscope/react`.

- [x] **Step 3: Update imports in `@sonoscope/react` and test files**
  - Update imports from `@sonogram/core` to `@sonoscope/core` in `packages/react/src/Spectrogram.tsx`, `packages/react/src/useSpectrogram.ts`, `packages/react/src/react.test.ts`, and `examples/basic/react.tsx`.

- [x] **Step 4: Verify test suite runs**
  - Run: `npm test`
  - Expected: PASS with 508 passing tests.

---

### Task 2: Implement `Sonoscope` Core Coordinator

**Files:**
- Create: `packages/core/src/sonoscope.ts`
- Create: `packages/core/src/sonoscope.test.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
```typescript
export interface SonoscopeOptions {
  source: AudioSource;
  audio?: HTMLAudioElement;
  startTime?: number;
  endTime?: number;
  minDuration?: number;
  maxDuration?: number;
  followPlayback?: FollowPlaybackMode;
  smoothAnchor?: number;
}

export interface SonoscopeEvents {
  viewportchange: { viewport: ViewportState; source?: string };
  playbackchange: { mode: FollowPlaybackMode };
  timeupdate: { currentTime: number };
  sourcechange: { source: AudioSource };
  destroy: void;
}

export class Sonoscope {
  constructor(options: SonoscopeOptions | AudioSource);
  static fromUrl(url: string, options?: Omit<SonoscopeOptions, "source">): Promise<Sonoscope>;
  static fromAudio(audio: HTMLAudioElement, options?: Omit<SonoscopeOptions, "source" | "audio">): Promise<Sonoscope>;
  static fromSource(source: AudioSource, options?: Omit<SonoscopeOptions, "source">): Sonoscope;
  static fromAudioBuffer(buffer: AudioBuffer, options?: Omit<SonoscopeOptions, "source">): Sonoscope;

  readonly source: AudioSource;
  readonly viewportController: ViewportController;

  getViewport(): ViewportState;
  setViewport(vp: Partial<{ startTime: number; endTime: number }>, source?: string): void;
  updateViewport(vp: Partial<{ startTime: number; endTime: number }>, source?: string): void;
  zoom(factor: number, centerTime?: number, source?: string): void;
  pan(deltaSeconds: number, source?: string): void;
  panTo(startTime: number, source?: string): void;
  getDuration(): number;
  getSampleRate(): number;
  getFollowPlayback(): FollowPlaybackMode;
  setFollowPlayback(mode: FollowPlaybackMode): void;

  getAudio(): HTMLAudioElement | undefined;
  attachAudio(audio: HTMLAudioElement): void;
  detachAudio(): void;
  getCurrentTime(): number;
  seek(time: number): void;

  createSpectrogram(canvas: HTMLCanvasElement, options?: Omit<SpectrogramConfig, "source" | "canvas" | "audio">): SpectrogramViewer;
  createWaveform(canvas: HTMLCanvasElement, options?: Omit<WaveformConfig, "source" | "canvas" | "audio">): WaveformViewer;

  on<K extends keyof SonoscopeEvents>(event: K, handler: (e: SonoscopeEvents[K]) => void): () => void;
  destroy(): void;
}
```

- [x] **Step 1: Write unit tests for `Sonoscope` in `packages/core/src/sonoscope.test.ts`**
  - Test instantiation with `AudioSource`, `SonoscopeOptions`.
  - Test static async factory `Sonoscope.fromUrl` and `Sonoscope.fromAudio`.
  - Test viewport manipulation (`setViewport`, `zoom`, `pan`, `panTo`) and event dispatching.
  - Test audio attachment and playback synchronization.
  - Test viewer creation helpers (`createSpectrogram`, `createWaveform`).
  - Test `destroy()` cleanup.

- [x] **Step 2: Run test to verify it fails**
  - Run: `npx vitest run packages/core/src/sonoscope.test.ts`
  - Expected: FAIL ("Sonoscope is not defined").

- [x] **Step 3: Implement `Sonoscope` class in `packages/core/src/sonoscope.ts`**
  - Wrap `ViewportController` to manage time bounds and playback synchronization.
  - Expose clean viewport, playback, and source management APIs.
  - Export types and class in `packages/core/src/index.ts`.

- [x] **Step 4: Run test to verify it passes**
  - Run: `npx vitest run packages/core/src/sonoscope.test.ts`
  - Expected: PASS.

---

### Task 3: Refactor `SpectrogramViewer` to Integrate with `Sonoscope`

**Files:**
- Modify: `packages/core/src/viewer.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/viewer.test.ts`
- Modify: `packages/core/src/navigation.ts`

**Interfaces:**
```typescript
export interface SpectrogramViewerOptions extends Omit<SpectrogramConfig, "source" | "audio"> {
  scope?: Sonoscope;
  source?: AudioSource;
  audio?: HTMLAudioElement;
}

// Constructor supports:
// new SpectrogramViewer(scope, canvas, options?)
// new SpectrogramViewer(scope, optionsWithCanvas)
// new SpectrogramViewer(optionsWithScopeOrSource)
```

- [x] **Step 1: Update `SpectrogramViewer` constructor & config resolving**
  - Allow `SpectrogramViewer` to accept `Sonoscope` directly. If a standalone `source` is provided, wrap in an internal `Sonoscope`.
  - Bind `SpectrogramViewer` viewport time synchronization directly to `scope.viewportController`.
  - Update `updateViewport` to route horizontal time changes through `scope.setViewport` while keeping vertical frequency changes local.
  - Maintain `SpectrogramViewer.create`, `fromUrl`, `fromAudio`, `fromSource` for backward compatibility.

- [x] **Step 2: Update `packages/core/src/viewer.test.ts`**
  - Add tests for `new SpectrogramViewer(scope, canvas)` and `new SpectrogramViewer({ scope, canvas })`.
  - Verify time changes triggered via `scope.pan()` or `scope.zoom()` cause `SpectrogramViewer` to re-render.
  - Verify canvas drag/wheel updates `scope`.

- [x] **Step 3: Run viewer tests**
  - Run: `npx vitest run packages/core/src/viewer.test.ts`
  - Expected: PASS.

---

### Task 4: Refactor `WaveformViewer` to Integrate with `Sonoscope`

**Files:**
- Modify: `packages/core/src/waveform/viewer.ts`
- Modify: `packages/core/src/waveform/types.ts`
- Modify: `packages/core/src/waveform/viewer.test.ts`

**Interfaces:**
```typescript
export interface WaveformViewerOptions extends Omit<WaveformConfig, "source" | "audio"> {
  scope?: Sonoscope;
  source?: AudioSource;
  audio?: HTMLAudioElement;
}

// Constructor supports:
// new WaveformViewer(scope, canvas, options?)
// new WaveformViewer(scope, optionsWithCanvas)
// new WaveformViewer(optionsWithScopeOrSource)
```

- [x] **Step 1: Update `WaveformViewer` constructor & config resolving**
  - Support passing `Sonoscope` as the first argument or in options.
  - Bind waveform viewport and playback updates directly to `scope`.
  - Support canvas navigation delegation to `scope`.

- [x] **Step 2: Update `packages/core/src/waveform/viewer.test.ts`**
  - Add tests for `new WaveformViewer(scope, canvas)` and `scope.createWaveform(canvas)`.
  - Verify synchronized rendering when `scope.setViewport()` or audio playback progresses.

- [x] **Step 3: Run waveform viewer tests**
  - Run: `npx vitest run packages/core/src/waveform/viewer.test.ts`
  - Expected: PASS.

---

### Task 5: Verify Shared Multi-Viewer Synchronization

**Files:**
- Create: `packages/core/src/sonoscope-sync.test.ts`

**Interfaces:**
- Verifies a single `Sonoscope` instance connected to both a `SpectrogramViewer` and a `WaveformViewer`:
  - When `scope.zoom()` or `scope.pan()` is called, both viewers re-render to the matching time bounds.
  - When user scrolls on the Waveform canvas, Spectrogram updates simultaneously.
  - When user scrolls on the Spectrogram canvas horizontally, Waveform updates simultaneously.

- [x] **Step 1: Write integration tests in `sonoscope-sync.test.ts`**
  - Instantiate `Sonoscope`, create `SpectrogramViewer` and `WaveformViewer`.
  - Assert both viewers stay in lock-step across viewport zooms, pans, seeking, and playback sync.

- [x] **Step 2: Run test to verify it passes**
  - Run: `npx vitest run packages/core/src/sonoscope-sync.test.ts`
  - Expected: PASS.

---

### Task 6: Update React Package (`@sonoscope/react`)

**Files:**
- Create: `packages/react/src/useSonoscope.ts`
- Create: `packages/react/src/SonoscopeContext.tsx`
- Create: `packages/react/src/Waveform.tsx`
- Modify: `packages/react/src/Spectrogram.tsx`
- Modify: `packages/react/src/useSpectrogram.ts`
- Modify: `packages/react/src/index.ts`
- Modify: `packages/react/src/react.test.ts`

**Interfaces:**
```tsx
// useSonoscope hook
export function useSonoscope(options: {
  url?: string;
  source?: AudioSource;
  audio?: HTMLAudioElement;
  startTime?: number;
  endTime?: number;
  followPlayback?: FollowPlaybackMode;
}): { scope: Sonoscope | null; loading: boolean; error: Error | null };

// Context Provider
export const SonoscopeProvider: React.FC<{ value: Sonoscope | null; children: React.ReactNode }>;
export function useSonoscopeContext(): Sonoscope | null;

// Components
export const Waveform: React.FC<WaveformComponentProps>;
export const Spectrogram: React.FC<SpectrogramComponentProps>;
```

- [x] **Step 1: Implement `useSonoscope` hook & `SonoscopeContext`**
  - Handles async loading of `Sonoscope.fromUrl` or `fromAudio` / `fromSource`.
  - Provides React context provider for seamless multi-viewer synchronization.

- [x] **Step 2: Update `<Spectrogram />` and `<Waveform />` components**
  - Consume `Sonoscope` from context or direct prop.
  - Mount respective viewers on canvas refs and handle resize / property updates.

- [x] **Step 3: Update `packages/react/src/react.test.ts`**
  - Add tests for `useSonoscope`, `SonoscopeProvider`, `Waveform`, and `Spectrogram`.

- [x] **Step 4: Run React tests**
  - Run: `npx vitest run packages/react/src/react.test.ts`
  - Expected: PASS.

---

### Task 7: Update Examples, Build, and Documentation

**Files:**
- Modify: `README.md`
- Modify: `packages/core/README.md`
- Modify: `packages/react/README.md`
- Modify: `examples/basic/*.html`
- Modify: `examples/basic/react.tsx`

- [x] **Step 1: Update HTML & TSX examples in `examples/basic/`**
  - Update imports and usage in `examples/basic/waveform.html`, `minimap.html`, `controls.html`, `react.tsx`, etc., to use `Sonoscope` and `@sonoscope/*`.

- [x] **Step 2: Update documentation and README files**
  - Update quickstart code snippets in `README.md`, `packages/core/README.md`, and `packages/react/README.md` to showcase the new `Sonoscope` API pattern.

- [x] **Step 3: Run Full Validation Suite**
  - Run: `npm test` (all tests passing)
  - Run: `npm run check:types` (zero type errors)
  - Run: `npm run check:biome` (zero lint/format errors)
  - Run: `npm run build` (builds WASM, `@sonoscope/core`, and `@sonoscope/react`)

---
