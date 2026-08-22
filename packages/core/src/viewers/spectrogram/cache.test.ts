import type { SpectrogramMatrix } from "./types";
import { describe, expect, it } from "vitest";
import { createTileKey, SpectrogramCache } from "./cache";

function matrix(id: number): SpectrogramMatrix {
  return {
    channel: 0,
    timeStart: id,
    timeEnd: id + 1,
    frameStart: 0,
    frameCount: 1,
    binCount: 1,
    sampleRate: 1,
    times: Float32Array.from([id]),
    frequencies: Float32Array.from([0]),
    magnitude: Float32Array.from([id]),
  };
}

describe("SpectrogramCache", () => {
  it("creates stable tile keys", () => {
    expect(
      createTileKey({
        sourceId: "a",
        channel: 0,
        timeStart: 0,
        timeEnd: 1,
        stftHash: "s",
        transformHash: "t",
      }),
    ).toBe("a|0|0.000000|1.000000|s|t");
  });

  it("evicts least recently used tiles without a viewport time", () => {
    const cache = new SpectrogramCache({ maxCachedTiles: 2 });
    cache.set("a", matrix(1), 1.5);
    cache.set("b", matrix(2), 2.5);
    cache.get("a");
    cache.set("c", matrix(3), 3.5);

    expect(cache.get("a")?.timeStart).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")?.timeStart).toBe(3);
  });

  it("evicts the tile furthest from the viewport time", () => {
    const cache = new SpectrogramCache({ maxCachedTiles: 2 });
    cache.set("near", matrix(4), 4.5, 5);
    cache.set("far", matrix(0), 0.5, 5);
    cache.set("new", matrix(5), 5.5, 5);

    expect(cache.get("near")?.timeStart).toBe(4);
    expect(cache.get("far")).toBeUndefined();
    expect(cache.get("new")?.timeStart).toBe(5);
  });

  it("uses LRU order to break equal tile-time distances", () => {
    const cache = new SpectrogramCache({ maxCachedTiles: 2 });
    cache.set("oldest", matrix(1), 1, 5);
    cache.set("newer", matrix(9), 9, 5);
    cache.get("oldest");
    cache.set("near", matrix(5), 5, 5);

    expect(cache.get("oldest")?.timeStart).toBe(1);
    expect(cache.get("newer")).toBeUndefined();
    expect(cache.get("near")?.timeStart).toBe(5);
  });

  it("replaces an entry's matrix and tile time", () => {
    const cache = new SpectrogramCache({ maxCachedTiles: 2 });
    cache.set("tile", matrix(1), 1.5);
    cache.set("tile", matrix(2), 9);
    cache.set("other", matrix(5), 5);
    cache.set("new", matrix(0), 0, 0);

    expect(cache.get("tile")).toBeUndefined();
    expect(cache.get("other")?.timeStart).toBe(5);
    expect(cache.get("new")?.timeStart).toBe(0);
    expect(cache.stats().bytes).toBe(24);
  });
});
