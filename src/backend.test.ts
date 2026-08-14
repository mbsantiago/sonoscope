import { describe, expect, it } from "vitest";
import { MainThreadComputeBackend } from "./backend";
import { PerformanceProfiler } from "./performance";
import type { AudioSource } from "./types";

describe("MainThreadComputeBackend", () => {
  it("reads a source range and computes a matrix", async () => {
    const source: AudioSource = {
      id: "source",
      sampleRate: 1024,
      duration: 1,
      channelCount: 1,
      read: () => new Float32Array(1024),
    };
    const backend = new MainThreadComputeBackend();
    const matrix = await backend.computeTile({
      source,
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      stft: { windowSize: 256, fftSize: 256, hopSize: 128, window: "hann" },
    });
    expect(matrix.channel).toBe(0);
    expect(matrix.binCount).toBe(128);
  });

  it("records source read and STFT timings when a profiler is provided", async () => {
    let clock = 0;
    const profiler = new PerformanceProfiler(() => clock);
    const source: AudioSource = {
      id: "profiled-source",
      sampleRate: 1024,
      duration: 1,
      channelCount: 1,
      read: () => {
        clock += 3;
        return new Float32Array(1024);
      },
    };
    const backend = new MainThreadComputeBackend();

    await backend.computeTile({
      source,
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      stft: { windowSize: 256, fftSize: 256, hopSize: 128, window: "hann" },
      profile: profiler,
    });

    const names = profiler.measures().map((measure) => measure.name);
    expect(names).toContain("tile.source.read");
    expect(names).toContain("tile.stft.compute");
    expect(names).toContain("tile.total");
  });
});
