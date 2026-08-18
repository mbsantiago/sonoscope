# FrequencyRuler Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a high-performance, scale-aware `FrequencyRuler` viewer in `@sonoscope/core` (and `<FrequencyRuler />` in `@sonoscope/react`) that renders vertical frequency coordinate scales across `"linear"`, `"mel"`, and `"log"` frequency scales onto an HTML5 2D Canvas using modular drawing programs.

**Architecture:** A standalone `FrequencyRulerViewer` bound to `ISonoscope` that synchronizes frequency bounds (`minFrequency`, `maxFrequency`, `frequencyScale`) and renders crisp, DPR-aware vertical scales on an HTML5 `<canvas>`. Drawing logic is abstracted into `FrequencyRulerProgram` instances, with built-in `"ticks"` and `"boxes"` (or banded interval) programs.

**Tech Stack:** TypeScript, HTML5 Canvas 2D Context, Vitest, `@sonoscope/core`, `@sonoscope/react`.

## Global Constraints
- Canvas 2D context for all ruler rendering with full DPR (devicePixelRatio) support and crisp line/text alignment.
- Handles `"linear"`, `"mel"`, and `"log"` frequency scales seamlessly with adaptive tick intervals.
- Synchronizes with `ISonoscope` viewport via `scope.on('viewportchange')` and supports coordinate conversion (`canvasToFrequency`, `frequencyToCanvas`).
- Integrates seamlessly beside `SpectrogramViewer`, `WaveformViewer`, and `TimeRulerViewer`.

---

### Task 1: Frequency Calculation, Scale Mapping & Adaptive Tick Utilities

**Files:**
- Create: `packages/core/src/viewers/frequency-ruler/ticks.ts`
- Test: `packages/core/src/viewers/frequency-ruler/ticks.test.ts`

**Interfaces:**
- Produces:
  - `computeFrequencyTicks(minFrequency: number, maxFrequency: number, pixelHeight: number, scale: FrequencyScale, minPixelSpacing?: number): { majorTicks: number[]; minorTicks: number[] }`
  - `formatFrequencyLabel(hz: number, format?: "auto" | "hz" | "khz" | ((hz: number) => string)): string`

- [ ] **Step 1: Write the failing test for frequency tick calculation and formatting**

```ts
import { describe, expect, it } from "vitest";
import { computeFrequencyTicks, formatFrequencyLabel } from "./ticks";

describe("FrequencyRuler tick utilities", () => {
  it("computes linear frequency ticks", () => {
    const { majorTicks } = computeFrequencyTicks(0, 20000, 400, "linear");
    expect(majorTicks).toContain(0);
    expect(majorTicks).toContain(5000);
    expect(majorTicks).toContain(10000);
    expect(majorTicks).toContain(20000);
  });

  it("computes mel scale frequency ticks", () => {
    const { majorTicks } = computeFrequencyTicks(0, 22050, 400, "mel");
    expect(majorTicks).toContain(1000);
    expect(majorTicks).toContain(5000);
    expect(majorTicks).toContain(10000);
  });

  it("computes log scale frequency ticks", () => {
    const { majorTicks } = computeFrequencyTicks(20, 20000, 400, "log");
    expect(majorTicks).toContain(100);
    expect(majorTicks).toContain(1000);
    expect(majorTicks).toContain(10000);
  });

  it("formats frequency labels cleanly", () => {
    expect(formatFrequencyLabel(440, "auto")).toBe("440 Hz");
    expect(formatFrequencyLabel(1000, "auto")).toBe("1 kHz");
    expect(formatFrequencyLabel(2500, "auto")).toBe("2.5 kHz");
    expect(formatFrequencyLabel(10000, "auto")).toBe("10 kHz");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/viewers/frequency-ruler/ticks.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement frequency tick calculation and formatting**

Implement `packages/core/src/viewers/frequency-ruler/ticks.ts` using scale mapping (`hzToScale`, `scaleToHz`) and standard Hz ladders (`[10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/src/viewers/frequency-ruler/ticks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/viewers/frequency-ruler/ticks.ts packages/core/src/viewers/frequency-ruler/ticks.test.ts
git commit -m "feat(frequency-ruler): implement adaptive frequency tick calculations and formatting"
```

---

### Task 2: FrequencyRuler Types & Drawing Programs (Ticks & Boxes)

**Files:**
- Create: `packages/core/src/viewers/frequency-ruler/types.ts`
- Create: `packages/core/src/viewers/frequency-ruler/programs/ticks-program.ts`
- Create: `packages/core/src/viewers/frequency-ruler/programs/boxes-program.ts`
- Test: `packages/core/src/viewers/frequency-ruler/programs/programs.test.ts`

**Interfaces:**
- Produces:
  - `FrequencyRulerProgram` interface
  - `TicksFrequencyRulerProgram`
  - `BoxesFrequencyRulerProgram`
  - `FrequencyRulerRenderInput`, `FrequencyRulerConfig`, `ResolvedFrequencyRulerConfig`

- [ ] **Step 1: Write the failing test for frequency drawing programs**

```ts
import { describe, expect, it, vi } from "vitest";
import { BoxesFrequencyRulerProgram } from "./boxes-program";
import { TicksFrequencyRulerProgram } from "./ticks-program";

function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 60,
    height: 400,
    getBoundingClientRect: () => ({ width: 60, height: 400 }),
    getContext: () => ({
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      measureText: () => ({ width: 24 }),
    }),
  } as unknown as HTMLCanvasElement;
}

describe("FrequencyRuler Drawing Programs", () => {
  it("Ticks program executes draw without error across linear, mel, and log scales", () => {
    const program = new TicksFrequencyRulerProgram();
    const canvas = createMockCanvas();
    const ctx = canvas.getContext("2d")!;
    for (const scale of ["linear", "mel", "log"] as const) {
      expect(() =>
        program.draw(
          ctx,
          {
            canvas,
            minFrequency: scale === "log" ? 20 : 0,
            maxFrequency: 20000,
            frequencyScale: scale,
            color: "#ffffff",
          },
          { width: 60, height: 400, dpr: 1 },
        ),
      ).not.toThrow();
    }
  });

  it("Boxes program executes draw without error", () => {
    const program = new BoxesFrequencyRulerProgram();
    const canvas = createMockCanvas();
    const ctx = canvas.getContext("2d")!;
    expect(() =>
      program.draw(
        ctx,
        {
          canvas,
          minFrequency: 0,
          maxFrequency: 20000,
          frequencyScale: "linear",
          color: "#ffffff",
        },
        { width: 60, height: 400, dpr: 1 },
      ),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/viewers/frequency-ruler/programs/programs.test.ts`
Expected: FAIL

- [ ] **Step 3: Define types and implement Ticks and Boxes programs**

1. `types.ts`: Define `FrequencyRulerConfig`, `FrequencyRulerProgram`, `FrequencyRulerRenderInput`.
2. `ticks-program.ts`: Implement major tick lines, minor tick lines, and formatted Hz labels mapped to Y coordinates based on `frequencyScale`.
3. `boxes-program.ts`: Implement vertical segmented frequency band boxes with separator lines and centered labels.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/src/viewers/frequency-ruler/programs/programs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/viewers/frequency-ruler/types.ts packages/core/src/viewers/frequency-ruler/programs/
git commit -m "feat(frequency-ruler): implement Ticks and Boxes frequency drawing programs"
```

---

### Task 3: FrequencyRulerViewer Controller & Sonoscope Integration

**Files:**
- Create: `packages/core/src/viewers/frequency-ruler/viewer.ts`
- Create: `packages/core/src/viewers/frequency-ruler/index.ts`
- Modify: `packages/core/src/sonoscope.ts`
- Modify: `packages/core/src/navigation.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/viewers/frequency-ruler/viewer.test.ts`

**Interfaces:**
- Produces:
  - `FrequencyRulerViewer implements IFrequencyRulerViewer`
  - `Sonoscope.prototype.createFrequencyRuler(canvas, options)`

- [ ] **Step 1: Write the failing test for FrequencyRulerViewer**

```ts
import { describe, expect, it, vi } from "vitest";
import { Sonoscope } from "../../sonoscope";
import { FrequencyRulerViewer } from "./viewer";

function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 60,
    height: 400,
    getBoundingClientRect: () => ({ width: 60, height: 400 }),
    getContext: () => ({
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      measureText: () => ({ width: 24 }),
    }),
  } as unknown as HTMLCanvasElement;
}

describe("FrequencyRulerViewer", () => {
  const dummySource = {
    id: "dummy",
    sampleRate: 48000,
    duration: 60,
    channelCount: 1,
    read: vi.fn(),
  };

  it("creates FrequencyRulerViewer and renders automatically on viewport changes", async () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createMockCanvas();
    const viewer = scope.createFrequencyRuler(canvas, {
      program: "ticks",
      frequencyScale: "mel",
      color: "#ffffff",
    });

    expect(viewer).toBeInstanceOf(FrequencyRulerViewer);
    expect(viewer.getConfig().frequencyScale).toBe("mel");

    await viewer.render();
    expect(viewer.getStatus().state).toBe("ready");

    viewer.destroy();
    expect(viewer.getStatus().state).toBe("destroyed");
  });

  it("converts between canvas coordinates and frequency", () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createMockCanvas();
    const viewer = scope.createFrequencyRuler(canvas, {
      minFrequency: 0,
      maxFrequency: 20000,
      frequencyScale: "linear",
    });

    expect(viewer.canvasToFrequency(400)).toBeCloseTo(0);
    expect(viewer.canvasToFrequency(0)).toBeCloseTo(20000);
    expect(viewer.canvasToFrequency(200)).toBeCloseTo(10000);

    expect(viewer.frequencyToCanvas(0)).toBeCloseTo(400);
    expect(viewer.frequencyToCanvas(20000)).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/viewers/frequency-ruler/viewer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement FrequencyRulerViewer and Sonoscope.createFrequencyRuler**

Implement controller, DPR scaling, viewport syncing, and export from `@sonoscope/core`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/src/viewers/frequency-ruler/viewer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/viewers/frequency-ruler/ packages/core/src/sonoscope.ts packages/core/src/navigation.ts packages/core/src/index.ts
git commit -m "feat(frequency-ruler): implement FrequencyRulerViewer controller and integrate into Sonoscope"
```

---

### Task 4: React Integration (`<FrequencyRuler />` & `useFrequencyRuler`)

**Files:**
- Create: `packages/react/src/FrequencyRuler.tsx`
- Create: `packages/react/src/useFrequencyRuler.ts`
- Modify: `packages/react/src/index.ts`
- Modify: `packages/react/src/react.test.ts`

**Interfaces:**
- Produces:
  - `<FrequencyRuler program="ticks" | "boxes" | FrequencyRulerProgram />`
  - `useFrequencyRuler(canvasRef, options)`

- [ ] **Step 1: Add FrequencyRuler unit tests to `packages/react/src/react.test.ts`**

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/react/src/react.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `<FrequencyRuler />` and `useFrequencyRuler`**

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/react/src/react.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/FrequencyRuler.tsx packages/react/src/useFrequencyRuler.ts packages/react/src/index.ts packages/react/src/react.test.ts
git commit -m "feat(react): implement <FrequencyRuler /> and useFrequencyRuler hook"
```

---

### Task 5: Interactive Spectrogram & Dual Rulers Showcase Demo

**Files:**
- Create: `examples/basic/rulers.html`
- Modify: `examples/basic/index.html`

- [ ] **Step 1: Create `examples/basic/rulers.html`**

Build an interactive studio layout featuring:
- Vertical **FrequencyRuler** on the left of the Spectrogram.
- Horizontal **TimeRuler** on the top (or bottom) of the Spectrogram.
- Frequency scale switcher (`mel`, `linear`, `log`) that dynamically updates both Spectrogram and FrequencyRuler in sync.
- Time format and ruler program switchers.

- [ ] **Step 2: Update `examples/basic/index.html` with demo link**

- [ ] **Step 3: Run all checks (`npm test`, `npm run check:types`, `npm run build`)**

- [ ] **Step 4: Commit**

```bash
git add examples/basic/rulers.html examples/basic/index.html
git commit -m "feat(demos): add interactive full spectrogram with TimeRuler and FrequencyRuler"
```
