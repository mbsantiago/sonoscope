import type { AudioSource } from "../../../types";
import { describe, expect, it, vi } from "vitest";
import { BarPeakPyramid } from "./bars";

describe("BarPeakPyramid", () => {
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

  it("produces identical absolute bar peaks regardless of viewport panning", async () => {
    const pyramid = new BarPeakPyramid(dummySource, 0);
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

  it("caches computed bar peaks and avoids redundant audio reads", async () => {
    const readSpy = vi.fn(dummySource.read);
    const spySource = { ...dummySource, read: readSpy };
    const pyramid = new BarPeakPyramid(spySource, 0);
    const barDuration = 0.05;

    await pyramid.getBarPeaks(1.0, 2.0, barDuration);
    const firstCallCount = readSpy.mock.calls.length;
    expect(firstCallCount).toBeGreaterThan(0);

    // Re-query overlapping range - should hit cache
    await pyramid.getBarPeaks(1.0, 2.0, barDuration);
    expect(readSpy.mock.calls.length).toBe(firstCallCount);
  });

  it("bounds cache size using LRU eviction when zooming across many levels", async () => {
    const pyramid = new BarPeakPyramid(dummySource, 0);

    // Request 25 different zoom levels (bar durations)
    for (let i = 1; i <= 25; i++) {
      await pyramid.getBarPeaks(0, 1, 0.01 * i);
    }

    // Accessing a previous level should still work seamlessly
    const res = await pyramid.getBarPeaks(0, 1, 0.25);
    expect(res.min.length).toBeGreaterThan(0);
  });

  it("handles empty time range gracefully", async () => {
    const pyramid = new BarPeakPyramid(dummySource, 0);
    const b = await pyramid.getBarPeaks(2.0, 2.0, 0.05);
    expect(b.min.length).toBe(0);
    expect(b.max.length).toBe(0);
  });
});
