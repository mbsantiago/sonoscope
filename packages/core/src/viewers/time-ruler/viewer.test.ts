import { describe, expect, it, vi } from "vitest";
import { Sonoscope } from "../../sonoscope";
import { TimeRulerViewer } from "./viewer";

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
    const canvas = createMockCanvas();
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

  it("converts between canvas coordinates and time accurately", () => {
    const scope = new Sonoscope({
      source: dummySource,
      startTime: 10,
      endTime: 20,
    });
    const canvas = createMockCanvas();
    const viewer = scope.createTimeRuler(canvas);

    expect(viewer.canvasToTime(0)).toBe(10);
    expect(viewer.canvasToTime(300)).toBe(15);
    expect(viewer.canvasToTime(600)).toBe(20);

    expect(viewer.timeToCanvas(10)).toBe(0);
    expect(viewer.timeToCanvas(15)).toBe(300);
    expect(viewer.timeToCanvas(20)).toBe(600);
  });

  it("supports updating config and switching programs", async () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createMockCanvas();
    const viewer = scope.createTimeRuler(canvas);

    viewer.updateConfig({ program: "boxes", color: "#38bdf8" });
    expect(viewer.getConfig().program).toBe("boxes");
    expect(viewer.getConfig().color).toBe("#38bdf8");

    await viewer.render();
    expect(viewer.getStatus().state).toBe("ready");
  });

  it("keeps viewport state outside the time ruler configuration", () => {
    const scope = new Sonoscope({
      source: dummySource,
      startTime: 10,
      endTime: 20,
      minDuration: 0.5,
      maxDuration: 30,
    });
    const viewer = scope.createTimeRuler(createMockCanvas(), {
      color: "#ffffff",
    });

    expect(viewer.getConfig()).not.toHaveProperty("startTime");
    expect(viewer.getConfig()).not.toHaveProperty("endTime");
    expect(viewer.getConfig()).not.toHaveProperty("minViewportDuration");
    expect(viewer.getConfig()).not.toHaveProperty("maxViewportDuration");

    viewer.updateConfig({ color: "#38bdf8" });

    expect(viewer.getViewport()).toEqual({ startTime: 10, endTime: 20 });
  });
});
