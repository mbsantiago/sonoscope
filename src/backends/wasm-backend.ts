import type { SpectrogramMatrix } from "../types";
import type { ComputeTileRequest, SpectrogramComputeBackend } from "./backend";
import { getWasmStftEngine, type WasmStftEngine } from "./wasm-stft";
import {
  type SpectrogramWorkerLike,
  WorkerComputeBackend,
  type WorkerComputeBackendOptions,
} from "./worker-backend";

export function createDefaultWasmWorker(
  workerUrl: URL | string = new URL("./wasm-worker.ts", import.meta.url),
): SpectrogramWorkerLike {
  return new Worker(workerUrl, { type: "module" });
}

export class WasmComputeBackend implements SpectrogramComputeBackend {
  private enginePromise: Promise<WasmStftEngine>;

  constructor(engine?: WasmStftEngine | Promise<WasmStftEngine>) {
    this.enginePromise = engine ? Promise.resolve(engine) : getWasmStftEngine();
  }

  async computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix> {
    const compute = async () => {
      const samples = request.profile
        ? await request.profile.measureAsync(
            "tile.source.read",
            {
              channel: request.channel,
              timeStart: request.timeStart,
              timeEnd: request.timeEnd,
            },
            async () =>
              await request.source.read({
                channel: request.channel,
                startTime: request.timeStart,
                endTime: request.timeEnd,
              }),
          )
        : await request.source.read({
            channel: request.channel,
            startTime: request.timeStart,
            endTime: request.timeEnd,
          });

      const engine = await this.enginePromise;

      return request.profile
        ? request.profile.measure(
            "tile.stft.compute",
            {
              channel: request.channel,
              samples: samples.length,
              fftSize: request.stft.fftSize,
            },
            () =>
              engine.computeMatrix(samples, {
                channel: request.channel,
                timeStart: request.timeStart,
                sampleRate: request.source.sampleRate,
                stft: request.stft,
              }),
          )
        : engine.computeMatrix(samples, {
            channel: request.channel,
            timeStart: request.timeStart,
            sampleRate: request.source.sampleRate,
            stft: request.stft,
          });
    };

    return request.profile
      ? request.profile.measureAsync(
          "tile.total",
          {
            channel: request.channel,
            timeStart: request.timeStart,
            timeEnd: request.timeEnd,
          },
          compute,
        )
      : compute();
  }
}

export class WasmWorkerComputeBackend extends WorkerComputeBackend {
  constructor(options: WorkerComputeBackendOptions = {}) {
    super({
      ...options,
      createWorker:
        options.createWorker ??
        (() => createDefaultWasmWorker(options.workerUrl)),
    });
  }
}
