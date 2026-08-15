import type { AudioSource } from "../../types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sonoscope } from "../../sonoscope";
import { WaveformViewer } from "./viewer";

function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 200,
    height: 80,
    getBoundingClientRect: () => ({ width: 200, height: 80 }),
    getContext: (type?: string) => {
      if (type === "webgl2") return null;
      return {
        save: vi.fn(),
        restore: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
      };
    },
  } as unknown as HTMLCanvasElement;
}

const dummySource: AudioSource = {
  id: "test-source",
  sampleRate: 1000,
  duration: 10,
  channelCount: 1,
  read: ({ startTime, endTime }) => {
    const start = Math.floor(startTime * 1000);
    const end = Math.floor(endTime * 1000);
    const count = Math.max(0, end - start);
    const data = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      data[i] = Math.sin((start + i) * 0.1);
    }
    return data;
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WaveformViewer", () => {
  it("creates and renders a waveform from AudioSource", async () => {
    const canvas = createMockCanvas();
    const scope = new Sonoscope({
      source: dummySource,
      startTime: 0,
      endTime: 5,
    });
    const viewer = new WaveformViewer(scope, canvas);

    expect(viewer.getViewport()).toMatchObject({ startTime: 0, endTime: 5 });
    expect(scope.getDuration()).toBe(10);
    expect(scope.getSampleRate()).toBe(1000);

    await viewer.render();
    expect(viewer.getStatus().state).toBe("ready");
  });

  it("updates viewport and emits viewportchange events", async () => {
    const canvas = createMockCanvas();
    const scope = new Sonoscope({
      source: dummySource,
      startTime: 0,
      endTime: 5,
    });
    const viewer = new WaveformViewer(scope, canvas);

    const onViewportChange = vi.fn();
    viewer.on("viewportchange", onViewportChange);

    viewer.updateViewport({ startTime: 1, endTime: 4 });

    expect(viewer.getViewport()).toMatchObject({ startTime: 1, endTime: 4 });
    expect(onViewportChange).toHaveBeenCalledTimes(1);
  });

  it("zooms time around an anchor via scope", async () => {
    const canvas = createMockCanvas();
    const scope = new Sonoscope({
      source: dummySource,
      startTime: 0,
      endTime: 2,
    });
    const viewer = new WaveformViewer(scope, canvas);

    scope.zoom(0.5, 1.0);

    expect(viewer.getViewport()).toMatchObject({
      startTime: 0.5,
      endTime: 1.5,
    });
  });

  it("converts between canvas pixels and timestamps", async () => {
    const canvas = createMockCanvas();
    const scope = new Sonoscope({
      source: dummySource,
      startTime: 2,
      endTime: 6,
    });
    const viewer = new WaveformViewer(scope, canvas);

    expect(viewer.canvasToTime(0)).toBe(2);
    expect(viewer.canvasToTime(200)).toBe(6);
    expect(viewer.canvasToTime(100)).toBe(4);

    expect(viewer.timeToCanvas(2)).toBe(0);
    expect(viewer.timeToCanvas(6)).toBe(200);
    expect(viewer.timeToCanvas(4)).toBe(100);
  });

  it("attaches and detaches audio element cleanly on Sonoscope", async () => {
    const canvas = createMockCanvas();
    const audio = {
      currentTime: 1.5,
      paused: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    const scope = new Sonoscope({
      source: dummySource,
      audio,
    });
    const viewer = new WaveformViewer(scope, canvas);

    expect(scope.getAudio()).toBe(audio);
    expect(viewer.getConfig().cursorColor).toBe("#ffffff");

    scope.detachAudio();
    expect(scope.getAudio()).toBeUndefined();
    expect(audio.removeEventListener).toHaveBeenCalled();
  });

  it("derives waveform colors from colorMap", async () => {
    const canvas = createMockCanvas();
    const scope = new Sonoscope({ source: dummySource });
    const viewer = new WaveformViewer(scope, canvas, {
      colorMap: "magma",
    });

    const config = viewer.getConfig();
    expect(config.color).toContain("rgb(");
    expect(config.progressColor).toContain("rgb(");
    expect(config.color).not.toBe(config.progressColor);

    viewer.updateConfig({ colorMap: "viridis" });
    const nextConfig = viewer.getConfig();
    expect(nextConfig.color).not.toBe(config.color);
  });

  it("supports webgl2 renderer option and dynamic renderer switching", async () => {
    const canvas = createMockCanvas();
    const scope = new Sonoscope({ source: dummySource });
    const viewer = new WaveformViewer(scope, canvas, {
      renderer: "webgl2",
    });

    expect(viewer.getConfig().renderer).toBe("webgl2");
    await viewer.render();
    expect(viewer.getStatus().state).toBe("ready");

    viewer.updateConfig({ renderer: "canvas2d" });
    expect(viewer.getConfig().renderer).toBe("canvas2d");
  });

  describe("Sonoscope Integration", () => {
    it("creates viewer with new WaveformViewer(scope, canvas)", () => {
      const scope = new Sonoscope({
        source: dummySource,
        startTime: 1,
        endTime: 6,
      });
      const target = createMockCanvas();
      const viewer = new WaveformViewer(scope, target);

      expect(viewer.getScope()).toBe(scope);
      expect(viewer.getViewport()).toMatchObject({ startTime: 1, endTime: 6 });
      expect(viewer.getCanvas()).toBe(target);
      expect("canvas" in viewer.getConfig()).toBe(false);
      expect("source" in viewer.getConfig()).toBe(false);
    });

    it("creates viewer with new WaveformViewer(scope, canvas, options)", () => {
      const scope = new Sonoscope({ source: dummySource });
      const target = createMockCanvas();
      const viewer = new WaveformViewer(scope, target, {
        color: "#ff0000",
        amplitudeScale: 2.0,
      });

      expect(viewer.getScope()).toBe(scope);
      expect(viewer.getConfig().color).toBe("#ff0000");
      expect(viewer.getConfig().amplitudeScale).toBe(2.0);
      expect(viewer.getCanvas()).toBe(target);
      expect("canvas" in viewer.getConfig()).toBe(false);
      expect("source" in viewer.getConfig()).toBe(false);
    });

    it("creates viewer via scope.createWaveform(canvas, options)", () => {
      const scope = new Sonoscope({
        source: dummySource,
        startTime: 2,
        endTime: 8,
      });
      const target = createMockCanvas();
      const viewer = scope.createWaveform(target, { colorMap: "inferno" });

      expect(viewer.getScope()).toBe(scope);
      expect(viewer.getConfig().colorMap).toBe("inferno");
      expect(viewer.getViewport().startTime).toBeCloseTo(2);
      expect(viewer.getViewport().endTime).toBeCloseTo(8);
    });

    it("updates WaveformViewer when scope.pan() is called", () => {
      const scope = new Sonoscope({
        source: dummySource,
        startTime: 1,
        endTime: 5,
      });
      const viewer = new WaveformViewer(scope, createMockCanvas());
      const requestRender = vi.spyOn(viewer, "requestRender");

      scope.pan(2);

      expect(viewer.getViewport().startTime).toBeCloseTo(3);
      expect(viewer.getViewport().endTime).toBeCloseTo(7);
      expect(requestRender).toHaveBeenCalledTimes(1);
    });

    it("updates WaveformViewer when scope.zoom() is called", () => {
      const scope = new Sonoscope({
        source: dummySource,
        startTime: 2,
        endTime: 8,
      });
      const viewer = new WaveformViewer(scope, createMockCanvas());
      const requestRender = vi.spyOn(viewer, "requestRender");

      scope.zoom(0.5, 5);

      expect(viewer.getViewport().startTime).toBeCloseTo(3.5);
      expect(viewer.getViewport().endTime).toBeCloseTo(6.5);
      expect(requestRender).toHaveBeenCalledTimes(1);
    });

    it("updates WaveformViewer when scope.setViewport() is called", () => {
      const scope = new Sonoscope({
        source: dummySource,
        startTime: 0,
        endTime: 10,
      });
      const viewer = new WaveformViewer(scope, createMockCanvas());
      const requestRender = vi.spyOn(viewer, "requestRender");

      scope.setViewport({ startTime: 3, endTime: 9 });

      expect(viewer.getViewport().startTime).toBeCloseTo(3);
      expect(viewer.getViewport().endTime).toBeCloseTo(9);
      expect(requestRender).toHaveBeenCalledTimes(1);
    });

    it("updates scope when viewer.updateViewport() modifies time bounds", () => {
      const scope = new Sonoscope({
        source: dummySource,
        startTime: 0,
        endTime: 10,
      });
      const viewer = new WaveformViewer(scope, createMockCanvas());

      viewer.updateViewport({
        startTime: 2,
        endTime: 7,
      });

      expect(scope.getViewport().startTime).toBeCloseTo(2);
      expect(scope.getViewport().endTime).toBeCloseTo(7);
      expect(viewer.getViewport()).toMatchObject({
        startTime: 2,
        endTime: 7,
      });
    });

    it("unbinds from scope on destroy() without destroying externally owned scope", () => {
      const scope = new Sonoscope({
        source: dummySource,
        startTime: 0,
        endTime: 10,
      });
      const scopeDestroySpy = vi.spyOn(scope, "destroy");
      const viewer = new WaveformViewer(scope, createMockCanvas());
      const requestRender = vi.spyOn(viewer, "requestRender");

      viewer.destroy();

      expect(scopeDestroySpy).not.toHaveBeenCalled();

      // Viewport changes on scope should no longer trigger render on destroyed viewer
      scope.pan(1);
      expect(requestRender).not.toHaveBeenCalled();
    });

    it("automatically requests render on construction by default (autoRender: true)", async () => {
      const scope = new Sonoscope({
        source: dummySource,
        startTime: 0,
        endTime: 10,
      });
      const viewer = new WaveformViewer(scope, createMockCanvas());
      expect(viewer.getConfig().autoRender).toBe(true);

      // Wait for microtask
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      expect(viewer.getStatus().state).not.toBe("idle");
    });

    it("does not automatically render when autoRender is false", async () => {
      const scope = new Sonoscope({
        source: dummySource,
        startTime: 0,
        endTime: 10,
      });
      const viewer = new WaveformViewer(scope, createMockCanvas(), {
        autoRender: false,
      });
      expect(viewer.getConfig().autoRender).toBe(false);

      // Wait for microtask
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      expect(viewer.getStatus().state).toBe("idle");
    });
  });
});
