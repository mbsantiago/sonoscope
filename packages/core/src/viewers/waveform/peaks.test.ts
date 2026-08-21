import type { AudioSource } from "../../types";
import { describe, expect, it } from "vitest";
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
    const pyramid = new WaveformPeakPyramid(dummySource, 0);
    const peaks = await pyramid.getPeaks(0, 2, 100);
    expect(peaks.min.length).toBe(100);
    expect(peaks.max.length).toBe(100);
    expect(peaks.max.some((v) => v > 0)).toBe(true);
    expect(peaks.min.some((v) => v < 0)).toBe(true);
  });

  it("maintains smooth stability during continuous sub-millisecond scrolling", async () => {
    const pyramid = new WaveformPeakPyramid(dummySource, 0);
    const p1 = await pyramid.getPeaks(1.0, 3.0, 200);
    const p2 = await pyramid.getPeaks(1.01, 3.01, 200); // 10ms forward (1 frame at 60fps)

    expect(p1.max.length).toBe(200);
    expect(p2.max.length).toBe(200);
    // Values shifted slightly should correlate closely
    const diff = Math.abs(p1.max[100]! - p2.max[99]!);
    expect(diff).toBeLessThan(0.15);
  });

  it("produces exactly matching peak boundaries when shifted by integer pixel offsets", async () => {
    const pyramid = new WaveformPeakPyramid(dummySource, 0);
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

    // Pixel i in p2 must exactly equal pixel (i + shiftPixels) in p1!
    for (let i = 0; i < width - shiftPixels; i++) {
      expect(p2.max[i]).toBeCloseTo(p1.max[i + shiftPixels]!, 5);
      expect(p2.min[i]).toBeCloseTo(p1.min[i + shiftPixels]!, 5);
    }
  });

  it("produces identical absolute bar peaks regardless of viewport panning", async () => {
    const pyramid = new WaveformPeakPyramid(dummySource, 0);
    const barDuration = 0.05; // 50ms per bar

    // Viewport 1: [1.0s, 3.0s]
    const b1 = await pyramid.getBarPeaks(1.0, 3.0, barDuration);
    // Viewport 2: Panned by arbitrary non-aligned 0.037s -> [1.037s, 3.037s]
    const b2 = await pyramid.getBarPeaks(1.037, 3.037, barDuration);

    expect(b1.barDuration).toBe(barDuration);
    expect(b2.barDuration).toBe(barDuration);

    // Overlapping absolute bar indices k between b1 and b2
    const overlapStart = Math.max(b1.kStart, b2.kStart);
    const overlapEnd = Math.min(b1.kEnd, b2.kEnd);
    expect(overlapEnd).toBeGreaterThan(overlapStart);

    for (let k = overlapStart; k <= overlapEnd; k++) {
      const val1Max = b1.max[k - b1.kStart];
      const val2Max = b2.max[k - b2.kStart];
      const val1Min = b1.min[k - b1.kStart];
      const val2Min = b2.min[k - b2.kStart];

      // Exact bit-for-bit invariance: absolute bar k has identical audio samples
      expect(val2Max).toBe(val1Max);
      expect(val2Min).toBe(val1Min);
    }
  });
});
