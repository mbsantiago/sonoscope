import { describe, expect, it, vi } from "vitest";
import {
  createCustomViewportController,
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
} {
  let listeners: Array<
    (event: { viewport: { startTime: number; endTime: number } }) => void
  > = [];
  const viewer: ITimeBoundViewer & {
    currentVp: { startTime: number; endTime: number };
    emit: (vp: { startTime: number; endTime: number }) => void;
  } = {
    currentVp: { ...initialVp },
    getViewport: () => viewer.currentVp,
    updateViewport: (vp: Partial<{ startTime: number; endTime: number }>) => {
      viewer.currentVp = { ...viewer.currentVp, ...vp };
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
  };
  return viewer;
}

describe("ViewportController", () => {
  it("initializes with default clamped viewport", () => {
    const ctrl = new ViewportController({
      totalDuration: 20,
      startTime: 0,
      endTime: 5,
    });

    expect(ctrl.getViewport()).toEqual({
      startTime: 0,
      endTime: 5,
      duration: 5,
      totalDuration: 20,
    });
  });

  it("zooms and pans cleanly within total duration bounds", () => {
    const ctrl = new ViewportController({
      totalDuration: 20,
      startTime: 2,
      endTime: 6,
    });

    const onChange = vi.fn();
    ctrl.on("change", onChange);

    ctrl.zoom(0.5, 4); // zoom 2x centered at 4s -> duration 2s -> [3, 5]
    expect(ctrl.getViewport().startTime).toBeCloseTo(3);
    expect(ctrl.getViewport().endTime).toBeCloseTo(5);
    expect(onChange).toHaveBeenCalledTimes(1);

    ctrl.pan(2); // pan +2s -> [5, 7]
    expect(ctrl.getViewport().startTime).toBeCloseTo(5);
    expect(ctrl.getViewport().endTime).toBeCloseTo(7);
  });

  it("handles page follow mode on playback", () => {
    const audio = {
      currentTime: 0,
      paused: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    const ctrl = new ViewportController({
      totalDuration: 30,
      startTime: 0,
      endTime: 5,
      followPlayback: "page",
      audio,
    });

    // When audio time crosses 5.2s, viewport should page forward to [5.2, 10.2]
    audio.currentTime = 5.2;
    ctrl.attachAudio(audio);

    expect(ctrl.getViewport().startTime).toBeCloseTo(5.2);
    expect(ctrl.getViewport().endTime).toBeCloseTo(10.2);
  });

  it("handles smooth center follow mode on playback", () => {
    const audio = {
      currentTime: 0,
      paused: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    const ctrl = new ViewportController({
      totalDuration: 30,
      startTime: 0,
      endTime: 6, // 6s duration, center is 3s from start
      followPlayback: "smooth",
      smoothAnchor: 0.5,
      audio,
    });

    // When audio is at 10s, viewport with duration 6s centered should be [7, 13]
    audio.currentTime = 10;
    ctrl.attachAudio(audio);

    expect(ctrl.getViewport().startTime).toBeCloseTo(7);
    expect(ctrl.getViewport().endTime).toBeCloseTo(13);
  });

  it("binds multiple viewers and propagates updates in both directions", () => {
    const viewerA = createMockViewer({ startTime: 0, endTime: 10 });
    const viewerB = createMockViewer({ startTime: 0, endTime: 10 });

    const ctrl = new ViewportController({
      totalDuration: 30,
      startTime: 2,
      endTime: 8,
    });

    ctrl.bind(viewerA);
    ctrl.bind(viewerB);

    // Initial sync from controller to viewers
    expect(viewerA.currentVp).toEqual({ startTime: 2, endTime: 8 });
    expect(viewerB.currentVp).toEqual({ startTime: 2, endTime: 8 });

    // Controller updates both viewers
    ctrl.updateViewport({ startTime: 4, endTime: 12 });
    expect(viewerA.currentVp).toEqual({ startTime: 4, endTime: 12 });
    expect(viewerB.currentVp).toEqual({ startTime: 4, endTime: 12 });

    // User interacts with viewerA -> updates controller and viewerB
    viewerA.emit({ startTime: 6, endTime: 14 });
    expect(ctrl.getViewport().startTime).toBe(6);
    expect(ctrl.getViewport().endTime).toBe(14);
    expect(viewerB.currentVp).toEqual({ startTime: 6, endTime: 14 });
  });

  it("linkViewports coordinator cleanly links and unlinks viewers", () => {
    const viewerA = createMockViewer();
    const viewerB = createMockViewer();

    const { controller, unlink } = linkViewports([viewerA, viewerB], {
      totalDuration: 20,
      startTime: 1,
      endTime: 5,
    });

    expect(viewerA.currentVp).toEqual({ startTime: 1, endTime: 5 });
    expect(viewerB.currentVp).toEqual({ startTime: 1, endTime: 5 });

    unlink();

    // After unlinking, updates to controller do not affect viewerA
    controller.updateViewport({ startTime: 10, endTime: 15 });
    expect(viewerA.currentVp).toEqual({ startTime: 1, endTime: 5 });
  });

  it("supports user-defined custom viewport controller via createCustomViewportController", () => {
    let externalState = { startTime: 0, endTime: 4 };
    const listeners = new Set<
      (vp: { startTime: number; endTime: number }) => void
    >();

    const customController = createCustomViewportController({
      getViewport: () => ({ ...externalState, totalDuration: 50 }),
      setViewport: (next) => {
        externalState = next;
        for (const cb of listeners) cb(externalState);
      },
      subscribe: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    });

    const viewer = createMockViewer();
    customController.bind(viewer);

    // Initial sync
    expect(viewer.currentVp).toEqual({ startTime: 0, endTime: 4 });

    // When external state updates, viewer updates
    externalState = { startTime: 5, endTime: 10 };
    for (const cb of listeners) cb(externalState);
    expect(viewer.currentVp).toEqual({ startTime: 5, endTime: 10 });

    // When viewer moves, external store updates
    viewer.emit({ startTime: 12, endTime: 18 });
    expect(externalState).toEqual({ startTime: 12, endTime: 18 });
  });
});
