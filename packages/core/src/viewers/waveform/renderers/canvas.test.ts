import { describe, expect, it, vi } from "vitest";
import { CanvasWaveformRenderer } from "./canvas";

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

describe("CanvasWaveformRenderer", () => {
  it("renders waveform envelope without crashing", () => {
    const renderer = new CanvasWaveformRenderer();
    const canvas = createMockCanvas();
    const peaks = {
      min: new Float32Array([-0.5, -0.8, -0.2]),
      max: new Float32Array([0.5, 0.9, 0.3]),
    };

    expect(() =>
      renderer.render({
        canvas,
        peaks,
        startTime: 0,
        endTime: 1,
        color: "#38bdf8",
      }),
    ).not.toThrow();
  });

  it("renders with custom color and amplitude scale", () => {
    const renderer = new CanvasWaveformRenderer();
    const canvas = createMockCanvas();
    const peaks = {
      min: new Float32Array([-0.5, -0.8, -0.2]),
      max: new Float32Array([0.5, 0.9, 0.3]),
    };

    expect(() =>
      renderer.render({
        canvas,
        peaks,
        startTime: 0,
        endTime: 2,
        color: "#38bdf8",
        amplitudeScale: 1.5,
      }),
    ).not.toThrow();
  });
});
