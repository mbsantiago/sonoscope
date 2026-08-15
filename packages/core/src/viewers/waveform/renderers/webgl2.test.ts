import { describe, expect, it, vi } from "vitest";
import { WebGL2WaveformRenderer } from "./webgl2";

function createMockCanvas(): HTMLCanvasElement {
  return {
    width: 200,
    height: 80,
    getBoundingClientRect: () => ({ width: 200, height: 80 }),
    getContext: (type: string) => {
      if (type === "webgl2") return null; // simulate WebGL2 unavailable
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

describe("WebGL2WaveformRenderer", () => {
  it("instantiates with kind 'webgl2'", () => {
    const renderer = new WebGL2WaveformRenderer();
    expect(renderer.kind).toBe("webgl2");
  });

  it("falls back cleanly to canvas2d when WebGL2 context is unavailable in Node/jsdom", () => {
    const renderer = new WebGL2WaveformRenderer();
    const canvas = createMockCanvas();

    expect(() => {
      renderer.render({
        canvas,
        peaks: {
          min: new Float32Array([-0.5, -0.8]),
          max: new Float32Array([0.5, 0.8]),
        },
        startTime: 0,
        endTime: 2,
      });
    }).not.toThrow();

    renderer.destroy();
  });
});
