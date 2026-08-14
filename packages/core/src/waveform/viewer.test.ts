import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioSource } from "../types";
import { WaveformViewer } from "./viewer";

function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 200,
    height: 80,
    getBoundingClientRect: () => ({ width: 200, height: 80 }),
    getContext: () => ({
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
    }),
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
    const viewer = await WaveformViewer.create({
      canvas,
      source: dummySource,
      startTime: 0,
      endTime: 5,
    });

    expect(viewer.getViewport()).toMatchObject({ startTime: 0, endTime: 5 });
    expect(viewer.getDuration()).toBe(10);
    expect(viewer.getSampleRate()).toBe(1000);

    await viewer.render();
    expect(viewer.getStatus().state).toBe("ready");
  });

  it("updates viewport and emits viewportchange events", async () => {
    const canvas = createMockCanvas();
    const viewer = await WaveformViewer.create({
      canvas,
      source: dummySource,
      startTime: 0,
      endTime: 5,
    });

    const onViewportChange = vi.fn();
    viewer.on("viewportchange", onViewportChange);

    viewer.updateViewport({ startTime: 1, endTime: 4 });

    expect(viewer.getViewport()).toMatchObject({ startTime: 1, endTime: 4 });
    expect(onViewportChange).toHaveBeenCalledTimes(1);
  });

  it("zooms time around an anchor", async () => {
    const canvas = createMockCanvas();
    const viewer = await WaveformViewer.create({
      canvas,
      source: dummySource,
      startTime: 0,
      endTime: 2,
    });

    viewer.zoomTime(0.5, 1.0);

    expect(viewer.getViewport()).toMatchObject({
      startTime: 0.5,
      endTime: 1.5,
    });
  });

  it("converts between canvas pixels and timestamps", async () => {
    const canvas = createMockCanvas();
    const viewer = await WaveformViewer.create({
      canvas,
      source: dummySource,
      startTime: 2,
      endTime: 6,
    });

    expect(viewer.canvasToTime(0)).toBe(2);
    expect(viewer.canvasToTime(200)).toBe(6);
    expect(viewer.canvasToTime(100)).toBe(4);

    expect(viewer.timeToCanvas(2)).toBe(0);
    expect(viewer.timeToCanvas(6)).toBe(200);
    expect(viewer.timeToCanvas(4)).toBe(100);
  });

  it("attaches and detaches audio element cleanly", async () => {
    const canvas = createMockCanvas();
    const audio = {
      currentTime: 1.5,
      paused: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    const viewer = await WaveformViewer.create({
      canvas,
      source: dummySource,
      audio,
    });

    expect(viewer.getAudio()).toBe(audio);
    expect(viewer.getConfig().cursorColor).toBe("#ffffff");

    viewer.detachAudio();
    expect(viewer.getAudio()).toBeUndefined();
    expect(audio.removeEventListener).toHaveBeenCalled();
  });

  it("derives waveform colors from colorMap", async () => {
    const canvas = createMockCanvas();
    const viewer = await WaveformViewer.create({
      canvas,
      source: dummySource,
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
});
