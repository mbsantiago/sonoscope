# Decoupled HTML Playhead Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the playback playhead out of the Canvas2D and WebGL2 renderers into a hardware-accelerated HTML DOM overlay styled with CSS `transform: translate3d(x, 0, 0)`, eliminating 60fps canvas re-renders during playback.

**Architecture:** A standalone, lightweight `PlayheadOverlay` controller in `@sonoscope/core` and integrated `<div className="sonoscope-playhead" />` DOM overlays in `@sonoscope/react` and `@sonoscope/anywidget` will listen to audio playback events and update the playhead's CSS transform on the GPU compositor thread. `SpectrogramViewer` and `WaveformViewer` will decouple their render loops from `timeupdate`, rendering canvases purely on viewport changes (pan, zoom, page flip).

**Tech Stack:** TypeScript, Vanilla DOM / CSS Transforms, React, WebGL2, Vitest, Biome.

## Global Constraints

- Preserve all existing public query APIs (`canvasToTimeFrequency`, `timeFrequencyToCanvas`, `querySpectrum`, etc.).
- Maintain zero layout reflow and zero canvas rasterization during playback when viewport is stationary.
- Support high-DPR sub-pixel precision for playhead positioning.
- Ensure all tests pass (`npm test`) and types validate (`npm run check:types`).

---

### Task 1: Create `PlayheadOverlay` DOM Controller in `@sonoscope/core`

**Files:**
- Create: `packages/core/src/playhead.ts`
- Create: `packages/core/src/playhead.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PlayheadOverlayOptions {
    className?: string;
    style?: Partial<CSSStyleDeclaration>;
    color?: string;
    width?: number;
    zIndex?: number;
    snapToPixels?: boolean;
    onSeek?: (time: number) => void;
  }

  export interface IPlayheadOverlay {
    getElement(): HTMLDivElement;
    update(): void;
    destroy(): void;
  }

  export function attachPlayheadOverlay(
    container: HTMLElement,
    scope: ISonoscope,
    options?: PlayheadOverlayOptions,
  ): IPlayheadOverlay;
  ```

- [ ] **Step 1: Write the failing test for `PlayheadOverlay`**

Create `packages/core/src/playhead.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Sonoscope } from "./sonoscope";
import { attachPlayheadOverlay } from "./playhead";
import type { AudioSource } from "./types";

describe("PlayheadOverlay", () => {
  let container: HTMLDivElement;
  let source: AudioSource;

  beforeEach(() => {
    container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 1000, configurable: true });
    Object.defineProperty(container, "getBoundingClientRect", {
      value: () => ({ width: 1000, height: 200, left: 0, top: 0 }),
      configurable: true,
    });
    source = {
      id: "test-playhead-audio",
      sampleRate: 44100,
      duration: 10,
      channelCount: 1,
      read: () => new Float32Array(1024),
    };
  });

  it("creates a playhead div with hardware-accelerated transform inside container", () => {
    const scope = new Sonoscope({ source, startTime: 0, endTime: 10 });
    const overlay = attachPlayheadOverlay(container, scope);

    const el = overlay.getElement();
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(container.contains(el)).toBe(true);
    expect(el.style.position).toBe("absolute");
    expect(el.style.pointerEvents).toBe("none");

    overlay.destroy();
    expect(container.contains(el)).toBe(false);
  });

  it("updates transform correctly on timeupdate and viewportchange", () => {
    const audio = {
      currentTime: 2.5,
      paused: false,
      ended: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    const scope = new Sonoscope({ source, audio, startTime: 0, endTime: 10 });
    const overlay = attachPlayheadOverlay(container, scope);
    const el = overlay.getElement();

    // At t = 2.5s within [0s, 10s] on a 1000px container, position = 250px
    scope.seek(2.5);
    expect(el.style.transform).toBe("translate3d(250px, 0px, 0px)");
    expect(el.style.display).not.toBe("none");

    // Outside viewport [0, 5], playhead at t=8s should be hidden
    scope.setViewport({ startTime: 0, endTime: 5 });
    scope.seek(8.0);
    expect(el.style.display).toBe("none");

    overlay.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/playhead.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `packages/core/src/playhead.ts` and export from `packages/core/src/index.ts`**

Create `packages/core/src/playhead.ts`:
```ts
import type { ISonoscope } from "./types";

export interface PlayheadOverlayOptions {
  className?: string | undefined;
  style?: Partial<CSSStyleDeclaration> | undefined;
  color?: string | undefined;
  width?: number | undefined;
  zIndex?: number | undefined;
  snapToPixels?: boolean | undefined;
}

export interface IPlayheadOverlay {
  getElement(): HTMLDivElement;
  update(): void;
  destroy(): void;
}

export class PlayheadOverlay implements IPlayheadOverlay {
  private readonly element: HTMLDivElement;
  private readonly container: HTMLElement;
  private readonly scope: ISonoscope;
  private readonly options: PlayheadOverlayOptions;
  private readonly cleanups: Array<() => void> = [];
  private rafId: number | undefined;

  constructor(
    container: HTMLElement,
    scope: ISonoscope,
    options: PlayheadOverlayOptions = {},
  ) {
    this.container = container;
    this.scope = scope;
    this.options = options;

    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }

    this.element = document.createElement("div");
    this.element.className = options.className || "sonoscope-playhead";
    Object.assign(this.element.style, {
      position: "absolute",
      top: "0",
      bottom: "0",
      left: "0",
      width: `${options.width ?? 1.5}px`,
      backgroundColor: options.color ?? "rgba(255, 255, 255, 0.95)",
      boxShadow: "0 0 2px rgba(0, 0, 0, 0.6)",
      pointerEvents: "none",
      zIndex: String(options.zIndex ?? 10),
      willChange: "transform",
      transformOrigin: "left center",
      ...options.style,
    });

    container.appendChild(this.element);

    const onTime = () => this.scheduleUpdate();
    const onViewport = () => this.scheduleUpdate();

    const unsubTime = this.scope.on("timeupdate", onTime);
    const unsubVp = this.scope.on("viewportchange", onViewport);
    this.cleanups.push(unsubTime, unsubVp);

    this.update();
  }

  getElement(): HTMLDivElement {
    return this.element;
  }

  private scheduleUpdate(): void {
    if (this.rafId !== undefined) return;
    if (typeof requestAnimationFrame !== "undefined") {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = undefined;
        this.update();
      });
    } else {
      this.update();
    }
  }

  update(): void {
    const vp = this.scope.getViewport();
    const currentTime = this.scope.getCurrentTime();
    const duration = vp.endTime - vp.startTime;

    if (
      duration <= 0 ||
      currentTime < vp.startTime ||
      currentTime > vp.endTime
    ) {
      this.element.style.display = "none";
      return;
    }

    const rect = this.container.getBoundingClientRect();
    const containerWidth = rect.width || this.container.clientWidth || 1;
    const ratio = (currentTime - vp.startTime) / duration;
    let x = ratio * containerWidth;

    if (this.options.snapToPixels) {
      x = Math.round(x);
    }

    this.element.style.display = "";
    this.element.style.transform = `translate3d(${x}px, 0px, 0px)`;
  }

  destroy(): void {
    if (this.rafId !== undefined && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}

export function attachPlayheadOverlay(
  container: HTMLElement,
  scope: ISonoscope,
  options?: PlayheadOverlayOptions,
): IPlayheadOverlay {
  return new PlayheadOverlay(container, scope, options);
}
```

Export `PlayheadOverlay`, `attachPlayheadOverlay`, and types from `packages/core/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/src/playhead.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/playhead.ts packages/core/src/playhead.test.ts packages/core/src/index.ts
git commit -m "feat(core): add hardware-accelerated PlayheadOverlay controller"
```

---

### Task 2: Decouple Spectrogram Renderers & Shaders from Playhead Canvas Drawing

**Files:**
- Modify: `packages/core/src/viewers/spectrogram/renderers/canvas.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/webgl2.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/webgl2-normal-program.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/webgl2-terrain-program.ts`
- Modify: `packages/core/src/viewers/spectrogram/viewer.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/canvas.test.ts`
- Modify: `packages/core/src/viewers/spectrogram/renderers/webgl2.browser.test.ts`
- Modify: `packages/core/src/viewers/spectrogram/audio-tracker-sync.test.ts`

**Interfaces:**
- Clean `SpectrogramRenderer` interface:
  ```ts
  export interface SpectrogramRenderer {
    readonly kind: RendererKind;
    invalidate(): void;
    render(input: RenderInput): void;
    destroy?(): void;
  }
  ```
- Remove `renderPlaybackPlayhead()` and `timeupdate` canvas redraw triggers from `SpectrogramViewer`.

- [ ] **Step 1: Update `packages/core/src/viewers/spectrogram/renderers/canvas.ts`**

Remove `baseFrame`, `drawPlayhead`, and `renderPlayhead` method from `CanvasSpectrogramRenderer`. `render()` will purely paint tiles and placeholders.

- [ ] **Step 2: Update `packages/core/src/viewers/spectrogram/renderers/webgl2.ts` & programs**

1. In `webgl2.ts`: remove `renderPlayhead()` and `frameState.input` cloning.
2. In `webgl2-normal-program.ts`: remove `drawPlayhead()` and `u_overlayMode == 2` branches.
3. In `webgl2-terrain-program.ts`: remove `u_terrainPlayhead` uniform and `drawPlayhead()`.

- [ ] **Step 3: Update `packages/core/src/viewers/spectrogram/viewer.ts`**

Remove `timeupdate` canvas re-render listener in `bindScope()` and remove `renderPlaybackPlayhead()`. Viewport changes and tile availability will remain the only triggers for canvas rendering.

- [ ] **Step 4: Update Unit & Browser Tests**

1. Update `canvas.test.ts`: replace `renderPlayhead` tests with pure tile rendering checks.
2. Update `webgl2.browser.test.ts`: update terrain program test to verify contour rendering without internal playhead line.
3. Update `audio-tracker-sync.test.ts`: verify playhead alignment with `Sonoscope` / `timeFrequencyToCanvas` coordinates.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/viewers/spectrogram/
git commit -m "refactor(core): decouple spectrogram renderers and shaders from playhead canvas drawing"
```

---

### Task 3: Decouple Waveform Viewer from Playback Re-rendering

**Files:**
- Modify: `packages/core/src/viewers/waveform/viewer.ts`
- Modify: `packages/core/src/viewers/waveform/renderers/canvas.ts`
- Modify: `packages/core/src/viewers/waveform/renderers/webgl2.ts`
- Modify: `packages/core/src/viewers/waveform/renderers/canvas.test.ts`

**Interfaces:**
- `WaveformViewer`: Removes `timeupdate` listener that triggered peak pyramid re-queries and canvas redraws at 60Hz. Canvas renders purely on viewport / source changes.

- [ ] **Step 1: Update `packages/core/src/viewers/waveform/viewer.ts`**

In `WaveformViewer.bindScope()`, remove:
```ts
const unlistenTime = this.scope.on("timeupdate", () => {
  this.requestRender();
});
```

- [ ] **Step 2: Clean up Waveform Renderers & Tests**

Remove internal playhead line drawing from `CanvasWaveformRenderer` and `WebGL2WaveformRenderer`, keeping waveform envelope rendering fast and pure. Update `canvas.test.ts`.

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/viewers/waveform/
git commit -m "perf(waveform): remove 60Hz peak query and canvas redraw on playback timeupdate"
```

---

### Task 4: Integrate Hardware-Accelerated DOM Playhead into `@sonoscope/react`

**Files:**
- Modify: `packages/react/src/Spectrogram.tsx`
- Modify: `packages/react/src/Waveform.tsx`
- Modify: `packages/react/src/useSpectrogram.ts`
- Modify: `packages/react/src/react.test.ts`

**Interfaces:**
- Props on `<Spectrogram />` and `<Waveform />`:
  ```ts
  export type SpectrogramProps = UseSpectrogramOptions & {
    showPlayhead?: boolean;
    playheadClassName?: string;
    playheadStyle?: CSSProperties;
    // ...
  };
  ```
- Direct DOM ref updates: Container renders `<div ref={playheadRef} className="sonoscope-playhead" />` positioned with `translate3d` via RAF / event listener without triggering React component re-renders.

- [ ] **Step 1: Write failing test in `packages/react/src/react.test.ts`**

Add tests checking that `<Spectrogram showPlayhead={true} />` renders the `.sonoscope-playhead` DOM overlay and moves it on `scope.seek()`.

- [ ] **Step 2: Run react test to verify failure**

Run: `npx vitest run packages/react/src/react.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement DOM playhead in `Spectrogram.tsx` and `Waveform.tsx`**

In `Spectrogram.tsx`:
```tsx
const playheadRef = useRef<HTMLDivElement | null>(null);

useEffect(() => {
  const el = playheadRef.current;
  if (!el || !effectiveScope || showPlayhead === false) return;

  const update = () => {
    const vp = effectiveScope.getViewport();
    const t = effectiveScope.getCurrentTime();
    const dur = vp.endTime - vp.startTime;
    if (dur <= 0 || t < vp.startTime || t > vp.endTime) {
      el.style.display = "none";
      return;
    }
    const container = el.parentElement;
    const width = container?.clientWidth || 1;
    const x = ((t - vp.startTime) / dur) * width;
    el.style.display = "";
    el.style.transform = `translate3d(${x}px, 0px, 0px)`;
  };

  const unsubTime = effectiveScope.on("timeupdate", update);
  const unsubVp = effectiveScope.on("viewportchange", update);
  update();

  return () => {
    unsubTime();
    unsubVp();
  };
}, [effectiveScope, showPlayhead]);
```

- [ ] **Step 4: Run react test to verify it passes**

Run: `npx vitest run packages/react/src/react.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react/
git commit -m "feat(react): add GPU-accelerated DOM playhead overlay to Spectrogram and Waveform"
```

---

### Task 5: Update Anywidget and Demo Examples

**Files:**
- Modify: `packages/anywidget/js/widget.ts`
- Modify: `packages/anywidget/js/widget.css`
- Modify: `examples/basic/react/components/SpectrogramPanel.tsx`
- Modify: `examples/basic/react/styles.ts`

- [ ] **Step 1: Update `packages/anywidget/js/widget.ts` & `widget.css`**

Attach `attachPlayheadOverlay` to both the spectrogram and waveform containers, and style `.sonoscope-playhead` with neon/white glow.

- [ ] **Step 2: Update `SpectrogramPanel.tsx` & `styles.ts` in `examples/basic`**

Ensure `.sonoscope-playhead` styling integrates cleanly with existing dark theme aesthetic.

- [ ] **Step 3: Run Biome and typecheck**

Run: `npm run check:biome && npm run check:types`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/anywidget/ examples/
git commit -m "feat(anywidget,examples): style and attach DOM playhead overlays"
```

---

### Task 6: Final Verification & Performance Validation

**Files:**
- Test: Full monorepo verification

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: 43 test files passed, 0 failures.

- [ ] **Step 2: Run typecheck across all workspaces**

Run: `npm run check:types`
Expected: No TypeScript errors.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Clean build of `@sonoscope/core` and `@sonoscope/react`.

- [ ] **Step 4: Final commit & cleanup**

```bash
git commit --allow-empty -m "chore: complete decoupled HTML playhead overlay implementation"
```
