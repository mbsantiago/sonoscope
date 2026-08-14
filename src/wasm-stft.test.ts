import { describe, expect, it } from "vitest";
import { computeStftMatrix } from "./stft";
import type { StftConfig } from "./types";
import { computeWasmStftMatrix, getWasmStftEngine } from "./wasm-stft";

function generateSineWave(
  sampleRate: number,
  frequency: number,
  durationSeconds: number,
): Float32Array {
  const count = Math.floor(sampleRate * durationSeconds);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return samples;
}

describe("WASM STFT compute engine", () => {
  it("initializes the WASM STFT engine", async () => {
    const engine = await getWasmStftEngine();
    expect(engine).toBeDefined();
  });

  it("produces results mathematically equivalent to JS STFT for pure sine wave", async () => {
    const sampleRate = 1024;
    const samples = generateSineWave(sampleRate, 128, 0.5);
    const stftConfig: StftConfig = {
      windowSize: 256,
      fftSize: 256,
      hopSize: 128,
      window: "hann",
    };

    const jsMatrix = computeStftMatrix(samples, {
      channel: 0,
      timeStart: 0,
      sampleRate,
      stft: stftConfig,
    });

    const wasmMatrix = await computeWasmStftMatrix(samples, {
      channel: 0,
      timeStart: 0,
      sampleRate,
      stft: stftConfig,
    });

    expect(wasmMatrix.frameCount).toBe(jsMatrix.frameCount);
    expect(wasmMatrix.binCount).toBe(jsMatrix.binCount);
    expect(wasmMatrix.magnitude.length).toBe(jsMatrix.magnitude.length);

    // Verify magnitude arrays are close within floating point tolerance
    for (let i = 0; i < jsMatrix.magnitude.length; i++) {
      expect(wasmMatrix.magnitude[i]).toBeCloseTo(jsMatrix.magnitude[i]!, 4);
      if (jsMatrix.power && wasmMatrix.power) {
        expect(wasmMatrix.power[i]).toBeCloseTo(jsMatrix.power[i]!, 4);
      }
      if (jsMatrix.db && wasmMatrix.db) {
        if (jsMatrix.db[i]! > -100) {
          expect(wasmMatrix.db[i]).toBeCloseTo(jsMatrix.db[i]!, 1);
        } else {
          expect(wasmMatrix.db[i]).toBeLessThan(-100);
        }
      }
    }
  });

  it("supports all window types correctly", async () => {
    const sampleRate = 512;
    const samples = generateSineWave(sampleRate, 64, 0.25);
    const windows = ["hann", "hamming", "blackman", "rectangular"] as const;

    for (const window of windows) {
      const stftConfig: StftConfig = {
        windowSize: 64,
        fftSize: 64,
        hopSize: 32,
        window,
      };

      const jsMatrix = computeStftMatrix(samples, {
        channel: 1,
        timeStart: 1.5,
        sampleRate,
        stft: stftConfig,
      });

      const wasmMatrix = await computeWasmStftMatrix(samples, {
        channel: 1,
        timeStart: 1.5,
        sampleRate,
        stft: stftConfig,
      });

      expect(wasmMatrix.channel).toBe(1);
      expect(wasmMatrix.timeStart).toBe(1.5);
      expect(wasmMatrix.frameCount).toBe(jsMatrix.frameCount);

      for (let i = 0; i < jsMatrix.magnitude.length; i++) {
        expect(wasmMatrix.magnitude[i]).toBeCloseTo(jsMatrix.magnitude[i]!, 4);
      }
    }
  });

  it("handles zero padding when fftSize > windowSize", async () => {
    const sampleRate = 1000;
    const samples = generateSineWave(sampleRate, 100, 0.2);
    const stftConfig: StftConfig = {
      windowSize: 128,
      fftSize: 256,
      hopSize: 64,
      window: "hann",
    };

    const jsMatrix = computeStftMatrix(samples, {
      channel: 0,
      timeStart: 0,
      sampleRate,
      stft: stftConfig,
    });

    const wasmMatrix = await computeWasmStftMatrix(samples, {
      channel: 0,
      timeStart: 0,
      sampleRate,
      stft: stftConfig,
    });

    expect(wasmMatrix.binCount).toBe(128);
    for (let i = 0; i < jsMatrix.magnitude.length; i++) {
      expect(wasmMatrix.magnitude[i]).toBeCloseTo(jsMatrix.magnitude[i]!, 4);
    }
  });

  it("handles empty or sub-window audio cleanly", async () => {
    const samples = new Float32Array(50);
    const stftConfig: StftConfig = {
      windowSize: 128,
      fftSize: 128,
      hopSize: 64,
      window: "hann",
    };

    const wasmMatrix = await computeWasmStftMatrix(samples, {
      channel: 0,
      timeStart: 0,
      sampleRate: 1000,
      stft: stftConfig,
    });

    expect(wasmMatrix.frameCount).toBe(0);
    expect(wasmMatrix.magnitude.length).toBe(0);
  });
});
