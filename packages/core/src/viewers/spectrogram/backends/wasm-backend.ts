import type { SpectrogramMatrix } from "../types";
import type { ComputeTileRequest, SpectrogramComputeBackend } from "./backend";
import { getWasmStftEngine, type WasmStftEngine } from "./wasm-stft";
import { WASM_STFT_BASE64 } from "./wasm-stft-binary";
import {
  type SpectrogramWorkerLike,
  WorkerComputeBackend,
  type WorkerComputeBackendOptions,
} from "./worker-backend";

function getWasmWorkerScript(): string {
  return `
const WASM_BASE64 = "${WASM_STFT_BASE64}";
let wasmEnginePromise = null;

function base64ToBytes(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function getWasmEngine() {
  if (!wasmEnginePromise) {
    wasmEnginePromise = WebAssembly.instantiate(base64ToBytes(WASM_BASE64), {}).then((res) => res.instance.exports);
  }
  return wasmEnginePromise;
}

const windowMap = { hann: 0, hamming: 1, blackman: 2, rectangular: 3 };

self.onmessage = async (event) => {
  const start = performance.now();
  const req = event.data;
  try {
    const exports = await getWasmEngine();
    const { stft_alloc, stft_dealloc, stft_process, memory } = exports;
    const { channel, timeStart, sampleRate, stft, samples } = req;

    const frameCount = Math.max(0, Math.floor((samples.length - stft.windowSize) / stft.hopSize) + 1);
    const binCount = Math.floor(stft.fftSize / 2);
    const totalBins = frameCount * binCount;

    const times = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
      times[i] =
        timeStart + (i * stft.hopSize + stft.windowSize / 2) / sampleRate;
    }
    const frequencies = new Float32Array(binCount);
    for (let i = 0; i < binCount; i++) {
      frequencies[i] = (i * sampleRate) / stft.fftSize;
    }

    if (frameCount === 0 || samples.length === 0) {
      self.postMessage({
        id: req.id,
        matrix: {
          channel,
          timeStart,
          timeEnd: timeStart + samples.length / sampleRate,
          frameStart: Math.round((timeStart * sampleRate) / stft.hopSize),
          frameCount: 0,
          binCount,
          sampleRate,
          times,
          frequencies,
          magnitude: new Float32Array(0),
          power: new Float32Array(0),
          db: new Float32Array(0),
        },
        computeDuration: performance.now() - start,
      });
      return;
    }

    const windowTypeU32 = windowMap[stft.window] ?? 0;
    const sampleBytes = samples.length * 4;
    const totalBinBytes = totalBins * 4;

    const samplesPtr = stft_alloc(sampleBytes);
    const outMagPtr = stft_alloc(totalBinBytes);
    const outPowerPtr = stft_alloc(totalBinBytes);
    const outDbPtr = stft_alloc(totalBinBytes);

    try {
      new Float32Array(memory.buffer, samplesPtr, samples.length).set(samples);

      const computedFrames = stft_process(
        samplesPtr,
        samples.length,
        windowTypeU32,
        stft.windowSize,
        stft.hopSize,
        stft.fftSize,
        outMagPtr,
        outPowerPtr,
        outDbPtr
      );

      const magnitude = new Float32Array(memory.buffer, outMagPtr, computedFrames * binCount).slice();
      const power = new Float32Array(memory.buffer, outPowerPtr, computedFrames * binCount).slice();
      const db = new Float32Array(memory.buffer, outDbPtr, computedFrames * binCount).slice();

      const matrix = {
        channel,
        timeStart,
        timeEnd: timeStart + samples.length / sampleRate,
        frameStart: Math.round((timeStart * sampleRate) / stft.hopSize),
        frameCount: computedFrames,
        binCount,
        sampleRate,
        times,
        frequencies,
        magnitude,
        power,
        db,
      };

      const computeDuration = performance.now() - start;
      self.postMessage(
        { id: req.id, matrix, computeDuration },
        [times.buffer, frequencies.buffer, magnitude.buffer, power.buffer, db.buffer]
      );
    } finally {
      stft_dealloc(samplesPtr, sampleBytes);
      stft_dealloc(outMagPtr, totalBinBytes);
      stft_dealloc(outPowerPtr, totalBinBytes);
      stft_dealloc(outDbPtr, totalBinBytes);
    }
  } catch (error) {
    self.postMessage({
      id: req.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
`;
}

export function createDefaultWasmWorker(
  workerUrl?: URL | string,
): SpectrogramWorkerLike {
  if (workerUrl) {
    return new Worker(workerUrl, { type: "module" });
  }
  if (
    typeof Blob !== "undefined" &&
    typeof URL?.createObjectURL === "function"
  ) {
    const blob = new Blob([getWasmWorkerScript()], {
      type: "application/javascript",
    });
    const blobUrl = URL.createObjectURL(blob);
    return new Worker(blobUrl);
  }
  throw new Error(
    "Web Workers with Blob URLs are not supported in this environment",
  );
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
