import { describe, expect, it } from "vitest";
import type { AudioSource } from "../types";
import { computePeaks, WaveformPeakPyramid } from "./peaks";

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

describe("WaveformPeakPyramid", () => {
  const dummySource: AudioSource = {
    id: "test",
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

  it("retrieves peaks for a visible time range", async () => {
    const pyramid = new WaveformPeakPyramid(dummySource, 0);
    const peaks = await pyramid.getPeaks(0, 2, 100);
    expect(peaks.min.length).toBe(100);
    expect(peaks.max.length).toBe(100);
    expect(peaks.max.some((v) => v > 0)).toBe(true);
    expect(peaks.min.some((v) => v < 0)).toBe(true);
  });
});
