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
});
