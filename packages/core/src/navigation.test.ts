import type { ViewportConfig } from "./types";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachDragNavigation,
  attachNavigation,
  attachWheelNavigation,
  type NavigableViewer,
  panViewportFrequency,
  panViewportTime,
  zoomViewportFrequency,
  zoomViewportTime,
} from "./navigation";
import { Sonoscope } from "./sonoscope";

const viewport: ViewportConfig = {
  startTime: 4,
  endTime: 8,
  minFrequency: 0,
  maxFrequency: 1000,
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
      (anchorFreq - viewport.minFrequency!) /
      (viewport.maxFrequency! - viewport.minFrequency!);
    const next = zoomViewportFrequency(
      viewport,
      { minFrequency: 0, maxFrequency: 1000 },
      anchorFreq,
      0.5,
    );
    const ratioAfter =
      (anchorFreq - next.minFrequency!) /
      (next.maxFrequency! - next.minFrequency!);

    expect(ratioAfter).toBeCloseTo(ratioBefore, 12);
  });

  it("zooms out frequency back to full bounds", () => {
    const zoomedInViewport: ViewportConfig = {
      ...viewport,
      minFrequency: 250,
      maxFrequency: 750,
    };
    const next = zoomViewportFrequency(
      zoomedInViewport,
      { minFrequency: 0, maxFrequency: 1000 },
      500,
      2.0,
    );
    expect(next).toMatchObject({ minFrequency: 0, maxFrequency: 1000 });
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

describe("attachWheelNavigation", () => {
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
    } as unknown as NavigableViewer;
    attachWheelNavigation(viewer, canvas);
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

  it("uses shift wheel for vertical frequency panning on 2D viewers", () => {
    const { runFrame, setViewport, wheel } = setupWheelNavigation();

    wheel({
      preventDefault: vi.fn(),
      deltaY: 120,
      shiftKey: true,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      clientX: 10,
      clientY: 10,
    } as unknown as WheelEvent);
    runFrame();

    expect(setViewport.mock.calls[0]?.[0].minFrequency).toBeDefined();
    expect(setViewport.mock.calls[0]?.[0].maxFrequency).toBeDefined();
  });

  it("uses ctrl+shift wheel for vertical frequency zoom on 2D viewers", () => {
    const { runFrame, setViewport, wheel } = setupWheelNavigation();

    wheel({
      preventDefault: vi.fn(),
      deltaY: -120,
      shiftKey: true,
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      clientX: 10,
      clientY: 50,
    } as unknown as WheelEvent);
    runFrame();

    const call = setViewport.mock.calls[0]![0]!;
    expect(call.minFrequency).toBeDefined();
    expect(call.maxFrequency).toBeDefined();
    expect(call.maxFrequency! - call.minFrequency!).toBeLessThan(1000);
  });

  it("uses plain wheel for frequency panning on frequency-only viewers", () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    const listeners = new Map<string, EventListener>();
    const canvas = {
      addEventListener: vi.fn((name: string, listener: EventListener) =>
        listeners.set(name, listener),
      ),
      removeEventListener: vi.fn(),
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 50,
        height: 400,
      }),
    } as unknown as HTMLCanvasElement;
    const setViewport = vi.fn();
    const freqViewer = {
      getConfig: () => ({ minFrequency: 0, maxFrequency: 20000 }),
      getViewport: () => ({
        minFrequency: 0,
        maxFrequency: 20000,
        frequencyScale: "linear",
      }),
      setViewport,
      requestRender: vi.fn(),
      canvasToFrequency: (_y: number) => 10000,
    } as unknown as NavigableViewer;

    attachWheelNavigation(freqViewer, canvas);
    const wheel = listeners.get("wheel")!;

    wheel({
      preventDefault: vi.fn(),
      deltaY: 100,
      shiftKey: false,
      ctrlKey: false,
      clientX: 10,
      clientY: 200,
    } as unknown as WheelEvent);

    frame?.(0);
    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(setViewport.mock.calls[0]?.[0].minFrequency).toBeDefined();
  });
});

describe("attachDragNavigation", () => {
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

  it("pans frequency when shift is held during drag on 2D viewers", () => {
    const { listeners, setViewport } = setupDragNavigation();

    const down = listeners.get("pointerdown") || listeners.get("mousedown")!;
    const move = listeners.get("pointermove") || listeners.get("mousemove")!;

    down({
      button: 0,
      clientX: 50,
      clientY: 50,
      shiftKey: true,
      pointerId: 1,
    } as PointerEvent);
    move({
      button: 0,
      clientX: 50,
      clientY: 75,
      shiftKey: true,
      pointerId: 1,
    } as PointerEvent);

    expect(setViewport).toHaveBeenCalled();
    expect(setViewport.mock.calls[0]?.[0].minFrequency).toBeDefined();
    expect(setViewport.mock.calls[0]?.[0].maxFrequency).toBeDefined();
  });

  it("pans frequency on frequency-only viewers during drag", () => {
    const listeners = new Map<string, EventListener>();
    const canvas = {
      style: { cursor: "" },
      addEventListener: vi.fn((name: string, listener: EventListener) =>
        listeners.set(name, listener),
      ),
      removeEventListener: vi.fn(),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 50,
        height: 400,
      }),
    } as unknown as HTMLCanvasElement;
    const setViewport = vi.fn();
    const freqViewer = {
      getConfig: () => ({ minFrequency: 0, maxFrequency: 20000 }),
      getViewport: () => ({
        minFrequency: 0,
        maxFrequency: 20000,
        frequencyScale: "linear",
      }),
      setViewport,
      requestRender: vi.fn(),
      canvasToFrequency: (_y: number) => 10000,
    } as unknown as NavigableViewer;

    attachDragNavigation(freqViewer, canvas);

    const down = listeners.get("pointerdown") || listeners.get("mousedown")!;
    const move = listeners.get("pointermove") || listeners.get("mousemove")!;

    down({
      button: 0,
      clientX: 25,
      clientY: 200,
      pointerId: 1,
    } as PointerEvent);
    move({
      button: 0,
      clientX: 25,
      clientY: 250,
      pointerId: 1,
    } as PointerEvent);

    expect(setViewport).toHaveBeenCalled();
    expect(setViewport.mock.calls[0]?.[0].minFrequency).toBeDefined();
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
    } as unknown as NavigableViewer;

    const cleanup = attachDragNavigation(viewer, canvas);
    expect(canvas.style.cursor).toBe("grab");

    cleanup();
    expect(canvas.removeEventListener).toHaveBeenCalled();
    expect(canvas.style.cursor).toBe("default");
  });
});

describe("attachNavigation composite", () => {
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
    } as unknown as NavigableViewer;

    const cleanup = attachNavigation(viewer, canvas);
    expect(listeners.has("wheel")).toBe(true);
    expect(listeners.has("pointerdown") || listeners.has("mousedown")).toBe(
      true,
    );

    cleanup();
    expect(canvas.removeEventListener).toHaveBeenCalled();
  });
});

describe("NavigationOptions nested config and modifier keys", () => {
  it("supports nested wheel: { zoomModifier: 'alt' } and drag: false", () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

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

    let current = { ...viewport };
    const setViewport = vi.fn((update: Partial<ViewportConfig>) => {
      current = { ...current, ...update };
    });
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
    } as unknown as NavigableViewer;

    attachNavigation(viewer, canvas, {
      wheel: { zoomModifier: "alt" },
      drag: false,
    });

    expect(listeners.has("wheel")).toBe(true);
    expect(listeners.has("pointerdown") || listeners.has("mousedown")).toBe(
      false,
    );

    const wheel = listeners.get("wheel")!;

    // Wheel with altKey: true should zoom
    wheel({
      preventDefault: vi.fn(),
      deltaY: -120,
      shiftKey: false,
      ctrlKey: false,
      altKey: true,
      metaKey: false,
      clientX: 10,
      clientY: 10,
    } as unknown as WheelEvent);
    frame?.(0);

    expect(setViewport).toHaveBeenCalled();
    const updated = setViewport.mock.calls[0]![0]!;
    expect(updated.startTime).toBeCloseTo(4.107029704093033, 12);
  });

  it("supports wheel: false and drag: { button: 0, modifier: 'none' }", () => {
    const listeners = new Map<string, EventListener>();
    const canvas = {
      style: { cursor: "" },
      addEventListener: vi.fn((name: string, listener: EventListener) =>
        listeners.set(name, listener),
      ),
      removeEventListener: vi.fn(),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      }),
    } as unknown as HTMLCanvasElement;

    let current = { ...viewport };
    const setViewport = vi.fn((update: Partial<ViewportConfig>) => {
      current = { ...current, ...update };
    });
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
    } as unknown as NavigableViewer;

    attachNavigation(viewer, canvas, {
      wheel: false,
      drag: { button: 0, modifier: "none" },
    });

    expect(listeners.has("wheel")).toBe(false);
    expect(listeners.has("pointerdown") || listeners.has("mousedown")).toBe(
      true,
    );

    const down = listeners.get("pointerdown") || listeners.get("mousedown")!;
    const move = listeners.get("pointermove") || listeners.get("mousemove")!;

    // Drag without any modifier key pressed
    down({
      button: 0,
      clientX: 50,
      clientY: 50,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      pointerId: 1,
    } as PointerEvent);

    move({
      button: 0,
      clientX: 25,
      clientY: 50,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      pointerId: 1,
    } as PointerEvent);

    expect(setViewport).toHaveBeenCalled();
    expect(setViewport.mock.calls[0]![0]).toMatchObject({
      startTime: 5,
      endTime: 9,
    });
  });

  it("supports modifier: 'none' on attachDragNavigation directly", () => {
    const { listeners, setViewport } = setupDragNavigation({
      button: 0,
      modifier: "none",
    });

    const down = listeners.get("pointerdown") || listeners.get("mousedown")!;
    const move = listeners.get("pointermove") || listeners.get("mousemove")!;

    down({
      button: 0,
      clientX: 50,
      clientY: 50,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      pointerId: 1,
    } as PointerEvent);

    move({
      button: 0,
      clientX: 25,
      clientY: 50,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      pointerId: 1,
    } as PointerEvent);

    expect(setViewport).toHaveBeenCalled();
    expect(setViewport.mock.calls[0]![0]).toMatchObject({
      startTime: 5,
      endTime: 9,
    });
  });

  it("merges root axis and onNavigate when wheel and drag are nested objects", () => {
    const onNavigate = vi.fn();
    const listeners = new Map<string, EventListener>();
    const canvas = {
      style: { cursor: "" },
      addEventListener: vi.fn((name: string, listener: EventListener) =>
        listeners.set(name, listener),
      ),
      removeEventListener: vi.fn(),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      }),
    } as unknown as HTMLCanvasElement;

    let current = { ...viewport };
    const setViewport = vi.fn((update: Partial<ViewportConfig>) => {
      current = { ...current, ...update };
    });
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
    } as unknown as NavigableViewer;

    attachNavigation(viewer, canvas, {
      axis: "time",
      onNavigate,
      wheel: { zoomModifier: "ctrl" },
      drag: { button: 0 },
    });

    const down = listeners.get("pointerdown") || listeners.get("mousedown")!;
    const move = listeners.get("pointermove") || listeners.get("mousemove")!;

    down({ button: 0, clientX: 50, clientY: 50, pointerId: 1 } as PointerEvent);
    move({ button: 0, clientX: 25, clientY: 50, pointerId: 1 } as PointerEvent);

    expect(onNavigate).toHaveBeenCalled();
    expect(onNavigate.mock.calls[0]![0]).toMatchObject({
      startTime: 5,
      endTime: 9,
    });
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
  } as unknown as NavigableViewer;
  attachWheelNavigation(viewer, canvas);

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
  } as unknown as NavigableViewer;

  const cleanup = attachDragNavigation(viewer, canvas, options);

  return {
    listeners,
    setViewport,
    canvas,
    cleanup,
  };
}

describe("viewer attachNavigation with auto-cleanup", () => {
  const dummySource = {
    id: "test",
    sampleRate: 48000,
    duration: 20,
    channelCount: 1,
    read: () => new Float32Array(48000),
  };

  const downEvent =
    typeof window !== "undefined" && "PointerEvent" in window
      ? "pointerdown"
      : "mousedown";

  function createTestCanvas() {
    const listeners = new Map<string, Array<EventListener>>();
    return {
      width: 400,
      height: 200,
      clientWidth: 400,
      clientHeight: 200,
      style: { cursor: "" },
      addEventListener: vi.fn((name: string, fn: EventListener) => {
        const arr = listeners.get(name) ?? [];
        arr.push(fn);
        listeners.set(name, arr);
      }),
      removeEventListener: vi.fn((name: string, fn: EventListener) => {
        const arr = listeners.get(name) ?? [];
        listeners.set(
          name,
          arr.filter((f) => f !== fn),
        );
      }),
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 400,
        height: 200,
        right: 400,
        bottom: 200,
      }),
      getContext: () => null,
      listeners,
    } as unknown as HTMLCanvasElement & {
      listeners: Map<string, Array<EventListener>>;
    };
  }

  it("attaches navigation via scope.attachNavigation(canvas) and automatically cleans up on scope.destroy()", () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createTestCanvas();

    const detach = scope.attachNavigation(canvas);
    expect(typeof detach).toBe("function");

    // Wheel and drag down listeners should be attached
    expect(canvas.addEventListener).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
      { passive: false },
    );
    expect(canvas.addEventListener).toHaveBeenCalledWith(
      downEvent,
      expect.any(Function),
    );

    // Destroying scope cleans up all attached navigation listeners
    scope.destroy();
    expect(canvas.removeEventListener).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
    );
    expect(canvas.removeEventListener).toHaveBeenCalledWith(
      downEvent,
      expect.any(Function),
    );
  });

  it("attaches navigation to a wrapper div container via scope.attachNavigation(containerDiv)", () => {
    const scope = new Sonoscope({ source: dummySource });
    const containerDiv = createTestCanvas();

    const detach = scope.attachNavigation(containerDiv);
    expect(typeof detach).toBe("function");

    expect(containerDiv.addEventListener).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
      { passive: false },
    );

    scope.destroy();
    expect(containerDiv.removeEventListener).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
    );
  });

  it("allows manual detach before scope destroy", () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createTestCanvas();

    const detach = scope.attachNavigation(canvas);
    detach();

    expect(canvas.removeEventListener).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
    );
    expect(canvas.removeEventListener).toHaveBeenCalledWith(
      downEvent,
      expect.any(Function),
    );

    // Destroying after manual detach should not error
    expect(() => scope.destroy()).not.toThrow();
  });

  it("handles multiple attachNavigation calls and independent detach", () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createTestCanvas();

    const detach1 = scope.attachNavigation(canvas, {
      wheel: true,
      drag: false,
    });
    const detach2 = scope.attachNavigation(canvas, {
      wheel: false,
      drag: true,
    });

    // Detach first
    detach1();
    // Second should still be active or clean up gracefully on destroy
    expect(() => detach2()).not.toThrow();
    expect(() => scope.destroy()).not.toThrow();
  });

  it("attaches navigation for time-only axis and cleans up on destroy", () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createTestCanvas();

    const detach = scope.attachNavigation(canvas, {
      axis: "time",
    });
    expect(typeof detach).toBe("function");
    expect(canvas.addEventListener).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
      { passive: false },
    );

    scope.destroy();
    expect(canvas.removeEventListener).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
    );
  });

  it("attaches navigation for frequency-only axis and cleans up on destroy", () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createTestCanvas();

    const detach = scope.attachNavigation(canvas, {
      axis: "frequency",
    });
    expect(typeof detach).toBe("function");
    expect(canvas.addEventListener).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
      { passive: false },
    );

    scope.destroy();
    expect(canvas.removeEventListener).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
    );
  });

  it("navigates via drag and triggers onNavigate on scope.attachNavigation(canvas)", () => {
    const onNavigate = vi.fn();
    const scope = new Sonoscope({
      source: dummySource,
      startTime: 4,
      endTime: 8,
    });
    const canvas = createTestCanvas();

    scope.attachNavigation(canvas, {
      axis: "time",
      onNavigate,
    });

    const listeners = canvas.listeners;
    const down = listeners.get(downEvent)![0]!;
    const moveEvent =
      typeof window !== "undefined" && "PointerEvent" in window
        ? "pointermove"
        : "mousemove";
    const move = listeners.get(moveEvent)![0]!;

    down({
      button: 0,
      clientX: 50,
      clientY: 50,
      pointerId: 1,
    } as unknown as PointerEvent);
    move({
      button: 0,
      clientX: 25,
      clientY: 50,
      pointerId: 1,
    } as unknown as PointerEvent);

    expect(onNavigate).toHaveBeenCalled();
    expect(scope.getViewport().startTime).toBeGreaterThan(4);
    scope.destroy();
  });
});
