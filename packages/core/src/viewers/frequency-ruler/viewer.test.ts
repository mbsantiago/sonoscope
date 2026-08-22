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
    const scope = new Sonoscope({
      source: dummySource,
      minFrequency: 0,
      maxFrequency: 20_000,
    });
    const canvas = createMockCanvas();
    const viewer = scope.createFrequencyRuler(canvas, {
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

    viewer.updateConfig({
      frequencyScale: "log",
    });
    expect(viewer.getConfig().frequencyScale).toBe("log");
    expect(viewer.getViewport().frequencyScale).toBe("log");

    await viewer.render();
    expect(viewer.getStatus().state).toBe("ready");
  });

  it("synchronizes viewport with Sonoscope global scope", () => {
    const scope = new Sonoscope({
      source: dummySource,
      minFrequency: 0,
      maxFrequency: 20_000,
    });
    const canvas = createMockCanvas();
    const viewer = scope.createFrequencyRuler(canvas);

    // Scope updating viewport updates viewer
    scope.setViewport({ minFrequency: 200, maxFrequency: 5000 });
    expect(viewer.getViewport().minFrequency).toBe(200);
    expect(viewer.getViewport().maxFrequency).toBe(5000);
  });

  it("keeps multiple attached viewers in sync via source frequency methods", () => {
    const scope = new Sonoscope({
      source: dummySource,
      minFrequency: 0,
      maxFrequency: 20000,
    });
    const canvas1 = createMockCanvas();
    const canvas2 = createMockCanvas();

    const ruler1 = scope.createFrequencyRuler(canvas1);
    const ruler2 = scope.createFrequencyRuler(canvas2);

    expect(ruler1.getViewport().maxFrequency).toBe(20000);
    expect(ruler2.getViewport().maxFrequency).toBe(20000);

    // Zoom frequency on scope
    scope.zoomFrequency(0.5, 10000);
    expect(ruler1.getViewport().minFrequency).toBe(
      scope.getViewport().minFrequency,
    );
    expect(ruler1.getViewport().maxFrequency).toBe(
      scope.getViewport().maxFrequency,
    );
    expect(ruler2.getViewport().minFrequency).toBe(
      scope.getViewport().minFrequency,
    );
    expect(ruler2.getViewport().maxFrequency).toBe(
      scope.getViewport().maxFrequency,
    );

    // Pan frequency on scope
    scope.panFrequency(500);
    expect(ruler1.getViewport().minFrequency).toBe(
      scope.getViewport().minFrequency,
    );
    expect(ruler2.getViewport().minFrequency).toBe(
      scope.getViewport().minFrequency,
    );
  });

  it("keeps frequency bounds outside the ruler configuration", () => {
    const scope = new Sonoscope({
      source: dummySource,
      minFrequency: 100,
      maxFrequency: 12_000,
    });
    const viewer = scope.createFrequencyRuler(createMockCanvas(), {
      frequencyScale: "mel",
    });

    expect(viewer.getConfig()).not.toHaveProperty("minFrequency");
    expect(viewer.getConfig()).not.toHaveProperty("maxFrequency");

    viewer.updateConfig({ frequencyScale: "log" });

    expect(viewer.getViewport()).toEqual({
      minFrequency: 100,
      maxFrequency: 12_000,
      frequencyScale: "log",
    });
  });
});
