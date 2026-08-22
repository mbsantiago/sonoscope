import type { AudioSource } from "../../../types";
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

const dummySource: AudioSource = {
  id: "test-source",
  sampleRate: 1000,
  duration: 10,
  channelCount: 1,
  read: ({ startTime, endTime }) => {
    const count = Math.max(0, Math.floor((endTime - startTime) * 1000));
    const data = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      data[i] = Math.sin(i * 0.1);
    }
    return data;
  },
};

describe("WebGL2WaveformRenderer", () => {
  it("instantiates with kind 'webgl2'", () => {
    const renderer = new WebGL2WaveformRenderer();
    expect(renderer.kind).toBe("webgl2");
  });

  it("falls back cleanly to canvas2d when WebGL2 context is unavailable in Node/jsdom", async () => {
    const renderer = new WebGL2WaveformRenderer();
    const canvas = createMockCanvas();

    await expect(
      renderer.render({
        canvas,
        source: dummySource,
        channel: 0,
        startTime: 0,
        endTime: 2,
      }),
    ).resolves.not.toThrow();

    renderer.destroy();
  });
});
