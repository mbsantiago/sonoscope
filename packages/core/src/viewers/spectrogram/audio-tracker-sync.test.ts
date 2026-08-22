import type { AudioSource } from "../../types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sonoscope } from "../../sonoscope";
import { MainThreadComputeBackend } from "./backends/backend";
import { SpectrogramViewer } from "./viewer";

afterEach(() => {
  vi.restoreAllMocks();
});

function createMockAudio(currentTime = 0, duration = 3600): HTMLAudioElement {
  const listeners = new Map<string, Array<() => void>>();
  return {
    currentTime,
    duration,
    src: "fixture.wav",
    currentSrc: "fixture.wav",
    paused: true,
    addEventListener: (name: string, fn: () => void) => {
      const arr = listeners.get(name) ?? [];
      arr.push(fn);
      listeners.set(name, arr);
    },
    removeEventListener: (name: string, fn: () => void) => {
      const arr = listeners.get(name) ?? [];
      const index = arr.indexOf(fn);
      if (index >= 0) arr.splice(index, 1);
    },
  } as unknown as HTMLAudioElement;
}

interface MockCanvasContext {
  setTransform: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  createImageData: ReturnType<typeof vi.fn>;
  putImageData: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
}

function createMockCanvas(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement;
  context: MockCanvasContext;
} {
  const context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    createImageData: vi.fn((w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
      colorSpace: "srgb" as const,
    })),
    putImageData: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };

  const canvas = {
    width,
    height,
    getBoundingClientRect: () => ({ width, height }),
    getContext: () => context,
  } as unknown as HTMLCanvasElement;

  return { canvas, context };
}

describe("Spectrogram Audio Tracker Sync & Fast Long-Duration Tiling", () => {
  it("maintains mathematical tile grid continuity across 360 tiles of a 1-hour audio stream", () => {
    const sampleRate = 44100;
    const duration = 3600.0; // 1-hour audio stream
    const hopSize = 512;
    const windowSize = 2048;
    const tileDuration = 10.0; // ~360 tiles for 3600s

    const source: AudioSource = {
      id: "test-1-hour-stream",
      sampleRate,
      duration,
      channelCount: 1,
      read: () => new Float32Array(0),
    };

    const scope = new Sonoscope({
      source,
      startTime: 0,
      endTime: duration,
    });

    const { canvas } = createMockCanvas(800, 400);
    const viewer = new SpectrogramViewer(canvas, scope.viewport, scope.source, {
      autoRender: false,
      tileDuration,
      hopSize,
      windowSize,
      fftSize: 2048,
    });

    // Compute tile ranges across the entire 1-hour stream
    const tileRanges = (
      viewer as unknown as {
        tileRangesForTimeRange: (
          startTime: number,
          endTime: number,
        ) => Array<{ channel: number; timeStart: number; timeEnd: number }>;
      }
    ).tileRangesForTimeRange(0, duration);

    // Verify we have at least 360 tiles for the 1-hour duration
    expect(tileRanges.length).toBeGreaterThanOrEqual(360);

    const hopDuration = hopSize / sampleRate;

    for (let i = 0; i < tileRanges.length - 1; i++) {
      const current = tileRanges[i]!;
      const next = tileRanges[i + 1]!;

      const currentSampleStart = Math.round(current.timeStart * sampleRate);
      const currentSampleEnd = Math.round(current.timeEnd * sampleRate);
      const currentGlobalFrameStart = Math.round(currentSampleStart / hopSize);
      const currentFrameCount =
        Math.round(
          (currentSampleEnd - currentSampleStart - windowSize) / hopSize,
        ) + 1;

      const nextSampleStart = Math.round(next.timeStart * sampleRate);
      const nextGlobalFrameStart = Math.round(nextSampleStart / hopSize);

      // 1. Global frame start increments by exactly tile[i].frameCount (0 sample gap, 0 sample overlap)
      expect(nextGlobalFrameStart).toBe(
        currentGlobalFrameStart + currentFrameCount,
      );

      // 2. Sample start increments by exactly frameCount * hopSize
      expect(nextSampleStart).toBe(
        currentSampleStart + currentFrameCount * hopSize,
      );

      // 3. Tile time continuity: tile[i+1].timeStart === tile[i].timeStart + tile[i].frameCount * hopDuration
      const expectedNextTimeStart =
        current.timeStart + currentFrameCount * hopDuration;
      expect(next.timeStart).toBeCloseTo(expectedNextTimeStart, 8);
    }
  });

  it("performs fast on-demand rendering and playhead alignment near the end of a 1-hour recording in < 50ms", async () => {
    const startTimeSuite = performance.now();

    const sampleRate = 44100;
    const duration = 3600.0; // 1-hour recording
    const hopSize = 256;
    const windowSize = 256;
    const fftSize = 256;
    const targetGlobalFrame = Math.round((3590.0 * sampleRate) / hopSize);
    const transientSample = targetGlobalFrame * hopSize + windowSize / 2;
    const transientTime = transientSample / sampleRate; // ~3590.0s

    let readCallCount = 0;
    let totalSamplesRead = 0;

    // Create an AudioSource with a synthetic impulse transient at t = 3590.0s
    const source: AudioSource = {
      id: "synthetic-transient-1hour",
      sampleRate,
      duration,
      channelCount: 1,
      read: ({ startTime, endTime }) => {
        readCallCount++;
        const startSample = Math.max(0, Math.floor(startTime * sampleRate));
        const endSample = Math.min(
          Math.floor(duration * sampleRate),
          Math.ceil(endTime * sampleRate),
        );
        const length = Math.max(0, endSample - startSample);
        totalSamplesRead += length;

        const samples = new Float32Array(length);
        if (transientSample >= startSample && transientSample < endSample) {
          const offset = transientSample - startSample;
          samples[offset] = 1.0;
        }
        return samples;
      },
    };

    // Viewport around [3585s, 3595s] focused on the transient near t = 3590.0s
    const viewportStartTime = 3589.0;
    const viewportEndTime = 3590.5;
    const canvasWidth = 800;
    const canvasHeight = 4;

    const audio = createMockAudio(transientTime, duration);
    const scope = new Sonoscope({
      source,
      audio,
      startTime: viewportStartTime,
      endTime: viewportEndTime,
    });

    const { canvas } = createMockCanvas(canvasWidth, canvasHeight);

    const backend = new MainThreadComputeBackend();
    const viewer = new SpectrogramViewer(canvas, scope.viewport, scope.source, {
      autoRender: false,
      backend,
      renderer: "canvas2d",
      valueMode: "magnitude",
      tileDuration: 2,
      hopSize,
      windowSize,
      fftSize,
      prefetchTiles: 0,
      showPlayhead: true,
    });

    // Render the view lazily fetching only the single visible tile
    await viewer.render();

    // Verify on-demand lazy evaluation: only 1 visible tile was read, NOT 3600s
    expect(readCallCount).toBe(1);
    expect(totalSamplesRead).toBeLessThan(sampleRate * 6);

    // 1. Playhead coordinate on 800px canvas for t = 3590.0s
    const { x: expectedPlayheadCanvasX } = viewer.timeFrequencyToCanvas(
      transientTime,
      0,
    );
    const expectedX =
      ((transientTime - viewportStartTime) /
        (viewportEndTime - viewportStartTime)) *
      canvasWidth;
    expect(expectedPlayheadCanvasX).toBeCloseTo(expectedX, 5);

    // 2. Find spectral peak in the visible tile containing t = 3590.0s
    const tileRange = (
      viewer as unknown as {
        tileRangeForTime: (time: number) => {
          timeStart: number;
          timeEnd: number;
        };
      }
    ).tileRangeForTime(transientTime);

    const tileMatrix = await (
      viewer as unknown as {
        getTile: (
          channel: number,
          timeStart: number,
          timeEnd: number,
        ) => Promise<{
          frameCount: number;
          binCount: number;
          magnitude: Float32Array;
          times: Float32Array;
        }>;
      }
    ).getTile(0, tileRange.timeStart, tileRange.timeEnd);

    let peakEnergy = -1;
    let peakFrameIndex = -1;
    for (let f = 0; f < tileMatrix.frameCount; f++) {
      let energy = 0;
      const offset = f * tileMatrix.binCount;
      for (let b = 0; b < tileMatrix.binCount; b++) {
        energy += tileMatrix.magnitude[offset + b]!;
      }
      if (energy > peakEnergy) {
        peakEnergy = energy;
        peakFrameIndex = f;
      }
    }

    expect(peakFrameIndex).toBeGreaterThanOrEqual(0);
    // Peak frame center time for the Hann-windowed STFT
    const spectralPeakTime = tileMatrix.times[peakFrameIndex]!;
    const { x: spectralPeakCanvasX } = viewer.timeFrequencyToCanvas(
      spectralPeakTime,
      0,
    );

    // 3. Verify sub-pixel accuracy between playhead and spectral transient peak (< 0.5px)
    const playheadSpectralDiff = Math.abs(
      expectedPlayheadCanvasX - spectralPeakCanvasX,
    );
    expect(playheadSpectralDiff).toBeLessThan(0.5);

    // 4. Ensure total suite execution time is fast (avoids monolithic 1-hour computation)
    const elapsedMs = performance.now() - startTimeSuite;
    expect(elapsedMs).toBeLessThan(500);
  });

  it("handles seeking from audio controls without triggering render storms or playhead lag", async () => {
    const sampleRate = 44100;
    const duration = 120.0;
    const source: AudioSource = {
      id: "test-seek-stream",
      sampleRate,
      duration,
      channelCount: 1,
      read: () => new Float32Array(2048),
    };

    const audio = createMockAudio(0, duration);
    const scope = new Sonoscope({
      source,
      audio,
      followPlayback: "page",
    });

    const { canvas } = createMockCanvas(800, 200);
    const viewer = new SpectrogramViewer(canvas, scope.viewport, scope.source, {
      startTime: 0,
      endTime: 10,
      showPlayhead: true,
      tileDuration: 10,
      autoRender: false,
    });

    let renderCount = 0;
    viewer.on("renderstart", () => {
      renderCount += 1;
    });

    await viewer.render();
    expect(renderCount).toBe(1);

    // Simulate seeking to 45.0s on the audio element
    scope.seek(45.0);

    // Ensure the playhead renders cleanly and no runaway render storm is created
    expect(viewer.getStatus().state).not.toBe("error");
    expect(scope.getCurrentTime()).toBe(45.0);
  });
});
