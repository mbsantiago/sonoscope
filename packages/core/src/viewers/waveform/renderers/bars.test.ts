import type { AudioSource } from "../../../types";
import { describe, expect, it, vi } from "vitest";
import { BarsWaveformRenderer } from "./bars";

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
      roundRect: vi.fn(),
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
      const val = 0.8 * Math.sin((start + i) * 0.05);
      data[i] = val;
    }
    return data;
  },
};

describe("BarsWaveformRenderer", () => {
  it("instantiates with kind 'bars'", () => {
    const renderer = new BarsWaveformRenderer();
    expect(renderer.kind).toBe("bars");
  });

  it("renders segmented bars without crashing", async () => {
    const renderer = new BarsWaveformRenderer();
    const canvas = createMockCanvas();

    await expect(
      renderer.render({
        canvas,
        source: dummySource,
        channel: 0,
        startTime: 0,
        endTime: 1,
        color: "#f03e1e",
      }),
    ).resolves.not.toThrow();
  });

  it("supports custom barWidth, barGap, and alignment options", async () => {
    const renderer = new BarsWaveformRenderer({
      barWidth: 4,
      barGap: 3,
      barAlign: "bottom",
      symmetric: false,
    });
    const canvas = createMockCanvas();

    await expect(
      renderer.render({
        canvas,
        source: dummySource,
        channel: 0,
        startTime: 0,
        endTime: 2,
        color: "#ff3e00",
        amplitudeScale: 1.5,
      }),
    ).resolves.not.toThrow();

    expect(renderer.getOptions().barWidth).toBe(4);
    expect(renderer.getOptions().barGap).toBe(3);
    expect(renderer.getOptions().barAlign).toBe("bottom");
  });

  it("supports options update via setOptions()", () => {
    const renderer = new BarsWaveformRenderer();
    renderer.setOptions({ barWidth: 6, barGap: 4, rounded: false });
    expect(renderer.getOptions()).toMatchObject({
      barWidth: 6,
      barGap: 4,
      rounded: false,
    });
  });

  it("renders with custom color and background", async () => {
    const renderer = new BarsWaveformRenderer();
    const canvas = createMockCanvas();

    await expect(
      renderer.render({
        canvas,
        source: dummySource,
        channel: 0,
        startTime: 0,
        endTime: 10,
        color: "#f03e1e",
        backgroundColor: "#111827",
      }),
    ).resolves.not.toThrow();
  });

  it("handles empty time range gracefully", async () => {
    const renderer = new BarsWaveformRenderer();
    const canvas = createMockCanvas();

    await expect(
      renderer.render({
        canvas,
        source: dummySource,
        channel: 0,
        startTime: 2,
        endTime: 2,
      }),
    ).resolves.not.toThrow();
  });

  it("renders with top alignment and custom radius", async () => {
    const renderer = new BarsWaveformRenderer({
      barAlign: "top",
      barRadius: 2,
    });
    const canvas = createMockCanvas();

    await expect(
      renderer.render({
        canvas,
        source: dummySource,
        channel: 0,
        startTime: 0,
        endTime: 1,
      }),
    ).resolves.not.toThrow();
  });

  it("maintains absolute bar positions and stable heights during panning", async () => {
    const renderer = new BarsWaveformRenderer({
      barWidth: 4,
      barGap: 6, // step = 10px on 200px canvas = 20 bars
      rounded: false,
    });

    const moveToCalls1: Array<[number, number]> = [];
    const lineToCalls1: Array<[number, number]> = [];
    const canvas1 = {
      width: 200,
      height: 80,
      getBoundingClientRect: () => ({ width: 200, height: 80 }),
      getContext: () => ({
        save: vi.fn(),
        restore: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: (x: number, y: number) => moveToCalls1.push([x, y]),
        lineTo: (x: number, y: number) => lineToCalls1.push([x, y]),
        stroke: vi.fn(),
        fill: vi.fn(),
      }),
    } as unknown as HTMLCanvasElement;

    await renderer.render({
      canvas: canvas1,
      source: dummySource,
      channel: 0,
      startTime: 1.0,
      endTime: 3.0,
    });

    const moveToCalls2: Array<[number, number]> = [];
    const lineToCalls2: Array<[number, number]> = [];
    const canvas2 = {
      width: 200,
      height: 80,
      getBoundingClientRect: () => ({ width: 200, height: 80 }),
      getContext: () => ({
        save: vi.fn(),
        restore: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: (x: number, y: number) => moveToCalls2.push([x, y]),
        lineTo: (x: number, y: number) => lineToCalls2.push([x, y]),
        stroke: vi.fn(),
        fill: vi.fn(),
      }),
    } as unknown as HTMLCanvasElement;

    await renderer.render({
      canvas: canvas2,
      source: dummySource,
      channel: 0,
      startTime: 1.1,
      endTime: 3.1,
    });

    // Panning by +0.1s across a 2.0s span on 200px width shifts x by exactly (0.1 / 2.0) * 200 = 10px left
    const shiftPx = 10;
    expect(moveToCalls1.length).toBeGreaterThan(0);
    expect(moveToCalls2.length).toBeGreaterThan(0);

    // Find overlapping bars between viewport 1 and viewport 2
    // A bar at x in viewport 1 must appear at (x - 10) in viewport 2 with the EXACT same topY and bottomY
    for (let i = 0; i < moveToCalls1.length; i++) {
      const [x1, yTop1] = moveToCalls1[i]!;
      const targetX2 = x1 - shiftPx;
      const match2Index = moveToCalls2.findIndex(
        ([x2]) => Math.abs(x2 - targetX2) < 0.1,
      );
      if (match2Index !== -1) {
        const [, yTop2] = moveToCalls2[match2Index]!;
        expect(yTop2).toBeCloseTo(yTop1, 3);

        const [, yBottom1] = lineToCalls1[i]!;
        const [, yBottom2] = lineToCalls2[match2Index]!;
        expect(yBottom2).toBeCloseTo(yBottom1, 3);
      }
    }
  });
});
