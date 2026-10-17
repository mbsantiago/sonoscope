import { describe, expect, it, vi } from "vitest";
import { Sonoscope } from "../../sonoscope";
import { TimeRulerLocator } from "./locator";

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

describe("TimeRulerLocator", () => {
  const dummySource = {
    id: "dummy",
    sampleRate: 44100,
    duration: 60,
    channelCount: 1,
    read: vi.fn(async () => new Float32Array(0)),
  };

  it("creates TimeRulerLocator and renders automatically on viewport changes", async () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createMockCanvas();
    const locator = scope.createTimeRuler(canvas, {
      renderer: "ticks",
      color: "#ffffff",
    });

    expect(locator).toBeInstanceOf(TimeRulerLocator);
    expect(locator.getConfig().renderer).toBe("ticks");

    await locator.render();
    expect(locator.getStatus().state).toBe("ready");

    scope.setViewport({ startTime: 5, endTime: 15 });
    expect(locator.getViewport().startTime).toBe(5);
    expect(locator.getViewport().endTime).toBe(15);

    locator.destroy();
    expect(locator.getStatus().state).toBe("destroyed");
  });

  it("converts between canvas coordinates and time accurately", () => {
    const scope = new Sonoscope({
      source: dummySource,
      startTime: 10,
      endTime: 20,
    });
    const canvas = createMockCanvas();
    const locator = scope.createTimeRuler(canvas);

    expect(locator.canvasToTime(0)).toBe(10);
    expect(locator.canvasToTime(300)).toBe(15);
    expect(locator.canvasToTime(600)).toBe(20);

    expect(locator.timeToCanvas(10)).toBe(0);
    expect(locator.timeToCanvas(15)).toBe(300);
    expect(locator.timeToCanvas(20)).toBe(600);
  });

  it("supports updating config and switching programs", async () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createMockCanvas();
    const locator = scope.createTimeRuler(canvas);

    locator.updateConfig({ renderer: "boxes", color: "#38bdf8" });
    expect(locator.getConfig().renderer).toBe("boxes");
    expect(locator.getConfig().color).toBe("#38bdf8");

    await locator.render();
    expect(locator.getStatus().state).toBe("ready");
  });

  it("keeps viewport state outside the time ruler configuration", () => {
    const scope = new Sonoscope({
      source: dummySource,
      startTime: 10,
      endTime: 20,
      minDuration: 0.5,
      maxDuration: 30,
    });
    const locator = scope.createTimeRuler(createMockCanvas(), {
      color: "#ffffff",
    });

    expect(locator.getConfig()).not.toHaveProperty("startTime");
    expect(locator.getConfig()).not.toHaveProperty("endTime");
    expect(locator.getConfig()).not.toHaveProperty("minViewportDuration");
    expect(locator.getConfig()).not.toHaveProperty("maxViewportDuration");

    locator.updateConfig({ color: "#38bdf8" });

    expect(locator.getViewport()).toEqual({ startTime: 10, endTime: 20 });
  });

  it("follows viewport navigation without reading from the audio source", async () => {
    const source = {
      ...dummySource,
      read: vi.fn(async () => new Float32Array(0)),
    };
    const scope = new Sonoscope({ source });
    const locator = scope.createTimeRuler(createMockCanvas());
    const renderComplete = vi.fn();
    locator.on("rendercomplete", renderComplete);

    locator.setViewport({ startTime: 5, endTime: 15 });
    await vi.waitFor(() => expect(renderComplete).toHaveBeenCalled());
    expect(locator.getViewport()).toEqual({ startTime: 5, endTime: 15 });
    expect(source.read).not.toHaveBeenCalled();

    locator.destroy();
    renderComplete.mockClear();
    scope.setViewport({ startTime: 10, endTime: 20 });
    expect(renderComplete).not.toHaveBeenCalled();
    scope.destroy();
  });
});
