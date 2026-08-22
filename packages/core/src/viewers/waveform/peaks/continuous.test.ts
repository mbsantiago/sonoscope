import type { AudioSource } from "../../../types";
import { describe, expect, it } from "vitest";
import { ContinuousPeakPyramid, computePeaks } from "./continuous";

describe("computePeaks", () => {
  it("handles empty samples gracefully", () => {
    const peaks = computePeaks(new Float32Array(0), 100);
    expect(peaks.min.length).toBe(0);
    expect(peaks.max.length).toBe(0);
  });

  it("extracts exact min and max values across bins", () => {
    const samples = new Float32Array([
      0.1,
      -0.5,
      0.8,
      -0.2, // bin 0: min -0.5, max 0.8
      0.3,
      -0.9,
      0.4,
      0.0, // bin 1: min -0.9, max 0.4
    ]);
    const peaks = computePeaks(samples, 2);
    expect(peaks.min.length).toBe(2);
    expect(peaks.max.length).toBe(2);

    expect(peaks.min[0]).toBeCloseTo(-0.5);
    expect(peaks.max[0]).toBeCloseTo(0.8);
    expect(peaks.min[1]).toBeCloseTo(-0.9);
    expect(peaks.max[1]).toBeCloseTo(0.4);
  });

  it("clamps output length when targetLength exceeds sample count", () => {
    const samples = new Float32Array([0.2, -0.4, 0.6]);
    const peaks = computePeaks(samples, 10);
    expect(peaks.min.length).toBe(3);
    expect(peaks.max.length).toBe(3);
  });
});

describe("ContinuousPeakPyramid", () => {
  const dummySource: AudioSource = {
    id: "test",
    sampleRate: 1000,
    duration: 10,
    channelCount: 1,
    read: ({
      startTime,
      endTime,
    }: {
      channel: number;
      startTime: number;
      endTime: number;
    }) => {
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

  it("retrieves peaks for a visible time range", async () => {
    const pyramid = new ContinuousPeakPyramid(dummySource, 0);
    const peaks = await pyramid.getPeaks(0, 2, 100);
    expect(peaks.min.length).toBeGreaterThanOrEqual(100);
    expect(peaks.max.length).toBeGreaterThanOrEqual(100);
    expect(peaks.x?.length).toBe(peaks.min.length);
    expect(peaks.isLineMode).toBe(false);
    expect(peaks.max.some((v) => v > 0)).toBe(true);
    expect(peaks.min.some((v) => v < 0)).toBe(true);
  });

  it("maintains smooth stability during continuous sub-millisecond scrolling", async () => {
    const pyramid = new ContinuousPeakPyramid(dummySource, 0);
    const p1 = await pyramid.getPeaks(1.0, 3.0, 200);
    const p2 = await pyramid.getPeaks(1.01, 3.01, 200); // 10ms forward (1 frame at 60fps)

    expect(p1.max.length).toBeGreaterThanOrEqual(200);
    expect(p2.max.length).toBeGreaterThanOrEqual(200);
    // Values shifted slightly should correlate closely
    const diff = Math.abs(p1.max[100]! - p2.max[99]!);
    expect(diff).toBeLessThan(0.15);
  });

  it("produces invariant peak values and continuous floating coordinates when panning", async () => {
    const pyramid = new ContinuousPeakPyramid(dummySource, 0);
    const width = 100;
    const duration = 2.0; // 2s across 100 pixels = 0.02s per pixel
    const shiftPixels = 5;
    const shiftTime = shiftPixels * (duration / width); // 0.1s shift

    const p1 = await pyramid.getPeaks(1.0, 1.0 + duration, width);
    const p2 = await pyramid.getPeaks(
      1.0 + shiftTime,
      1.0 + duration + shiftTime,
      width,
    );

    // Pixel bucket i in p2 has identical peak values to (i + shiftPixels) in p1
    for (let i = 0; i < width - shiftPixels; i++) {
      expect(p2.max[i]).toBeCloseTo(p1.max[i + shiftPixels]!, 5);
      expect(p2.min[i]).toBeCloseTo(p1.min[i + shiftPixels]!, 5);
    }
  });

  it("handles high zoom sub-sample mode with continuous sample coordinates", async () => {
    const pyramid = new ContinuousPeakPyramid(dummySource, 0);
    const peaks = await pyramid.getPeaks(0.5, 0.502, 100);
    expect(peaks.isLineMode).toBe(true);
    expect(peaks.x?.length).toBe(peaks.min.length);
    expect(peaks.min.length).toBeGreaterThan(0);
  });
});
