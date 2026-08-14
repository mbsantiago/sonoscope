import { describe, expect, it } from "vitest";
import { resolveConfig } from "./config";
import type { AudioSource } from "./types";

const source: AudioSource = {
  id: "test-source",
  sampleRate: 48_000,
  duration: 10,
  channelCount: 1,
  read: () => new Float32Array(0),
};

const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;

describe("resolveConfig", () => {
  it("fills defaults and preserves provided source with flat properties", () => {
    const config = resolveConfig({ canvas, source });
    expect(config.source).toBe(source);
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
    expect(config.minValue).toBe(-100);
    expect(config.maxValue).toBe(0);
    expect(config.valueGamma).toBe(1);
    expect(config.clampValues).toBe(true);

    // Flat Playback
    expect(config.showPlayhead).toBe(true);
    expect(config.followPlayback).toBe(false);
    expect(config.followMargin).toBe(0.2);
    expect(config.renderOnSeek).toBe(true);

    // Flat Cache
    expect(config.tileDuration).toBe(5);
    expect(config.prefetchTiles).toBeGreaterThanOrEqual(4);
    expect(config.maxCachedTiles).toBeGreaterThanOrEqual(64);

    // Superpowers & Modular
    expect(config.secretSpectrogram3d).toBe(false);
    expect(config.colorMap).toBe("viridis");
    expect(config.transforms).toEqual([]);
  });

  it("supports flat user inputs", () => {
    const config = resolveConfig({
      canvas,
      source,
      windowSize: 512,
      fftSize: 512,
      hopSize: 128,
      window: "blackman",
      startTime: 2,
      endTime: 5,
      frequencyScale: "mel",
      valueMode: "magnitude",
      minValue: 0,
      maxValue: 1,
      followPlayback: true,
      tileDuration: 10,
      secretSpectrogram3d: true,
    });

    expect(config.windowSize).toBe(512);
    expect(config.fftSize).toBe(512);
    expect(config.hopSize).toBe(128);
    expect(config.window).toBe("blackman");
    expect(config.startTime).toBe(2);
    expect(config.endTime).toBe(5);
    expect(config.frequencyScale).toBe("mel");
    expect(config.valueMode).toBe("magnitude");
    expect(config.minValue).toBe(0);
    expect(config.maxValue).toBe(1);
    expect(config.followPlayback).toBe(true);
    expect(config.tileDuration).toBe(10);
    expect(config.secretSpectrogram3d).toBe(true);
  });

  it("supports legacy nested config inputs during transition", () => {
    const config = resolveConfig({
      canvas,
      source,
      stft: {
        windowSize: 2048,
        fftSize: 2048,
        hopSize: 512,
        window: "hamming",
      },
      viewport: { startTime: 1, endTime: 6, frequencyScale: "log" },
      viewportConstraints: { minDurationSeconds: 0.1, maxDurationSeconds: 15 },
      valueScale: { mode: "power", min: 0.01, max: 10, gamma: 2, clamp: false },
      playback: {
        showPlayhead: false,
        follow: true,
        followMargin: 0.3,
        renderOnSeek: false,
      },
      cache: { tileDurationSeconds: 8, maxCachedTiles: 128, prefetchTiles: 12 },
      superpowers: { secretSpectrogram3d: true },
    });

    expect(config.windowSize).toBe(2048);
    expect(config.fftSize).toBe(2048);
    expect(config.hopSize).toBe(512);
    expect(config.window).toBe("hamming");
    expect(config.startTime).toBe(1);
    expect(config.endTime).toBe(6);
    expect(config.frequencyScale).toBe("log");
    expect(config.minViewportDuration).toBe(0.1);
    expect(config.maxViewportDuration).toBe(15);
    expect(config.valueMode).toBe("power");
    expect(config.minValue).toBe(0.01);
    expect(config.maxValue).toBe(10);
    expect(config.valueGamma).toBe(2);
    expect(config.clampValues).toBe(false);
    expect(config.showPlayhead).toBe(false);
    expect(config.followPlayback).toBe(true);
    expect(config.followMargin).toBe(0.3);
    expect(config.renderOnSeek).toBe(false);
    expect(config.tileDuration).toBe(8);
    expect(config.maxCachedTiles).toBe(128);
    expect(config.prefetchTiles).toBe(12);
    expect(config.secretSpectrogram3d).toBe(true);
  });

  it("preserves explicit renderer modes", () => {
    expect(
      resolveConfig({ canvas, source, renderer: "canvas2d" }).renderer,
    ).toBe("canvas2d");
    expect(resolveConfig({ canvas, source, renderer: "webgl" }).renderer).toBe(
      "webgl",
    );
    expect(resolveConfig({ canvas, source, renderer: "webgl2" }).renderer).toBe(
      "webgl2",
    );
    expect(
      resolveConfig({
        canvas,
        source,
        renderer: { type: "webgl", program: "dither" },
      }).renderer,
    ).toEqual({ type: "webgl", program: "dither" });
  });

  it("validates selected channel against the source", () => {
    expect(
      resolveConfig({
        canvas,
        source: { ...source, channelCount: 2 },
        channel: 1,
      }).channel,
    ).toBe(1);
    expect(() => resolveConfig({ canvas, source, channel: 1 })).toThrow(
      /outside source channel count/,
    );
    expect(() => resolveConfig({ canvas, source, channel: -1 })).toThrow(
      /non-negative integer/,
    );
  });

  it("throws when fftSize is not a power of two", () => {
    expect(() => resolveConfig({ canvas, source, fftSize: 1000 })).toThrow(
      /power of two/,
    );
  });

  it("throws when neither source nor audio is provided", () => {
    expect(() => resolveConfig({ canvas })).toThrow(/source or audio/);
  });

  it("clamps viewport duration to configured bounds", () => {
    const config = resolveConfig({
      canvas,
      source,
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
});
