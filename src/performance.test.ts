import { describe, expect, it } from "vitest";
import { FrameMeter, PerformanceProfiler } from "./performance";

describe("PerformanceProfiler", () => {
  it("records measured synchronous work", () => {
    let clock = 10;
    const profiler = new PerformanceProfiler(() => clock);

    const value = profiler.measure("tile.cache.lookup", { channel: 0 }, () => {
      clock = 14;
      return "cached";
    });

    expect(value).toBe("cached");
    expect(profiler.measures()).toEqual([
      {
        name: "tile.cache.lookup",
        start: 10,
        duration: 4,
        detail: { channel: 0 },
      },
    ]);
  });

  it("records measured async work", async () => {
    let clock = 20;
    const profiler = new PerformanceProfiler(() => clock);

    await profiler.measureAsync(
      "tile.stft.compute",
      { frames: 4 },
      async () => {
        clock = 33;
      },
    );

    expect(profiler.measures()).toEqual([
      {
        name: "tile.stft.compute",
        start: 20,
        duration: 13,
        detail: { frames: 4 },
      },
    ]);
  });

  it("returns defensive copies of measures", () => {
    const profiler = new PerformanceProfiler(() => 1);
    profiler.record("renderer.paint", 1, 2, { tiles: 1 });

    const measures = profiler.measures();
    measures.push({ name: "render.total", start: 0, duration: 0 });

    expect(profiler.measures()).toEqual([
      { name: "renderer.paint", start: 1, duration: 2, detail: { tiles: 1 } },
    ]);
  });
});

describe("FrameMeter", () => {
  it("summarizes frame cadence after the sample window", () => {
    const meter = new FrameMeter(3);

    expect(meter.tick(0)).toBeUndefined();
    expect(meter.tick(16)).toBeUndefined();
    expect(meter.tick(32)).toBeUndefined();
    const stats = meter.tick(48);

    expect(stats).toMatchObject({
      frames: 3,
      elapsedMs: 48,
      minFrameMs: 16,
      maxFrameMs: 16,
      averageFrameMs: 16,
    });
    expect(stats?.fps).toBeCloseTo(62.5);
  });
});
