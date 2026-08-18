# TimeRuler Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a high-performance, modular `TimeRuler` viewer in `@sonoscope/core` (and `<TimeRuler />` in `@sonoscope/react`) that syncs with Sonoscope viewports, rendering adaptive time ticks and boxed interval labels onto a 2D Canvas using interchangeable drawing programs.

**Architecture:** A standalone `TimeRulerViewer` bound to `ISonoscope` that listens to `viewportchange` and redraws crisp, DPR-aware coordinate scales on an HTML5 `<canvas>`. Drawing logic is abstracted into `TimeRulerProgram` instances, with two built-in programs: `"ticks"` (classic major/minor ticks and timestamps inspired by DAW rulers) and `"boxes"` (segmented block/framed timestamp intervals as shown in the reference image).

**Tech Stack:** TypeScript, HTML5 Canvas 2D Context, Vitest, `@sonoscope/core`, `@sonoscope/react`.

## Global Constraints
- Canvas 2D context for all ruler rendering with full DPR (devicePixelRatio) support and crisp 0.5px line alignment.
- Zero external dependencies.
- Synchronizes with `ISonoscope` viewport via `scope.on('viewportchange')` and supports optional user navigation (drag to pan / scroll to zoom).
- Seamlessly integrates alongside `SpectrogramViewer` and `WaveformViewer`.

---

### Task 1: Time Calculation & Adaptive Tick Subdivision Utilities

**Files:**
- Create: `packages/core/src/viewers/time-ruler/ticks.ts`
- Test: `packages/core/src/viewers/time-ruler/ticks.test.ts`

**Interfaces:**
- Produces:
  - `computeTimeTicks(startTime: number, endTime: number, pixelWidth: number, minPixelSpacing?: number): { majorStep: number; minorStep: number; majorTicks: number[]; minorTicks: number[] }`
  - `formatTimeLabel(seconds: number, step: number, format?: "seconds" | "timecode" | "hhmmss" | "auto" | ((sec: number) => string)): string`

- [ ] **Step 1: Write the failing test for time tick calculation and formatting**

```ts
import { describe, expect, it } from "vitest";
import { computeTimeTicks, formatTimeLabel } from "./ticks";

describe("TimeRuler tick utilities", () => {
  it("computes reasonable major and minor steps for given viewport and width", () => {
    const { majorStep, minorStep, majorTicks, minorTicks } = computeTimeTicks(0, 10, 1000);
    expect(majorStep).toBe(1);
    expect(minorStep).toBe(0.2);
    expect(majorTicks).toContain(0);
    expect(majorTicks).toContain(5);
    expect(majorTicks).toContain(10);
    expect(minorTicks.length).toBeGreaterThan(majorTicks.length);
  });

  it("formats time labels cleanly across sub-second, seconds, and minutes", () => {
    expect(formatTimeLabel(0.5, 0.1, "auto")).toBe("0.5s");
    expect(formatTimeLabel(65, 1, "auto")).toBe("1:05");
    expect(formatTimeLabel(3665, 1, "auto")).toBe("1:01:05");
    expect(formatTimeLabel(1500 * 3600, 3600, "hhmmss")).toBe("1500:00:00");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/viewers/time-ruler/ticks.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement adaptive tick interval calculation and formatting**

Implement `packages/core/src/viewers/time-ruler/ticks.ts` with nice standard intervals:
`[0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 86400]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/src/viewers/time-ruler/ticks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/viewers/time-ruler/ticks.ts packages/core/src/viewers/time-ruler/ticks.test.ts
git commit -m "feat(time-ruler): implement adaptive tick and label formatting utilities"
```

---

### Task 2: TimeRuler Types & Drawing Programs (Ticks & Boxes)

**Files:**
- Create: `packages/core/src/viewers/time-ruler/types.ts`
- Create: `packages/core/src/viewers/time-ruler/programs/ticks-program.ts`
- Create: `packages/core/src/viewers/time-ruler/programs/boxes-program.ts`
- Test: `packages/core/src/viewers/time-ruler/programs/programs.test.ts`

**Interfaces:**
- Produces:
  - `TimeRulerProgram` interface
  - `TicksTimeRulerProgram`
  - `BoxesTimeRulerProgram`
  - `TimeRulerRenderInput`, `TimeRulerConfig`, `ResolvedTimeRulerConfig`

- [ ] **Step 1: Write the failing test for drawing programs**

```ts
import { describe, expect, it, vi } from "vitest";
import { TicksTimeRulerProgram } from "./ticks-program";
import { BoxesTimeRulerProgram } from "./boxes-program";

function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 600,
    height: 30,
    getBoundingClientRect: () => ({ width: 600, height: 30 }),
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

describe("TimeRuler Drawing Programs", () => {
  it("Ticks program executes draw without error", () => {
    const program = new TicksTimeRulerProgram();
    const canvas = createMockCanvas();
    const ctx = canvas.getContext("2d")!;
    expect(() =>
      program.draw(ctx, {
        canvas,
        startTime: 0,
        endTime: 10,
        totalDuration: 60,
        color: "#ffffff",
        backgroundColor: "#000000",
      }, { width: 600, height: 30, dpr: 1 })
    ).not.toThrow();
  });

  it("Boxes program executes draw without error", () => {
    const program = new BoxesTimeRulerProgram();
    const canvas = createMockCanvas();
    const ctx = canvas.getContext("2d")!;
    expect(() =>
      program.draw(ctx, {
        canvas,
        startTime: 0,
        endTime: 10,
        totalDuration: 60,
        color: "#ffffff",
        backgroundColor: "#000000",
      }, { width: 600, height: 30, dpr: 1 })
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/viewers/time-ruler/programs/programs.test.ts`
Expected: FAIL

- [ ] **Step 3: Define types and implement Ticks and Boxes programs**

1. `types.ts`: Define `TimeRulerConfig`, `TimeRulerProgram`, `TimeRulerRenderInput`.
2. `ticks-program.ts`: Implement major tick lines, minor tick lines, and label rendering with crisp pixel alignment.
3. `boxes-program.ts`: Implement segmented boxed intervals with framed cell borders and centered labels inspired by bioacoustics/spectrogram time bars.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/src/viewers/time-ruler/programs/programs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/viewers/time-ruler/types.ts packages/core/src/viewers/time-ruler/programs/
git commit -m "feat(time-ruler): implement Ticks and Boxes canvas 2D drawing programs"
```

---

### Task 3: TimeRulerViewer Controller & Sonoscope Integration

**Files:**
- Create: `packages/core/src/viewers/time-ruler/viewer.ts`
- Modify: `packages/core/src/viewers/time-ruler/index.ts`
- Modify: `packages/core/src/sonoscope.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/viewers/time-ruler/viewer.test.ts`

**Interfaces:**
- Produces:
  - `TimeRulerViewer implements ITimeRulerViewer`
  - `Sonoscope.prototype.createTimeRuler(canvas, options)`

- [ ] **Step 1: Write the failing test for TimeRulerViewer**

```ts
import { describe, expect, it, vi } from "vitest";
import { Sonoscope } from "../../sonoscope";
import { TimeRulerViewer } from "./viewer";

describe("TimeRulerViewer", () => {
  const dummySource = {
    id: "dummy",
    sampleRate: 44100,
    duration: 60,
    channelCount: 1,
    read: vi.fn(),
  };

  it("creates TimeRulerViewer and renders automatically on viewport changes", async () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = document.createElement("canvas");
    const viewer = scope.createTimeRuler(canvas, {
      program: "ticks",
      color: "#ffffff",
    });

    expect(viewer).toBeInstanceOf(TimeRulerViewer);
    expect(viewer.getConfig().program).toBe("ticks");

    await viewer.render();
    expect(viewer.getStatus().state).toBe("ready");

    scope.setViewport({ startTime: 5, endTime: 15 });
    expect(viewer.getViewport().startTime).toBe(5);
    expect(viewer.getViewport().endTime).toBe(15);

    viewer.destroy();
    expect(viewer.getStatus().state).toBe("destroyed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/viewers/time-ruler/viewer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement TimeRulerViewer and Sonoscope.createTimeRuler**

- Implement `TimeRulerViewer` with DPR handling, auto-rendering, event subscriptions, program resolution (`"ticks"`, `"boxes"`, or custom `TimeRulerProgram`), and coordinate conversion helpers (`canvasToTime`, `timeToCanvas`).
- Add `createTimeRuler` to `Sonoscope` and export in `@sonoscope/core`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/src/viewers/time-ruler/viewer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/viewers/time-ruler/ packages/core/src/sonoscope.ts packages/core/src/types.ts packages/core/src/index.ts
git commit -m "feat(time-ruler): implement TimeRulerViewer controller and integrate into Sonoscope"
```

---

### Task 4: React Integration (`<TimeRuler />` & `useTimeRuler`)

**Files:**
- Create: `packages/react/src/TimeRuler.tsx`
- Create: `packages/react/src/useTimeRuler.ts`
- Modify: `packages/react/src/index.ts`
- Test: `packages/react/src/TimeRuler.test.tsx`

**Interfaces:**
- Produces:
  - `<TimeRuler program="ticks" | "boxes" | TimeRulerProgram />`
  - `useTimeRuler(scope, options)`

- [ ] **Step 1: Write the failing test for React TimeRuler component**

```tsx
import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { Sonoscope } from "@sonoscope/core";
import { SonoscopeProvider } from "./SonoscopeProvider";
import { TimeRuler } from "./TimeRuler";

describe("<TimeRuler />", () => {
  it("renders a canvas and attaches to Sonoscope context", () => {
    const scope = new Sonoscope({
      source: { id: "test", sampleRate: 44100, duration: 10, channelCount: 1, read: vi.fn() },
    });
    const { container } = render(
      <SonoscopeProvider value={scope}>
        <TimeRuler program="ticks" style={{ width: 400, height: 24 }} />
      </SonoscopeProvider>
    );
    expect(container.querySelector("canvas")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/react/src/TimeRuler.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `<TimeRuler />` and `useTimeRuler`**

Implement the React wrapper following the established pattern of `<Spectrogram />` and `<Waveform />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/react/src/TimeRuler.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/TimeRuler.tsx packages/react/src/useTimeRuler.ts packages/react/src/index.ts packages/react/src/TimeRuler.test.tsx
git commit -m "feat(react): implement <TimeRuler /> and useTimeRuler hook"
```

---

### Task 5: Interactive TimeRuler Demo & Demo Index Update

**Files:**
- Create: `examples/basic/time-ruler.html`
- Modify: `examples/basic/index.html`

- [ ] **Step 1: Create `examples/basic/time-ruler.html`**

Build an interactive demo featuring:
- Audio player with synchronized Spectrogram, Waveform, and **TimeRuler**.
- Top ruler in `"ticks"` mode.
- Bottom ruler in `"boxes"` mode (matching the reference image).
- Program switchers, font/color controls, and time formatting options (`hh:mm:ss`, `seconds`, `auto`).
- Seamless pan/zoom synchronization.

- [ ] **Step 2: Update `examples/basic/index.html` to link to the new demo**

- [ ] **Step 3: Run all checks (`npm test`, `npm run check:types`, `npm run build`)**

- [ ] **Step 4: Commit**

```bash
git add examples/basic/time-ruler.html examples/basic/index.html
git commit -m "feat(demos): add interactive TimeRuler demo showcase"
```
