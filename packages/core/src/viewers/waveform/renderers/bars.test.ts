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

describe("BarsWaveformRenderer", () => {
  it("instantiates with kind 'bars'", () => {
    const renderer = new BarsWaveformRenderer();
    expect(renderer.kind).toBe("bars");
  });

  it("renders segmented bars without crashing", () => {
    const renderer = new BarsWaveformRenderer();
    const canvas = createMockCanvas();
    const peaks = {
      min: new Float32Array([-0.5, -0.8, -0.2, -0.9, -0.1]),
      max: new Float32Array([0.5, 0.9, 0.3, 0.8, 0.2]),
    };

    expect(() =>
      renderer.render({
        canvas,
        peaks,
        startTime: 0,
        endTime: 1,
        color: "#f03e1e",
      }),
    ).not.toThrow();
  });

  it("supports custom barWidth, barGap, and alignment options", () => {
    const renderer = new BarsWaveformRenderer({
      barWidth: 4,
      barGap: 3,
      barAlign: "bottom",
      symmetric: false,
    });
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
        color: "#ff3e00",
        amplitudeScale: 1.5,
      }),
    ).not.toThrow();

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

  it("renders with custom color and background", () => {
    const renderer = new BarsWaveformRenderer();
    const canvas = createMockCanvas();
    const peaks = {
      min: new Float32Array([-0.4, -0.7, -0.1, -0.8]),
      max: new Float32Array([0.4, 0.7, 0.2, 0.9]),
    };

    expect(() =>
      renderer.render({
        canvas,
        peaks,
        startTime: 0,
        endTime: 10,
        color: "#f03e1e",
        backgroundColor: "#111827",
      }),
    ).not.toThrow();
  });

  it("handles empty peaks array gracefully", () => {
    const renderer = new BarsWaveformRenderer();
    const canvas = createMockCanvas();
    const peaks = {
      min: new Float32Array(0),
      max: new Float32Array(0),
    };

    expect(() =>
      renderer.render({
        canvas,
        peaks,
        startTime: 0,
        endTime: 1,
      }),
    ).not.toThrow();
  });

  it("renders with top alignment and custom radius", () => {
    const renderer = new BarsWaveformRenderer({
      barAlign: "top",
      barRadius: 2,
    });
    const canvas = createMockCanvas();
    const peaks = {
      min: new Float32Array([-0.5]),
      max: new Float32Array([0.5]),
    };

    expect(() =>
      renderer.render({
        canvas,
        peaks,
        startTime: 0,
        endTime: 1,
      }),
    ).not.toThrow();
  });

  it("maintains absolute bar positions and stable heights during panning", () => {
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

    // Fixed dummy 10-second peak data at 100 samples/sec (1000 samples)
    const totalPeaks = 1000;
    const globalPeaksMax = new Float32Array(totalPeaks);
    const globalPeaksMin = new Float32Array(totalPeaks);
    for (let i = 0; i < totalPeaks; i++) {
      const val = 0.8 * Math.sin(i * 0.05);
      globalPeaksMax[i] = Math.max(0, val);
      globalPeaksMin[i] = Math.min(0, val);
    }

    // Slice for viewport 1: [1.0s, 3.0s] (200 samples)
    const pStart1 = Math.floor(1.0 * 100);
    const pEnd1 = Math.floor(3.0 * 100);
    const peaks1 = {
      max: globalPeaksMax.slice(pStart1, pEnd1),
      min: globalPeaksMin.slice(pStart1, pEnd1),
    };

    renderer.render({
      canvas: canvas1,
      peaks: peaks1,
      startTime: 1.0,
      endTime: 3.0,
    });

    // Slice for viewport 2: shifted/panned by +0.1s -> [1.1s, 3.1s] (200 samples)
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

    const pStart2 = Math.floor(1.1 * 100);
    const pEnd2 = Math.floor(3.1 * 100);
    const peaks2 = {
      max: globalPeaksMax.slice(pStart2, pEnd2),
      min: globalPeaksMin.slice(pStart2, pEnd2),
    };

    renderer.render({
      canvas: canvas2,
      peaks: peaks2,
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
