import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachAutoResize } from "./auto-resize";

describe("attachAutoResize", () => {
  let observedElements: Element[] = [];
  let observerCallback: ResizeObserverCallback;
  let disconnectCalled = false;

  beforeEach(() => {
    observedElements = [];
    disconnectCalled = false;

    class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        observerCallback = cb;
      }
      observe(el: Element) {
        observedElements.push(el);
      }
      unobserve() {}
      disconnect() {
        disconnectCalled = true;
      }
    }

    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    delete (globalThis as Partial<typeof globalThis>).devicePixelRatio;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("observes the canvas and updates buffer dimensions on resize entry", () => {
    const canvas = {
      width: 300,
      height: 150,
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
    } as unknown as HTMLCanvasElement;

    const onResize = vi.fn();
    const cleanup = attachAutoResize(canvas, { onResize, devicePixelRatio: 1 });

    expect(observedElements).toContain(canvas);

    // Simulate resize event
    observerCallback(
      [
        {
          target: canvas,
          contentRect: { width: 800, height: 400 } as DOMRectReadOnly,
        } as unknown as ResizeObserverEntry,
      ],
      {} as ResizeObserver,
    );

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(400);
    expect(onResize).toHaveBeenCalledWith(800, 400);

    cleanup();
    expect(disconnectCalled).toBe(true);
  });

  it("applies devicePixelRatio when enabled", () => {
    globalThis.devicePixelRatio = 2;

    const canvas = {
      width: 300,
      height: 150,
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
    } as unknown as HTMLCanvasElement;

    const onResize = vi.fn();
    attachAutoResize(canvas, { onResize, devicePixelRatio: true });

    observerCallback(
      [
        {
          target: canvas,
          contentRect: { width: 500, height: 250 } as DOMRectReadOnly,
        } as unknown as ResizeObserverEntry,
      ],
      {} as ResizeObserver,
    );

    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(500);
    expect(onResize).toHaveBeenCalledWith(1000, 500);
  });

  it("performs initial size check if canvas already has bounds", () => {
    const canvas = {
      width: 300,
      height: 150,
      getBoundingClientRect: () => ({ width: 600, height: 300 }),
    } as unknown as HTMLCanvasElement;

    const onResize = vi.fn();
    attachAutoResize(canvas, { onResize, devicePixelRatio: 1 });

    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(300);
    expect(onResize).toHaveBeenCalledWith(600, 300);
  });
});
