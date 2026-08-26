import type { SpectrogramMatrix } from "../types";
import type { ComputeTileRequest, SpectrogramComputeBackend } from "./backend";
import { getWasmStftEngine, type WasmStftEngine } from "./wasm-stft";
import { WASM_STFT_BASE64 } from "./wasm-stft-binary";
import {
  createBlobWorker,
  type SpectrogramWorkerLike,
  WorkerComputeBackend,
  type WorkerComputeBackendOptions,
} from "./worker-backend";

function getWasmWorkerScript(): string {
  return `
const WASM_BASE64 = "${WASM_STFT_BASE64}";
let wasmEnginePromise = null;
let stftContext = null;
let stftContextKey = null;

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

function validateStft(stft) {
  if (!Number.isSafeInteger(stft.windowSize) || stft.windowSize <= 0) throw new Error("windowSize must be a positive safe integer");
  if (!Number.isSafeInteger(stft.fftSize) || stft.fftSize <= 0 || 2 ** Math.round(Math.log2(stft.fftSize)) !== stft.fftSize) throw new Error("fftSize must be a power of two");
  if (!Number.isSafeInteger(stft.hopSize) || stft.hopSize <= 0) throw new Error("hopSize must be a positive safe integer");
  if (stft.windowSize > stft.fftSize) throw new Error("fftSize must be greater than or equal to windowSize");
  if (windowMap[stft.window] === undefined) throw new Error("Unsupported STFT window: " + stft.window);
}

function getStftContext(exports, stft) {
  const windowType = windowMap[stft.window];
  if (windowType === undefined) throw new Error("Unsupported STFT window: " + stft.window);
  const key = stft.window + ":" + stft.windowSize + ":" + stft.fftSize;
  if (stftContextKey === key) return stftContext;
  if (stftContext) exports.stft_context_destroy(stftContext);
  stftContext = exports.stft_context_create(windowType, stft.windowSize, stft.fftSize);
  if (!stftContext) throw new Error("Failed to create WASM STFT context");
  stftContextKey = key;
  return stftContext;
}

function processErrorMessage(code) {
  const errors = {
    "-1": "STFT received a null required pointer",
    "-2": "STFT received an invalid argument",
    "-3": "STFT output buffer is too small",
    "-4": "STFT output size overflowed",
    "-5": "STFT frame count exceeds the supported range",
  };
  return errors[code] || "STFT processing failed with status " + code;
}

self.onmessage = async (event) => {
  const start = performance.now();
  const req = event.data;
  try {
    const exports = await getWasmEngine();
    const { stft_alloc, stft_dealloc, stft_process, memory } = exports;
    const { channel, timeStart, sampleRate, stft, samples } = req;
    validateStft(stft);

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

    const sampleBytes = samples.length * 4;
    const totalBinBytes = totalBins * 4;
    if (!Number.isSafeInteger(sampleBytes) || !Number.isSafeInteger(totalBinBytes)) {
      throw new Error("STFT buffer size exceeds JavaScript's safe integer range");
    }

    const context = getStftContext(exports, stft);
    const samplesPtr = stft_alloc(sampleBytes);
    const outMagPtr = stft_alloc(totalBinBytes);
    const outPowerPtr = stft_alloc(totalBinBytes);
    const outDbPtr = stft_alloc(totalBinBytes);

    try {
      if (!samplesPtr || !outMagPtr || !outPowerPtr || !outDbPtr) throw new Error("Failed to allocate WASM STFT buffers");
      new Float32Array(memory.buffer, samplesPtr, samples.length).set(samples);

      const computedFrames = stft_process(
        context,
        samplesPtr,
        samples.length,
        stft.hopSize,
        outMagPtr,
        totalBins,
        outPowerPtr,
        totalBins,
        outDbPtr,
        totalBins
      );
      if (computedFrames < 0) throw new Error(processErrorMessage(computedFrames));

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
      stft_dealloc(samplesPtr);
      stft_dealloc(outMagPtr);
      stft_dealloc(outPowerPtr);
      stft_dealloc(outDbPtr);
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
  return createBlobWorker(getWasmWorkerScript());
}

export class WasmComputeBackend implements SpectrogramComputeBackend {
  private enginePromise: Promise<WasmStftEngine>;

  constructor(engine?: WasmStftEngine | Promise<WasmStftEngine>) {
    this.enginePromise = engine ? Promise.resolve(engine) : getWasmStftEngine();
  }

  async computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix> {
    const samples = await request.source.read({
      channel: request.channel,
      startTime: request.timeStart,
      endTime: request.timeEnd,
    });

    const engine = await this.enginePromise;

    return engine.computeMatrix(samples, {
      channel: request.channel,
      timeStart: request.timeStart,
      sampleRate: request.source.sampleRate,
      stft: request.stft,
    });
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
