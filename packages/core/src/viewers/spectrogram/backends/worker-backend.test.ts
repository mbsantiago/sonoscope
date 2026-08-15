import { describe, expect, it } from "vitest";
import { PerformanceProfiler } from "../../../performance";
import type { AudioSource } from "../../../types";
import type { SpectrogramMatrix } from "../types";
import {
  type SpectrogramWorkerLike,
  WorkerComputeBackend,
} from "./worker-backend";

class FakeWorker implements SpectrogramWorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  readonly posted: unknown[] = [];

  postMessage(message: unknown): void {
    this.posted.push(message);
    const request = message as {
      id: number;
      channel: number;
      timeStart: number;
      sampleRate: number;
    };
    const matrix: SpectrogramMatrix = {
      channel: request.channel,
      timeStart: request.timeStart,
      timeEnd: request.timeStart + 1,
      frameStart: 0,
      frameCount: 1,
      binCount: 1,
      sampleRate: request.sampleRate,
      times: Float32Array.from([request.timeStart]),
      frequencies: Float32Array.from([0]),
      magnitude: Float32Array.from([1]),
      power: Float32Array.from([1]),
      db: Float32Array.from([0]),
    };
    queueMicrotask(() =>
      this.onmessage?.({
        data: { id: request.id, matrix, computeDuration: 5 },
      } as MessageEvent),
    );
  }

  terminate(): void {
    this.terminated = true;
  }
}

function source(): AudioSource {
  return {
    id: "worker-source",
    sampleRate: 1024,
    duration: 1,
    channelCount: 1,
    read: () => Float32Array.from([0, 1, 0, -1]),
  };
}

describe("WorkerComputeBackend", () => {
  it("reads samples on the main thread and resolves worker matrices", async () => {
    const workers: FakeWorker[] = [];
    const backend = new WorkerComputeBackend({
      workerCount: 1,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });

    const matrix = await backend.computeTile({
      source: source(),
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      stft: { windowSize: 4, fftSize: 4, hopSize: 2, window: "hann" },
    });

    expect(matrix.magnitude[0]).toBe(1);
    expect(workers[0]?.posted).toHaveLength(1);
  });

  it("records queue, source read, worker compute, and total timings", async () => {
    const profiler = new PerformanceProfiler(() => 100);
    const backend = new WorkerComputeBackend({
      workerCount: 1,
      createWorker: () => new FakeWorker(),
    });

    await backend.computeTile({
      source: source(),
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      stft: { windowSize: 4, fftSize: 4, hopSize: 2, window: "hann" },
      profile: profiler,
    });

    const names = profiler.measures().map((measure) => measure.name);
    expect(names).toContain("tile.queue.wait");
    expect(names).toContain("tile.source.read");
    expect(names).toContain("tile.stft.compute");
    expect(names).toContain("tile.total");
  });

  it("rejects queued jobs when destroyed", async () => {
    let release: (() => void) | undefined;
    const backend = new WorkerComputeBackend({
      workerCount: 1,
      createWorker: () => ({
        onmessage: null,
        onerror: null,
        postMessage: () => undefined,
        terminate: () => release?.(),
      }),
    });

    const promise = backend.computeTile({
      source: source(),
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      stft: { windowSize: 4, fftSize: 4, hopSize: 2, window: "hann" },
    });
    release = () => undefined;
    backend.destroy();

    await expect(promise).rejects.toThrow(/destroyed/);
  });
});
