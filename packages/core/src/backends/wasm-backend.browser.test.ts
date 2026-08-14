import { describe, expect, it } from "vitest";
import type { AudioSource } from "../types";
import { WasmWorkerComputeBackend } from "./wasm-backend";
import { computeWasmStftMatrix, createWasmStftEngine } from "./wasm-stft";

describe("WASM in real browser", () => {
  it("instantiates WebAssembly engine directly in browser", async () => {
    const engine = await createWasmStftEngine();
    expect(engine).toBeDefined();

    const samples = new Float32Array(1024).fill(0.5);
    const matrix = await computeWasmStftMatrix(samples, {
      channel: 0,
      timeStart: 0,
      sampleRate: 44100,
      stft: {
        windowSize: 1024,
        fftSize: 1024,
        hopSize: 256,
        window: "hann",
      },
    });

    expect(matrix.frameCount).toBeGreaterThan(0);
    expect(matrix.magnitude.length).toBeGreaterThan(0);
  });

  it("computes tile via real WasmWorkerComputeBackend in browser", async () => {
    const backend = new WasmWorkerComputeBackend();
    const samples = new Float32Array(2048).fill(0.2);
    const source: AudioSource = {
      id: "browser-test-source",
      sampleRate: 44100,
      duration: 1,
      channelCount: 1,
      read: () => samples,
    };

    const matrix = await backend.computeTile({
      channel: 0,
      timeStart: 0,
      timeEnd: 0.05,
      source,
      stft: {
        windowSize: 1024,
        fftSize: 1024,
        hopSize: 256,
        window: "hann",
      },
    });

    expect(matrix.frameCount).toBeGreaterThan(0);
    backend.destroy();
  });
});
