import type { AudioSource } from "../../types";
import { describe, expect, it } from "vitest";
import { resolveConfig } from "./config";

const source: AudioSource = {
  id: "test-source",
  sampleRate: 48_000,
  duration: 10,
  channelCount: 1,
  read: () => new Float32Array(0),
};

describe("resolveConfig", () => {
  it("fills defaults and preserves provided source with flat properties", () => {
    const config = resolveConfig(source);
    expect(config.renderer).toBe("auto");
    expect(config.channel).toBe(0);

    // Flat STFT
    expect(config.windowSize).toBe(1024);
    expect(config.fftSize).toBe(1024);
    expect(config.hopSize).toBe(256);
    expect(config.window).toBe("hann");

    // Flat Viewport
    expect(config.startTime).toBe(0);
    expect(config.endTime).toBe(10);
    expect(config.minFrequency).toBe(0);
    expect(config.maxFrequency).toBe(24000);
    expect(config.frequencyScale).toBe("linear");
    expect(config.minViewportDuration).toBe(0.05);
    expect(config.maxViewportDuration).toBe(10);

    // Flat Value Scale
    expect(config.valueMode).toBe("db");
    expect(config.minDb).toBe(-100);
    expect(config.maxDb).toBe(0);
    expect(config.valueGamma).toBe(1);
    expect(config.clampValues).toBe(true);

    // Flat Cache
    expect(config.tileMaxCells).toBe(2 ** 17); // 131_072
    expect(config.prefetchTiles).toBeGreaterThanOrEqual(4);
    expect(config.maxCachedTiles).toBeGreaterThanOrEqual(64);

    // Modular
    expect(config.colorMap).toBe("viridis");
    expect(config.transforms).toEqual([]);
  });

  it("supports flat user inputs", () => {
    const config = resolveConfig(source, {
      windowSize: 512,
      fftSize: 512,
      hopSize: 128,
      window: "blackman",
      startTime: 2,
      endTime: 5,
      frequencyScale: "mel",
      valueMode: "magnitude",
      minDb: -80,
      maxDb: -10,
      tileMaxCells: 262_144,
    });

    expect(config.windowSize).toBe(512);
    expect(config.fftSize).toBe(512);
    expect(config.hopSize).toBe(128);
    expect(config.window).toBe("blackman");
    expect(config.startTime).toBe(2);
    expect(config.endTime).toBe(5);
    expect(config.frequencyScale).toBe("mel");
    expect(config.valueMode).toBe("magnitude");
    expect(config.minDb).toBe(-80);
    expect(config.maxDb).toBe(-10);
    expect(config.tileMaxCells).toBe(262_144);
  });

  it("preserves explicit renderer modes", () => {
    expect(resolveConfig(source, { renderer: "canvas2d" }).renderer).toBe(
      "canvas2d",
    );
    expect(resolveConfig(source, { renderer: "webgl" }).renderer).toBe("webgl");
    expect(resolveConfig(source, { renderer: "webgl2" }).renderer).toBe(
      "webgl2",
    );
    expect(
      resolveConfig(source, {
        renderer: { type: "webgl", program: "halftone" },
      }).renderer,
    ).toEqual({ type: "webgl", program: "halftone" });
  });

  it("validates selected channel against the source", () => {
    expect(
      resolveConfig({ ...source, channelCount: 2 }, { channel: 1 }).channel,
    ).toBe(1);
    expect(() => resolveConfig(source, { channel: 1 })).toThrow(
      /outside source channel count/,
    );
    expect(() => resolveConfig(source, { channel: -1 })).toThrow(
      /non-negative integer/,
    );
  });

  it("throws when fftSize is not a power of two", () => {
    expect(() => resolveConfig(source, { fftSize: 1000 })).toThrow(
      /power of two/,
    );
  });

  it("throws when source is not provided", () => {
    expect(() =>
      resolveConfig(
        undefined as unknown as Parameters<typeof resolveConfig>[0],
      ),
    ).toThrow(/requires a source/);
  });

  it("clamps viewport duration to configured bounds", () => {
    const config = resolveConfig(source, {
      startTime: 1,
      endTime: 9,
      minViewportDuration: 1,
      maxViewportDuration: 3,
    });

    expect(config.startTime).toBe(1);
    expect(config.endTime).toBe(4);
    expect(config.minViewportDuration).toBe(1);
    expect(config.maxViewportDuration).toBe(3);
  });

  it("safely handles short duration audio sources shorter than default minViewportDuration", () => {
    const shortSource: AudioSource = {
      id: "short-source",
      sampleRate: 44100,
      duration: 0.02,
      channelCount: 1,
      read: () => new Float32Array(0),
    };

    const config = resolveConfig(shortSource);
    expect(config.minViewportDuration).toBe(0.02);
    expect(config.maxViewportDuration).toBe(0.02);
    expect(config.startTime).toBe(0);
    expect(config.endTime).toBe(0.02);
  });

  it("throws when maxViewportDuration is explicitly smaller than minViewportDuration", () => {
    expect(() =>
      resolveConfig(source, {
        minViewportDuration: 5,
        maxViewportDuration: 2,
      }),
    ).toThrow(
      /maxViewportDuration must be greater than or equal to minViewportDuration/,
    );
  });
});
