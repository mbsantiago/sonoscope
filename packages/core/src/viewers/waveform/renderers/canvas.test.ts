import type { AudioSource } from "../../../types";
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

describe("CanvasWaveformRenderer", () => {
  it("renders waveform envelope without crashing", async () => {
    const renderer = new CanvasWaveformRenderer();
    const canvas = createMockCanvas();

    await expect(
      renderer.render({
        canvas,
        source: dummySource,
        channel: 0,
        startTime: 0,
        endTime: 1,
        color: "#38bdf8",
      }),
    ).resolves.not.toThrow();
  });

  it("renders with custom color and amplitude scale", async () => {
    const renderer = new CanvasWaveformRenderer();
    const canvas = createMockCanvas();

    await expect(
      renderer.render({
        canvas,
        source: dummySource,
        channel: 0,
        startTime: 0,
        endTime: 2,
        color: "#38bdf8",
        amplitudeScale: 1.5,
      }),
    ).resolves.not.toThrow();
  });
});
