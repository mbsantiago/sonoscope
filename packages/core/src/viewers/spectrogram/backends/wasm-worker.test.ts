import type { AudioSource } from "../../../types";
import type { SpectrogramWorkerLike } from "./worker-backend";
import { describe, expect, it } from "vitest";
import { WasmComputeBackend, WasmWorkerComputeBackend } from "./wasm-backend";
import { computeWasmStftMatrix } from "./wasm-stft";

function createAudioSource(): AudioSource {
  const sampleRate = 1000;
  const samples = new Float32Array(1000);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * 100 * i) / sampleRate);
  }
  return {
    id: "test-audio-source",
    sampleRate,
    duration: 1,
    channelCount: 1,
    read: () => samples,
  };
}

class FakeWasmWorker implements SpectrogramWorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  readonly posted: unknown[] = [];

  postMessage(message: unknown): void {
    this.posted.push(message);
    const req = message as {
      id: number;
      channel: number;
      timeStart: number;
      sampleRate: number;
      stft: {
        windowSize: number;
        fftSize: number;
        hopSize: number;
        window: "hann";
      };
      samples: Float32Array;
    };

    void computeWasmStftMatrix(req.samples, {
      channel: req.channel,
      timeStart: req.timeStart,
      sampleRate: req.sampleRate,
      stft: req.stft,
    }).then((matrix) => {
      this.onmessage?.({
        data: { id: req.id, matrix, computeDuration: 2.5 },
      } as MessageEvent);
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe("WasmComputeBackend (Main Thread)", () => {
  it("computes tiles using WASM on main thread", async () => {
    const backend = new WasmComputeBackend();
    const source = createAudioSource();

    const matrix = await backend.computeTile({
      source,
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      stft: { windowSize: 128, fftSize: 128, hopSize: 64, window: "hann" },
    });

    expect(matrix.channel).toBe(0);
    expect(matrix.binCount).toBe(64);
    expect(matrix.frameCount).toBeGreaterThan(0);
    expect(matrix.magnitude.length).toBe(matrix.frameCount * matrix.binCount);
  });
});

describe("WasmWorkerComputeBackend", () => {
  it("processes tile requests via worker pool using WASM", async () => {
    const workers: FakeWasmWorker[] = [];
    const backend = new WasmWorkerComputeBackend({
      workerCount: 1,
      createWorker: () => {
        const worker = new FakeWasmWorker();
        workers.push(worker);
        return worker;
      },
    });

    const source = createAudioSource();
    const matrix = await backend.computeTile({
      source,
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      stft: { windowSize: 128, fftSize: 128, hopSize: 64, window: "hann" },
    });

    expect(workers).toHaveLength(1);
    expect(matrix.channel).toBe(0);
    expect(matrix.binCount).toBe(64);
    expect(matrix.magnitude.length).toBeGreaterThan(0);
    backend.destroy();
  });
});
