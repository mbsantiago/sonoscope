import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachCanvasNavigation, panViewportTime, zoomViewportTime } from './navigation';
import type { SpectrogramViewer } from './viewer';
import type { ViewportConfig } from './types';

const viewport: ViewportConfig = { startTime: 4, endTime: 8, minFrequency: 0, maxFrequency: 1000, frequencyScale: 'linear' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('navigation utilities', () => {
  it('pans time while preserving viewport duration and source bounds', () => {
    expect(panViewportTime(viewport, { startTime: 0, endTime: 10 }, 3)).toMatchObject({ startTime: 6, endTime: 10 });
    expect(panViewportTime(viewport, { startTime: 0, endTime: 10 }, -10)).toMatchObject({ startTime: 0, endTime: 4 });
  });

  it('zooms around a time anchor', () => {
    expect(zoomViewportTime(viewport, { startTime: 0, endTime: 20 }, 5, 0.5)).toMatchObject({ startTime: 4.5, endTime: 6.5 });
  });

  it('keeps an off-center time anchor under the same cursor ratio after zooming', () => {
    const anchorTime = 5;
    const ratioBefore = (anchorTime - viewport.startTime) / (viewport.endTime - viewport.startTime);
    const next = zoomViewportTime(viewport, { startTime: 0, endTime: 20 }, anchorTime, 0.5);
    const ratioAfter = (anchorTime - next.startTime) / (next.endTime - next.startTime);

    expect(ratioAfter).toBeCloseTo(ratioBefore, 12);
  });

  it('does not shift sideways when zooming out at maximum duration', () => {
    const fullViewport: ViewportConfig = { ...viewport, startTime: 0, endTime: 20 };

    expect(zoomViewportTime(fullViewport, { startTime: 0, endTime: 20, maxDurationSeconds: 20 }, 4, 2)).toEqual(fullViewport);
  });

  it('does not shift sideways when zooming in at minimum duration', () => {
    const tinyViewport: ViewportConfig = { ...viewport, startTime: 4, endTime: 4.5 };

    expect(zoomViewportTime(tinyViewport, { startTime: 0, endTime: 20, minDurationSeconds: 0.5 }, 4.4, 0.5)).toEqual(tinyViewport);
  });

  it('coalesces wheel navigation to one viewport update per animation frame', () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const listeners = new Map<string, EventListener>();
    const canvas = {
      addEventListener: vi.fn((name: string, listener: EventListener) => listeners.set(name, listener)),
      removeEventListener: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    } as unknown as HTMLCanvasElement;
    const setViewport = vi.fn((update: Partial<ViewportConfig>) => {
      current = { ...current, ...update };
    });
    let current = { ...viewport };
    const viewer = {
      getConfig: () => ({ canvas, source: { duration: 20 } }),
      getViewport: () => current,
      setViewport,
      requestRender: vi.fn(),
      canvasToTimeFrequency: () => ({ time: 6, frequency: 100 }),
    } as unknown as SpectrogramViewer;
    attachCanvasNavigation(viewer, canvas);
    const wheel = listeners.get('wheel')!;

    wheel({ preventDefault: vi.fn(), deltaY: 120, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, clientX: 10, clientY: 10 } as unknown as WheelEvent);
    wheel({ preventDefault: vi.fn(), deltaY: 240, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, clientX: 10, clientY: 10 } as unknown as WheelEvent);
    expect(setViewport).not.toHaveBeenCalled();

    frame!(0);

    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(setViewport.mock.calls[0]![0].startTime).toBeGreaterThan(viewport.startTime);
  });

  it('uses plain wheel for horizontal time panning by default', () => {
    const { runFrame, setViewport, wheel } = setupWheelNavigation();

    wheel({ preventDefault: vi.fn(), deltaY: 120, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, clientX: 10, clientY: 10 } as unknown as WheelEvent);
    runFrame();

    expect(setViewport.mock.calls[0]![0]).toMatchObject({ startTime: 5.846153846153847, endTime: 9.846153846153847 });
  });

  it('uses ctrl wheel for cursor-centered time zoom by default', () => {
    const { runFrame, setViewport, wheel } = setupWheelNavigation();

    wheel({ preventDefault: vi.fn(), deltaY: -120, shiftKey: false, ctrlKey: true, altKey: false, metaKey: false, clientX: 10, clientY: 10 } as unknown as WheelEvent);
    runFrame();

    expect(setViewport.mock.calls[0]![0].startTime).toBeCloseTo(4.107029704093033, 12);
    expect(setViewport.mock.calls[0]![0].endTime).toBeCloseTo(7.892970295906968, 12);
  });
});

function setupWheelNavigation() {
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const listeners = new Map<string, EventListener>();
  const canvas = {
    addEventListener: vi.fn((name: string, listener: EventListener) => listeners.set(name, listener)),
    removeEventListener: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  } as unknown as HTMLCanvasElement;
  const setViewport = vi.fn((update: Partial<ViewportConfig>) => {
    current = { ...current, ...update };
  });
  let current = { ...viewport };
  const viewer = {
    getConfig: () => ({ canvas, source: { duration: 20 } }),
    getViewport: () => current,
    setViewport,
    requestRender: vi.fn(),
    canvasToTimeFrequency: () => ({ time: 6, frequency: 100 }),
  } as unknown as SpectrogramViewer;
  attachCanvasNavigation(viewer, canvas);

  return { runFrame: () => frame!(0), setViewport, wheel: listeners.get('wheel')! };
}
