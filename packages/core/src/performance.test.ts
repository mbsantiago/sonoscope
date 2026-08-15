import { describe, expect, it } from "vitest";
import {
  FrameMeter,
  PerformanceProfiler,
  SpectrogramProfiler,
} from "./performance";
import type {
  ISpectrogramViewer,
  SpectrogramEvents,
  SpectrogramProfileEvent,
} from "./viewers/spectrogram/types";

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

describe("SpectrogramProfiler", () => {
  function createMockViewer() {
    const listeners = new Map<
      string,
      Array<(event: SpectrogramEvents[keyof SpectrogramEvents]) => void>
    >();
    return {
      on: <Name extends keyof SpectrogramEvents>(
        event: Name,
        handler: (e: SpectrogramEvents[Name]) => void,
      ) => {
        const list = listeners.get(event) ?? [];
        list.push(
          handler as (
            event: SpectrogramEvents[keyof SpectrogramEvents],
          ) => void,
        );
        listeners.set(event, list);
        return () => {
          const arr = listeners.get(event) ?? [];
          listeners.set(
            event,
            arr.filter((h) => h !== handler),
          );
        };
      },
      emit<Name extends keyof SpectrogramEvents>(
        event: Name,
        payload: SpectrogramEvents[Name],
      ) {
        for (const handler of listeners.get(event) ?? []) {
          handler(payload);
        }
      },
      getCacheStats: () => ({
        tiles: 4,
        maxTiles: 32,
        bytes: 1024 * 1024,
        peakBytes: 2 * 1024 * 1024,
        peakTiles: 4,
      }),
    };
  }

  it("attaches to viewer and computes render statistics", () => {
    let clock = 1000;
    const viewer = createMockViewer();
    const profiler = new SpectrogramProfiler(
      viewer as unknown as ISpectrogramViewer,
      {
        clock: () => clock,
      },
    );

    const profiles: SpectrogramProfileEvent[] = [];
    profiler.on("profile", (event) => profiles.push(event));

    // Simulate render start
    viewer.emit("renderstart", { requestId: "r1", total: 4 });
    clock += 25; // 25ms render
    viewer.emit("rendercomplete", {
      requestId: "r1",
      durationMs: 25,
      renderedTiles: 4,
      missingTiles: 0,
    });

    expect(profiles.length).toBe(1);
    expect(profiles[0]?.durationMs).toBe(25);
    expect(profiles[0]?.renderedTiles).toBe(4);

    const stats = profiler.getStats();
    expect(stats.renderCount).toBe(1);
    expect(stats.lastDurationMs).toBe(25);
    expect(stats.avgDurationMs).toBe(25);
    expect(stats.minDurationMs).toBe(25);
    expect(stats.maxDurationMs).toBe(25);
    expect(stats.cache?.tiles).toBe(4);
  });

  it("computes duration when durationMs is not provided in rendercomplete", () => {
    let clock = 2000;
    const viewer = createMockViewer();
    const profiler = new SpectrogramProfiler(
      viewer as unknown as ISpectrogramViewer,
      {
        clock: () => clock,
      },
    );

    viewer.emit("renderstart", { requestId: "r2", total: 2 });
    clock += 15;
    viewer.emit("rendercomplete", {
      requestId: "r2",
      durationMs: 15,
      renderedTiles: 2,
      missingTiles: 0,
    });

    const stats = profiler.getStats();
    expect(stats.renderCount).toBe(1);
    expect(stats.lastDurationMs).toBe(15);
    expect(stats.avgDurationMs).toBe(15);
  });

  it("tracks tileload cache hits, misses, and hit ratio", () => {
    const viewer = createMockViewer();
    const profiler = new SpectrogramProfiler(
      viewer as unknown as ISpectrogramViewer,
    );

    viewer.emit("tileload", {
      tileId: "t1",
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      cacheHit: false,
    });
    viewer.emit("tileload", {
      tileId: "t2",
      channel: 0,
      timeStart: 1,
      timeEnd: 2,
      cacheHit: true,
    });
    viewer.emit("tileload", {
      tileId: "t1",
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      cacheHit: true,
    });

    viewer.emit("rendercomplete", {
      requestId: "r-tiles",
      durationMs: 20,
      renderedTiles: 2,
      missingTiles: 0,
    });

    const stats = profiler.getStats();
    expect(stats.totalTilesLoaded).toBe(3);
    expect(stats.cacheHits).toBe(2);
    expect(stats.cacheMisses).toBe(1);
    expect(stats.cacheHitRatio).toBeCloseTo(2 / 3);
  });

  it("tracks playbackprofile frames and integrates with stats", () => {
    const viewer = createMockViewer();
    const profiler = new SpectrogramProfiler(
      viewer as unknown as ISpectrogramViewer,
    );

    viewer.emit("playbackprofile", {
      frames: 60,
      elapsedMs: 1000,
      fps: 60,
      minFrameMs: 15,
      maxFrameMs: 18,
      averageFrameMs: 16.6,
    });

    viewer.emit("rendercomplete", {
      requestId: "r-pb",
      durationMs: 10,
      renderedTiles: 1,
      missingTiles: 0,
    });

    const stats = profiler.getStats();
    expect(stats.playback?.fps).toBe(60);
    expect(stats.playback?.averageFrameMs).toBe(16.6);
  });

  it("unbinds listeners cleanly on destroy()", () => {
    const viewer = createMockViewer();
    const profiler = new SpectrogramProfiler(
      viewer as unknown as ISpectrogramViewer,
    );

    profiler.destroy();
    expect(profiler.isDestroyed()).toBe(true);

    viewer.emit("renderstart", { requestId: "r3", total: 2 });
    viewer.emit("rendercomplete", {
      requestId: "r3",
      durationMs: 10,
      renderedTiles: 2,
      missingTiles: 0,
    });
    expect(profiler.getStats().renderCount).toBe(0);
  });
});
