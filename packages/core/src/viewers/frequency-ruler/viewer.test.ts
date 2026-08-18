import { describe, expect, it, vi } from "vitest";
import { Sonoscope } from "../../sonoscope";
import { FrequencyRulerViewer } from "./viewer";

function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 60,
    height: 400,
    getBoundingClientRect: () => ({ width: 60, height: 400 }),
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

describe("FrequencyRulerViewer", () => {
  const dummySource = {
    id: "dummy",
    sampleRate: 48000,
    duration: 60,
    channelCount: 1,
    read: vi.fn(),
  };

  it("creates FrequencyRulerViewer and renders automatically on viewport changes", async () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createMockCanvas();
    const viewer = scope.createFrequencyRuler(canvas, {
      program: "ticks",
      frequencyScale: "mel",
      color: "#ffffff",
    });

    expect(viewer).toBeInstanceOf(FrequencyRulerViewer);
    expect(viewer.getConfig().frequencyScale).toBe("mel");

    await viewer.render();
    expect(viewer.getStatus().state).toBe("ready");

    viewer.destroy();
    expect(viewer.getStatus().state).toBe("destroyed");
  });

  it("converts between canvas coordinates and frequency", () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createMockCanvas();
    const viewer = scope.createFrequencyRuler(canvas, {
      minFrequency: 0,
      maxFrequency: 20000,
      frequencyScale: "linear",
    });

    expect(viewer.canvasToFrequency(400)).toBeCloseTo(0);
    expect(viewer.canvasToFrequency(0)).toBeCloseTo(20000);
    expect(viewer.canvasToFrequency(200)).toBeCloseTo(10000);

    expect(viewer.frequencyToCanvas(0)).toBeCloseTo(400);
    expect(viewer.frequencyToCanvas(20000)).toBeCloseTo(0);
  });

  it("supports updating config and switching frequency scale", async () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createMockCanvas();
    const viewer = scope.createFrequencyRuler(canvas);

    viewer.updateConfig({ frequencyScale: "log", minFrequency: 20, maxFrequency: 20000 });
    expect(viewer.getConfig().frequencyScale).toBe("log");
    expect(viewer.getViewport().frequencyScale).toBe("log");

    await viewer.render();
    expect(viewer.getStatus().state).toBe("ready");
  });

  it("synchronizes viewport with Sonoscope global scope", () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createMockCanvas();
    const viewer = scope.createFrequencyRuler(canvas, {
      minFrequency: 0,
      maxFrequency: 20000,
    });

    // 1. Viewer updating viewport updates global scope
    viewer.setViewport({ minFrequency: 500, maxFrequency: 8000 });
    expect(scope.getViewport().minFrequency).toBe(500);
    expect(scope.getViewport().maxFrequency).toBe(8000);

    // 2. Scope updating viewport updates viewer
    scope.setViewport({ minFrequency: 200, maxFrequency: 5000 });
    expect(viewer.getViewport().minFrequency).toBe(200);
    expect(viewer.getViewport().maxFrequency).toBe(5000);
  });
});
