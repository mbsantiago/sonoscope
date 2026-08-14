import { describe, expect, it, vi } from "vitest";
import {
  type ITimeBoundViewer,
  linkViewports,
  ViewportController,
} from "./viewport-controller";

function createMockViewer(
  initialVp: { startTime: number; endTime: number } = {
    startTime: 0,
    endTime: 10,
  },
): ITimeBoundViewer & {
  currentVp: { startTime: number; endTime: number };
  emit: (vp: { startTime: number; endTime: number }) => void;
  listenerCount: () => number;
} {
  let listeners: Array<
    (event: { viewport: { startTime: number; endTime: number } }) => void
  > = [];
  const viewer = {
    currentVp: { ...initialVp },
    getViewport: () => viewer.currentVp,
    updateViewport: (vp: Partial<{ startTime: number; endTime: number }>) => {
      viewer.currentVp = { ...viewer.currentVp, ...vp };
      // Simulate real viewer emitting viewportchange synchronously on change
      for (const listener of listeners) {
        listener({ viewport: viewer.currentVp });
      }
    },
    on: (
      _name: "viewportchange",
      handler: (event: {
        viewport: { startTime: number; endTime: number };
      }) => void,
    ) => {
      listeners.push(handler);
      return () => {
        listeners = listeners.filter((l) => l !== handler);
      };
    },
    emit: (vp: { startTime: number; endTime: number }) => {
      viewer.currentVp = { ...viewer.currentVp, ...vp };
      for (const listener of listeners) {
        listener({ viewport: viewer.currentVp });
      }
    },
    listenerCount: () => listeners.length,
  };
  return viewer;
}

describe("ViewportController Edge Cases & Stress Tests", () => {
  it("prevents infinite echo loops when viewers emit viewportchange synchronously inside updateViewport", () => {
    const viewerA = createMockViewer({ startTime: 0, endTime: 10 });
    const viewerB = createMockViewer({ startTime: 0, endTime: 10 });

    const ctrl = new ViewportController({
      totalDuration: 50,
      startTime: 0,
      endTime: 10,
    });

    ctrl.bind(viewerA);
    ctrl.bind(viewerB);

    const changeSpy = vi.fn();
    ctrl.on("change", changeSpy);

    // Update Viewer A - this should update Viewer B and Controller without infinite recursion
    viewerA.updateViewport({ startTime: 5, endTime: 15 });

    expect(ctrl.getViewport().startTime).toBe(5);
    expect(ctrl.getViewport().endTime).toBe(15);
    expect(viewerB.currentVp).toEqual({ startTime: 5, endTime: 15 });

    // Should broadcast cleanly without runaway call counts
    expect(changeSpy.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("handles extreme, non-finite, and invalid numeric inputs gracefully", () => {
    const ctrl = new ViewportController({
      totalDuration: 20,
      minDuration: 0.1,
      maxDuration: 10,
      startTime: 2,
      endTime: 6,
    });

    // NaN input
    ctrl.updateViewport({ startTime: Number.NaN, endTime: 8 });
    expect(Number.isFinite(ctrl.getViewport().startTime)).toBe(true);
    expect(Number.isFinite(ctrl.getViewport().endTime)).toBe(true);

    // Negative zoom factor or NaN
    ctrl.zoom(-2);
    expect(ctrl.getViewport().duration).toBeGreaterThan(0);
    ctrl.zoom(Number.NaN);
    expect(ctrl.getViewport().duration).toBeGreaterThan(0);

    // Infinity pan
    ctrl.pan(Number.POSITIVE_INFINITY);
    expect(ctrl.getViewport().endTime).toBeLessThanOrEqual(20);

    // Inverted range: startTime > endTime
    ctrl.updateViewport({ startTime: 15, endTime: 5 });
    expect(ctrl.getViewport().startTime).toBeLessThan(
      ctrl.getViewport().endTime,
    );
  });

  it("handles rapid concurrent stress updates without desyncing", () => {
    const viewerA = createMockViewer();
    const viewerB = createMockViewer();

    const { controller } = linkViewports([viewerA, viewerB], {
      totalDuration: 100,
      startTime: 0,
      endTime: 10,
    });

    // Simulate 500 rapid random pan/zoom actions from both viewers and controller
    for (let i = 0; i < 500; i++) {
      const mode = i % 3;
      const start = (i * 0.17) % 80;
      const end = start + 5 + (i % 10);

      if (mode === 0) {
        controller.updateViewport({ startTime: start, endTime: end });
      } else if (mode === 1) {
        viewerA.updateViewport({ startTime: start, endTime: end });
      } else {
        viewerB.updateViewport({ startTime: start, endTime: end });
      }

      // Check invariants at every step
      expect(viewerA.currentVp.startTime).toBeCloseTo(
        viewerB.currentVp.startTime,
        4,
      );
      expect(viewerA.currentVp.endTime).toBeCloseTo(
        viewerB.currentVp.endTime,
        4,
      );
      expect(controller.getViewport().startTime).toBeCloseTo(
        viewerA.currentVp.startTime,
        4,
      );
    }
  });

  it("handles viewer unbinding or destruction during an active broadcast callback", () => {
    const viewerA = createMockViewer();
    const viewerB = createMockViewer();
    const viewerC = createMockViewer();

    const ctrl = new ViewportController({ totalDuration: 30 });
    ctrl.bind(viewerA);
    const unbindB = ctrl.bind(viewerB);
    ctrl.bind(viewerC);

    // Viewer B unbinds itself when it receives a change
    viewerB.updateViewport = vi.fn((_vp) => {
      unbindB();
    });

    expect(() => {
      ctrl.updateViewport({ startTime: 2, endTime: 8 });
    }).not.toThrow();

    expect(viewerA.currentVp).toEqual({ startTime: 2, endTime: 8 });
    expect(viewerC.currentVp).toEqual({ startTime: 2, endTime: 8 });
  });

  it("handles playback follow with rapid looping and reverse seeking", () => {
    const audio = {
      currentTime: 0,
      paused: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    const ctrl = new ViewportController({
      totalDuration: 60,
      startTime: 0,
      endTime: 10,
      followPlayback: "page",
      audio,
    });

    // 1. Play forward past page boundary (10s) -> jump to [12, 22]
    audio.currentTime = 12;
    ctrl.attachAudio(audio);
    expect(ctrl.getViewport().startTime).toBeCloseTo(12);
    expect(ctrl.getViewport().endTime).toBeCloseTo(22);

    // 2. Loop / seek back to 2s -> jump back to [2, 12]
    audio.currentTime = 2;
    ctrl.attachAudio(audio);
    expect(ctrl.getViewport().startTime).toBeCloseTo(2);
    expect(ctrl.getViewport().endTime).toBeCloseTo(12);

    // 3. Jump to near the very end of track (58s with 60s total duration)
    audio.currentTime = 58;
    ctrl.attachAudio(audio);
    expect(ctrl.getViewport().endTime).toBeCloseTo(60);
    expect(ctrl.getViewport().startTime).toBeCloseTo(50);
  });

  it("handles extremely short duration audio sources", () => {
    const ctrl = new ViewportController({
      totalDuration: 0.02,
      minDuration: 0.005,
      maxDuration: 0.02,
      startTime: 0,
      endTime: 0.02,
    });

    expect(ctrl.getViewport().totalDuration).toBe(0.02);
    expect(ctrl.getViewport().startTime).toBe(0);
    expect(ctrl.getViewport().endTime).toBe(0.02);

    // Zooming out further than total duration stays clamped
    ctrl.zoom(5);
    expect(ctrl.getViewport().endTime).toBe(0.02);
  });
});
