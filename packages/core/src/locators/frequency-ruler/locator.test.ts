import { describe, expect, it, vi } from "vitest";
import { Sonoscope } from "../../sonoscope";
import { FrequencyRulerLocator } from "./locator";

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

describe("FrequencyRulerLocator", () => {
  const dummySource = {
    id: "dummy",
    sampleRate: 48000,
    duration: 60,
    channelCount: 1,
    read: vi.fn(async () => new Float32Array(0)),
  };

  it("creates FrequencyRulerLocator and renders automatically on viewport changes", async () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createMockCanvas();
    const locator = scope.createFrequencyRuler(canvas, {
      renderer: "ticks",
      frequencyScale: "mel",
      color: "#ffffff",
    });

    expect(locator).toBeInstanceOf(FrequencyRulerLocator);
    expect(locator.getConfig().frequencyScale).toBe("mel");

    await locator.render();
    expect(locator.getStatus().state).toBe("ready");

    locator.destroy();
    expect(locator.getStatus().state).toBe("destroyed");
  });

  it("converts between canvas coordinates and frequency", () => {
    const scope = new Sonoscope({
      source: dummySource,
      minFrequency: 0,
      maxFrequency: 20_000,
    });
    const canvas = createMockCanvas();
    const locator = scope.createFrequencyRuler(canvas, {
      frequencyScale: "linear",
    });

    expect(locator.canvasToFrequency(400)).toBeCloseTo(0);
    expect(locator.canvasToFrequency(0)).toBeCloseTo(20000);
    expect(locator.canvasToFrequency(200)).toBeCloseTo(10000);

    expect(locator.frequencyToCanvas(0)).toBeCloseTo(400);
    expect(locator.frequencyToCanvas(20000)).toBeCloseTo(0);
  });

  it("supports updating config and switching frequency scale", async () => {
    const scope = new Sonoscope({ source: dummySource });
    const canvas = createMockCanvas();
    const locator = scope.createFrequencyRuler(canvas);

    locator.updateConfig({
      frequencyScale: "log",
    });
    expect(locator.getConfig().frequencyScale).toBe("log");
    expect(locator.getViewport().frequencyScale).toBe("log");

    await locator.render();
    expect(locator.getStatus().state).toBe("ready");
  });

  it("synchronizes viewport with Sonoscope global scope", () => {
    const scope = new Sonoscope({
      source: dummySource,
      minFrequency: 0,
      maxFrequency: 20_000,
    });
    const canvas = createMockCanvas();
    const locator = scope.createFrequencyRuler(canvas);

    // Scope updating viewport updates locator
    scope.setViewport({ minFrequency: 200, maxFrequency: 5000 });
    expect(locator.getViewport().minFrequency).toBe(200);
    expect(locator.getViewport().maxFrequency).toBe(5000);
  });

  it("keeps multiple attached locators in sync via source frequency methods", () => {
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
    const locator = scope.createFrequencyRuler(createMockCanvas(), {
      frequencyScale: "mel",
    });

    expect(locator.getConfig()).not.toHaveProperty("minFrequency");
    expect(locator.getConfig()).not.toHaveProperty("maxFrequency");

    locator.updateConfig({ frequencyScale: "log" });

    expect(locator.getViewport()).toEqual({
      minFrequency: 100,
      maxFrequency: 12_000,
      frequencyScale: "log",
    });
  });

  it("follows source metadata through the viewport without reading samples", async () => {
    const source = {
      ...dummySource,
      read: vi.fn(async () => new Float32Array(0)),
    };
    const scope = new Sonoscope({ source });
    const locator = scope.createFrequencyRuler(createMockCanvas());
    const renderComplete = vi.fn();
    locator.on("rendercomplete", renderComplete);

    scope.setSource({ ...source, sampleRate: 32_000 });
    await vi.waitFor(() => expect(renderComplete).toHaveBeenCalled());
    expect(locator.getViewport().maxFrequency).toBe(16_000);
    expect(source.read).not.toHaveBeenCalled();
    locator.destroy();
    scope.destroy();
  });
});
