import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachCanvasDragNavigation,
  attachCanvasNavigation,
  attachCanvasWheelNavigation,
  panViewportFrequency,
  panViewportTime,
  zoomViewportFrequency,
  zoomViewportTime,
} from "./navigation";
import type { ViewportConfig } from "./types";
import type { SpectrogramViewer } from "./viewer";

const viewport: ViewportConfig = {
  startTime: 4,
  endTime: 8,
  minFrequency: 0,
  maxFrequency: 1000,
  frequencyScale: "linear",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("navigation utilities", () => {
  it("pans time while preserving viewport duration and source bounds", () => {
    expect(
      panViewportTime(viewport, { startTime: 0, endTime: 10 }, 3),
    ).toMatchObject({ startTime: 6, endTime: 10 });
    expect(
      panViewportTime(viewport, { startTime: 0, endTime: 10 }, -10),
    ).toMatchObject({ startTime: 0, endTime: 4 });
  });

  it("pans frequency while preserving span and bounds", () => {
    const vp: ViewportConfig = {
      ...viewport,
      minFrequency: 200,
      maxFrequency: 800,
    };
    expect(
      panViewportFrequency(vp, { minFrequency: 0, maxFrequency: 1000 }, 100),
    ).toMatchObject({ minFrequency: 300, maxFrequency: 900 });
    expect(
      panViewportFrequency(vp, { minFrequency: 0, maxFrequency: 1000 }, -500),
    ).toMatchObject({ minFrequency: 0, maxFrequency: 600 });
  });

  it("zooms around a time anchor", () => {
    expect(
      zoomViewportTime(viewport, { startTime: 0, endTime: 20 }, 5, 0.5),
    ).toMatchObject({ startTime: 4.5, endTime: 6.5 });
  });

  it("zooms around a frequency anchor", () => {
    const vp: ViewportConfig = {
      ...viewport,
      minFrequency: 0,
      maxFrequency: 1000,
    };
    expect(
      zoomViewportFrequency(
        vp,
        { minFrequency: 0, maxFrequency: 1000 },
        500,
        0.5,
      ),
    ).toMatchObject({ minFrequency: 250, maxFrequency: 750 });
  });

  it("keeps an off-center time anchor under the same cursor ratio after zooming", () => {
    const anchorTime = 5;
    const ratioBefore =
      (anchorTime - viewport.startTime) /
      (viewport.endTime - viewport.startTime);
    const next = zoomViewportTime(
      viewport,
      { startTime: 0, endTime: 20 },
      anchorTime,
      0.5,
    );
    const ratioAfter =
      (anchorTime - next.startTime) / (next.endTime - next.startTime);

    expect(ratioAfter).toBeCloseTo(ratioBefore, 12);
  });

  it("keeps an off-center frequency anchor under the same ratio after zooming", () => {
    const anchorFreq = 300;
    const ratioBefore =
      (anchorFreq - viewport.minFrequency) /
      (viewport.maxFrequency - viewport.minFrequency);
    const next = zoomViewportFrequency(
      viewport,
      { minFrequency: 0, maxFrequency: 1000 },
      anchorFreq,
      0.5,
    );
    const ratioAfter =
      (anchorFreq - next.minFrequency) /
      (next.maxFrequency - next.minFrequency);

    expect(ratioAfter).toBeCloseTo(ratioBefore, 12);
  });

  it("does not shift sideways when zooming out at maximum duration", () => {
    const fullViewport: ViewportConfig = {
      ...viewport,
      startTime: 0,
      endTime: 20,
    };

    expect(
      zoomViewportTime(
        fullViewport,
        { startTime: 0, endTime: 20, maxDurationSeconds: 20 },
        4,
        2,
      ),
    ).toEqual(fullViewport);
  });

  it("does not shift sideways when zooming in at minimum duration", () => {
    const tinyViewport: ViewportConfig = {
      ...viewport,
      startTime: 4,
      endTime: 4.5,
    };

    expect(
      zoomViewportTime(
        tinyViewport,
        { startTime: 0, endTime: 20, minDurationSeconds: 0.5 },
        4.4,
        0.5,
      ),
    ).toEqual(tinyViewport);
  });
});

describe("attachCanvasWheelNavigation", () => {
  it("coalesces wheel navigation to one viewport update per animation frame", () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const listeners = new Map<string, EventListener>();
    const canvas = {
      addEventListener: vi.fn((name: string, listener: EventListener) =>
        listeners.set(name, listener),
      ),
      removeEventListener: vi.fn(),
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      }),
    } as unknown as HTMLCanvasElement;
    const setViewport = vi.fn((update: Partial<ViewportConfig>) => {
      current = { ...current, ...update };
    });
    let current = { ...viewport };
    const viewer = {
      getConfig: () => ({ canvas, source: { duration: 20 } }),
      getTimeBounds: () => ({
        startTime: 0,
        endTime: 20,
        minDurationSeconds: 0.05,
        maxDurationSeconds: 20,
      }),
      getViewport: () => current,
      setViewport,
      requestRender: vi.fn(),
      canvasToTimeFrequency: () => ({ time: 6, frequency: 100 }),
    } as unknown as SpectrogramViewer;
    attachCanvasWheelNavigation(viewer, canvas);
    const wheel = listeners.get("wheel")!;

    wheel({
      preventDefault: vi.fn(),
      deltaY: 120,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      clientX: 10,
      clientY: 10,
    } as unknown as WheelEvent);
    wheel({
      preventDefault: vi.fn(),
      deltaY: 240,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      clientX: 10,
      clientY: 10,
    } as unknown as WheelEvent);
    expect(setViewport).not.toHaveBeenCalled();

    frame?.(0);

    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(setViewport.mock.calls[0]?.[0].startTime).toBeGreaterThan(
      viewport.startTime,
    );
  });

  it("uses plain wheel for horizontal time panning by default", () => {
    const { runFrame, setViewport, wheel } = setupWheelNavigation();

    wheel({
      preventDefault: vi.fn(),
      deltaY: 120,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      clientX: 10,
      clientY: 10,
    } as unknown as WheelEvent);
    runFrame();

    expect(setViewport.mock.calls[0]?.[0]).toMatchObject({
      startTime: 5.846153846153847,
      endTime: 9.846153846153847,
    });
  });

  it("uses ctrl wheel for cursor-centered time zoom by default", () => {
    const { runFrame, setViewport, wheel } = setupWheelNavigation();

    wheel({
      preventDefault: vi.fn(),
      deltaY: -120,
      shiftKey: false,
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      clientX: 10,
      clientY: 10,
    } as unknown as WheelEvent);
    runFrame();

    expect(setViewport.mock.calls[0]?.[0].startTime).toBeCloseTo(
      4.107029704093033,
      12,
    );
    expect(setViewport.mock.calls[0]?.[0].endTime).toBeCloseTo(
      7.892970295906968,
      12,
    );
  });
});

describe("attachCanvasDragNavigation", () => {
  it("pans time when dragging beyond threshold", () => {
    const { listeners, setViewport, canvas } = setupDragNavigation();

    const down = listeners.get("pointerdown") || listeners.get("mousedown")!;
    const move = listeners.get("pointermove") || listeners.get("mousemove")!;
    const up = listeners.get("pointerup") || listeners.get("mouseup")!;

    // 1. Mouse down at x=50
    down({ button: 0, clientX: 50, clientY: 50, pointerId: 1 } as PointerEvent);
    expect(setViewport).not.toHaveBeenCalled();

    // 2. Small movement within threshold (2px < 3px threshold)
    move({ button: 0, clientX: 52, clientY: 50, pointerId: 1 } as PointerEvent);
    expect(setViewport).not.toHaveBeenCalled();

    // 3. Drag left by 25px on 100px wide canvas -> duration is 4s -> delta is +1s (panning forward)
    move({ button: 0, clientX: 25, clientY: 50, pointerId: 1 } as PointerEvent);
    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(setViewport.mock.calls[0]?.[0]).toMatchObject({
      startTime: 5,
      endTime: 9,
    });

    // 4. Drag right by 25px on 100px wide canvas -> delta is -1s (panning backward)
    move({ button: 0, clientX: 75, clientY: 50, pointerId: 1 } as PointerEvent);
    expect(setViewport.mock.calls[1]?.[0]).toMatchObject({
      startTime: 3,
      endTime: 7,
    });

    // 5. Mouse up
    up({ button: 0, clientX: 75, clientY: 50, pointerId: 1 } as PointerEvent);
    expect(canvas.style.cursor).toBe("grab");
  });

  it("respects button and modifier options", () => {
    const { listeners, setViewport } = setupDragNavigation({
      button: 0,
      modifier: "shift",
    });

    const down = listeners.get("pointerdown") || listeners.get("mousedown")!;
    const move = listeners.get("pointermove") || listeners.get("mousemove")!;

    // Down without shift -> should not start dragging
    down({
      button: 0,
      clientX: 50,
      clientY: 50,
      shiftKey: false,
      pointerId: 1,
    } as PointerEvent);
    move({
      button: 0,
      clientX: 20,
      clientY: 50,
      shiftKey: false,
      pointerId: 1,
    } as PointerEvent);
    expect(setViewport).not.toHaveBeenCalled();

    // Down with right button -> should not start dragging
    down({
      button: 2,
      clientX: 50,
      clientY: 50,
      shiftKey: true,
      pointerId: 1,
    } as PointerEvent);
    move({
      button: 2,
      clientX: 20,
      clientY: 50,
      shiftKey: true,
      pointerId: 1,
    } as PointerEvent);
    expect(setViewport).not.toHaveBeenCalled();

    // Down with shift -> should drag
    down({
      button: 0,
      clientX: 50,
      clientY: 50,
      shiftKey: true,
      pointerId: 1,
    } as PointerEvent);
    move({
      button: 0,
      clientX: 20,
      clientY: 50,
      shiftKey: true,
      pointerId: 1,
    } as PointerEvent);
    expect(setViewport).toHaveBeenCalled();
  });

  it("calls onDragStart, onDragEnd, and onNavigate callbacks", () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const onNavigate = vi.fn();

    const { listeners } = setupDragNavigation({
      onDragStart,
      onDragEnd,
      onNavigate,
    });

    const down = listeners.get("pointerdown") || listeners.get("mousedown")!;
    const move = listeners.get("pointermove") || listeners.get("mousemove")!;
    const up = listeners.get("pointerup") || listeners.get("mouseup")!;

    down({ button: 0, clientX: 50, clientY: 50, pointerId: 1 } as PointerEvent);
    expect(onDragStart).not.toHaveBeenCalled();

    move({ button: 0, clientX: 20, clientY: 50, pointerId: 1 } as PointerEvent);
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);

    up({ button: 0, clientX: 20, clientY: 50, pointerId: 1 } as PointerEvent);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });

  it("cleans up event listeners and restores original cursor on destroy", () => {
    const listeners = new Map<string, EventListener>();
    const canvas = {
      style: { cursor: "default" },
      addEventListener: vi.fn((name: string, listener: EventListener) =>
        listeners.set(name, listener),
      ),
      removeEventListener: vi.fn(),
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      }),
    } as unknown as HTMLCanvasElement;

    const viewer = {
      getConfig: () => ({ canvas, source: { duration: 20 } }),
      getTimeBounds: () => ({
        startTime: 0,
        endTime: 20,
        minDurationSeconds: 0.05,
        maxDurationSeconds: 20,
      }),
      getViewport: () => ({ ...viewport }),
      setViewport: vi.fn(),
      requestRender: vi.fn(),
      canvasToTimeFrequency: () => ({ time: 6, frequency: 100 }),
    } as unknown as SpectrogramViewer;

    const cleanup = attachCanvasDragNavigation(viewer, canvas);
    expect(canvas.style.cursor).toBe("grab");

    cleanup();
    expect(canvas.removeEventListener).toHaveBeenCalled();
    expect(canvas.style.cursor).toBe("default");
  });
});

describe("attachCanvasNavigation composite", () => {
  it("attaches both wheel and drag navigation by default", () => {
    const listeners = new Map<string, EventListener>();
    const canvas = {
      style: { cursor: "" },
      addEventListener: vi.fn((name: string, listener: EventListener) =>
        listeners.set(name, listener),
      ),
      removeEventListener: vi.fn(),
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      }),
    } as unknown as HTMLCanvasElement;

    const viewer = {
      getConfig: () => ({ canvas, source: { duration: 20 } }),
      getTimeBounds: () => ({
        startTime: 0,
        endTime: 20,
        minDurationSeconds: 0.05,
        maxDurationSeconds: 20,
      }),
      getViewport: () => ({ ...viewport }),
      setViewport: vi.fn(),
      requestRender: vi.fn(),
      canvasToTimeFrequency: () => ({ time: 6, frequency: 100 }),
    } as unknown as SpectrogramViewer;

    const cleanup = attachCanvasNavigation(viewer, canvas);
    expect(listeners.has("wheel")).toBe(true);
    expect(listeners.has("pointerdown") || listeners.has("mousedown")).toBe(
      true,
    );

    cleanup();
    expect(canvas.removeEventListener).toHaveBeenCalled();
  });
});

function setupWheelNavigation() {
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const listeners = new Map<string, EventListener>();
  const canvas = {
    addEventListener: vi.fn((name: string, listener: EventListener) =>
      listeners.set(name, listener),
    ),
    removeEventListener: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  } as unknown as HTMLCanvasElement;
  const setViewport = vi.fn((update: Partial<ViewportConfig>) => {
    current = { ...current, ...update };
  });
  let current = { ...viewport };
  const viewer = {
    getConfig: () => ({ canvas, source: { duration: 20 } }),
    getTimeBounds: () => ({
      startTime: 0,
      endTime: 20,
      minDurationSeconds: 0.05,
      maxDurationSeconds: 20,
    }),
    getViewport: () => current,
    setViewport,
    requestRender: vi.fn(),
    canvasToTimeFrequency: () => ({ time: 6, frequency: 100 }),
  } as unknown as SpectrogramViewer;
  attachCanvasWheelNavigation(viewer, canvas);

  return {
    runFrame: () => frame?.(0),
    setViewport,
    wheel: listeners.get("wheel")!,
  };
}

function setupDragNavigation(options = {}) {
  const listeners = new Map<string, EventListener>();
  const canvas = {
    style: { cursor: "" },
    addEventListener: vi.fn((name: string, listener: EventListener) =>
      listeners.set(name, listener),
    ),
    removeEventListener: vi.fn(),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  } as unknown as HTMLCanvasElement;
  const setViewport = vi.fn((update: Partial<ViewportConfig>) => {
    current = { ...current, ...update };
  });
  let current = { ...viewport };
  const viewer = {
    getConfig: () => ({ canvas, source: { duration: 20 } }),
    getTimeBounds: () => ({
      startTime: 0,
      endTime: 20,
      minDurationSeconds: 0.05,
      maxDurationSeconds: 20,
    }),
    getViewport: () => current,
    setViewport,
    requestRender: vi.fn(),
    canvasToTimeFrequency: () => ({ time: 6, frequency: 100 }),
  } as unknown as SpectrogramViewer;

  const cleanup = attachCanvasDragNavigation(viewer, canvas, options);

  return {
    listeners,
    setViewport,
    canvas,
    cleanup,
  };
}
