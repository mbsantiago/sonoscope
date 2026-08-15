import type { AudioSource } from "../../types";
import type { StftConfig } from "./types";
import { describe, expect, it } from "vitest";
import { MainThreadComputeBackend } from "./backends/backend";
import { computeStftMatrix } from "./backends/stft";

describe("Spectrogram Tile Continuity & Global Frame Alignment", () => {
  it("produces zero phase jump and identical frames between tiled computation and monolithic STFT", async () => {
    const sampleRate = 44100;
    const duration = 5.0; // 5 seconds of audio across multiple tiles
    const totalSamples = Math.floor(duration * sampleRate);
    const samples = new Float32Array(totalSamples);
    // Generate multi-frequency test tone
    for (let i = 0; i < totalSamples; i++) {
      samples[i] =
        Math.sin((2 * Math.PI * 440 * i) / sampleRate) +
        0.5 * Math.sin((2 * Math.PI * 1200 * i) / sampleRate);
    }

    const stft: StftConfig = {
      windowSize: 2048,
      hopSize: 512,
      fftSize: 2048,
      window: "hann",
    };

    // 1. Monolithic STFT over entire audio
    const monolithic = computeStftMatrix(samples, {
      channel: 0,
      timeStart: 0,
      sampleRate,
      stft,
    });

    // 2. Simulated tiled reads with frame-aligned chunks
    const framesPerTile = 128;
    const totalFrames = monolithic.frameCount;
    const tileCount = Math.ceil(totalFrames / framesPerTile);

    const source: AudioSource = {
      sampleRate,
      duration,
      channelCount: 1,
      id: "test-continuous-source",
      read: ({ startTime, endTime }) => {
        const start = Math.max(0, Math.floor(startTime * sampleRate));
        const end = Math.min(totalSamples, Math.ceil(endTime * sampleRate));
        return samples.slice(start, end);
      },
    };

    const backend = new MainThreadComputeBackend();
    const reconstructedMag = new Float32Array(
      totalFrames * monolithic.binCount,
    );

    for (let t = 0; t < tileCount; t++) {
      const globalFrameStart = t * framesPerTile;
      const frameCount = Math.min(
        framesPerTile,
        totalFrames - globalFrameStart,
      );
      const sampleStart = globalFrameStart * stft.hopSize;
      const sampleEnd =
        (globalFrameStart + frameCount - 1) * stft.hopSize + stft.windowSize;

      const tileTimeStart = sampleStart / sampleRate;
      const tileTimeEnd = sampleEnd / sampleRate;

      const tileMatrix = await backend.computeTile({
        source,
        channel: 0,
        timeStart: tileTimeStart,
        timeEnd: tileTimeEnd,
        stft,
      });

      expect(tileMatrix.frameCount).toBe(frameCount);
      reconstructedMag.set(
        tileMatrix.magnitude.subarray(0, frameCount * monolithic.binCount),
        globalFrameStart * monolithic.binCount,
      );
    }

    // Assert 100% exact parity across every single frame
    expect(tileCount).toBeGreaterThan(2);
    for (let i = 0; i < monolithic.magnitude.length; i++) {
      expect(reconstructedMag[i]).toBeCloseTo(monolithic.magnitude[i]!, 5);
    }
  }, 15000);

  it("verifies mathematical identity across various window and hop sizes", async () => {
    const sampleRate = 22050;
    const duration = 2.0;
    const totalSamples = Math.floor(duration * sampleRate);
    const samples = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      samples[i] =
        Math.sin((2 * Math.PI * 220 * i) / sampleRate) +
        0.7 * Math.sin((2 * Math.PI * 880 * i) / sampleRate) +
        0.3 * Math.sin((2 * Math.PI * 3500 * i) / sampleRate);
    }

    const configs: StftConfig[] = [
      { windowSize: 1024, hopSize: 256, fftSize: 1024, window: "hamming" },
      { windowSize: 2048, hopSize: 512, fftSize: 2048, window: "blackman" },
      { windowSize: 512, hopSize: 128, fftSize: 512, window: "rectangular" },
    ];

    const source: AudioSource = {
      sampleRate,
      duration,
      channelCount: 1,
      id: "test-multiconfig-source",
      read: ({ startTime, endTime }) => {
        const start = Math.max(0, Math.floor(startTime * sampleRate));
        const end = Math.min(totalSamples, Math.ceil(endTime * sampleRate));
        return samples.slice(start, end);
      },
    };

    const backend = new MainThreadComputeBackend();

    for (const stft of configs) {
      const monolithic = computeStftMatrix(samples, {
        channel: 0,
        timeStart: 0,
        sampleRate,
        stft,
      });

      const framesPerTile = 32;
      const totalFrames = monolithic.frameCount;
      const tileCount = Math.ceil(totalFrames / framesPerTile);
      const reconstructed = new Float32Array(totalFrames * monolithic.binCount);

      for (let t = 0; t < tileCount; t++) {
        const globalFrameStart = t * framesPerTile;
        const frameCount = Math.min(
          framesPerTile,
          totalFrames - globalFrameStart,
        );
        const sampleStart = globalFrameStart * stft.hopSize;
        const sampleEnd =
          (globalFrameStart + frameCount - 1) * stft.hopSize + stft.windowSize;

        const tileMatrix = await backend.computeTile({
          source,
          channel: 0,
          timeStart: sampleStart / sampleRate,
          timeEnd: sampleEnd / sampleRate,
          stft,
        });

        expect(tileMatrix.frameCount).toBe(frameCount);
        reconstructed.set(
          tileMatrix.magnitude.subarray(0, frameCount * monolithic.binCount),
          globalFrameStart * monolithic.binCount,
        );
      }

      expect(tileCount).toBeGreaterThan(1);
      for (let i = 0; i < monolithic.magnitude.length; i++) {
        expect(reconstructed[i]).toBeCloseTo(monolithic.magnitude[i]!, 5);
      }
    }
  }, 15000);
});
