import type { SpectrogramMatrix, StftConfig, WindowName } from "../types";
import { getWasmStftBinary } from "./wasm-stft-binary";

export interface WasmStftExports {
  memory: WebAssembly.Memory;
  stft_alloc(size: number): number;
  stft_dealloc(ptr: number): void;
  stft_context_create(
    window_type_u32: number,
    window_size: number,
    fft_size: number,
  ): number;
  stft_context_destroy(context: number): void;
  stft_process(
    context: number,
    samples_ptr: number,
    samples_len: number,
    hop_size: number,
    out_mag_ptr: number,
    out_mag_len: number,
    out_power_ptr: number,
    out_power_len: number,
    out_db_ptr: number,
    out_db_len: number,
  ): number;
}

export interface WasmStftEngine {
  readonly exports: WasmStftExports;
  computeMatrix(
    samples: Float32Array,
    options: {
      channel: number;
      timeStart: number;
      sampleRate: number;
      stft: StftConfig;
    },
  ): SpectrogramMatrix;
}

function windowNameToU32(window: WindowName): number {
  switch (window) {
    case "hann":
      return 0;
    case "hamming":
      return 1;
    case "blackman":
      return 2;
    case "rectangular":
      return 3;
    default:
      throw new Error(`Unsupported STFT window: ${String(window)}`);
  }
}

function validateStftConfig(stft: StftConfig): void {
  if (!Number.isSafeInteger(stft.windowSize) || stft.windowSize <= 0)
    throw new Error("windowSize must be a positive safe integer");
  if (
    !Number.isSafeInteger(stft.fftSize) ||
    stft.fftSize <= 0 ||
    2 ** Math.round(Math.log2(stft.fftSize)) !== stft.fftSize
  )
    throw new Error("fftSize must be a power of two");
  if (!Number.isSafeInteger(stft.hopSize) || stft.hopSize <= 0)
    throw new Error("hopSize must be a positive safe integer");
  if (stft.windowSize > stft.fftSize)
    throw new Error("fftSize must be greater than or equal to windowSize");
}

function processErrorMessage(code: number): string {
  switch (code) {
    case -1:
      return "STFT received a null required pointer";
    case -2:
      return "STFT received an invalid argument";
    case -3:
      return "STFT output buffer is too small";
    case -4:
      return "STFT output size overflowed";
    case -5:
      return "STFT frame count exceeds the supported range";
    default:
      return `STFT processing failed with status ${code}`;
  }
}

class DefaultWasmStftEngine implements WasmStftEngine {
  private context: { key: string; pointer: number } | undefined;

  constructor(readonly exports: WasmStftExports) {}

  private getContext(stft: StftConfig): number {
    const key = `${stft.window}:${stft.windowSize}:${stft.fftSize}`;
    if (this.context?.key === key) return this.context.pointer;

    if (this.context) this.exports.stft_context_destroy(this.context.pointer);
    const pointer = this.exports.stft_context_create(
      windowNameToU32(stft.window),
      stft.windowSize,
      stft.fftSize,
    );
    if (!pointer) throw new Error("Failed to create WASM STFT context");
    this.context = { key, pointer };
    return pointer;
  }

  computeMatrix(
    samples: Float32Array,
    options: {
      channel: number;
      timeStart: number;
      sampleRate: number;
      stft: StftConfig;
    },
  ): SpectrogramMatrix {
    const { stft, sampleRate, channel, timeStart } = options;
    validateStftConfig(stft);
    windowNameToU32(stft.window);
    const frameCount = Math.max(
      0,
      Math.floor((samples.length - stft.windowSize) / stft.hopSize) + 1,
    );
    const binCount = stft.fftSize / 2;
    const totalBins = frameCount * binCount;

    const times = Float32Array.from(
      { length: frameCount },
      (_, i) =>
        timeStart + (i * stft.hopSize + stft.windowSize / 2) / sampleRate,
    );
    const frequencies = Float32Array.from(
      { length: binCount },
      (_, i) => (i * sampleRate) / stft.fftSize,
    );

    if (frameCount === 0 || samples.length === 0) {
      return {
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
      };
    }

    const { stft_alloc, stft_dealloc, stft_process, memory } = this.exports;

    const sampleBytes = samples.length * 4;
    const totalBinBytes = totalBins * 4;

    if (
      !Number.isSafeInteger(sampleBytes) ||
      !Number.isSafeInteger(totalBinBytes)
    )
      throw new Error(
        "STFT buffer size exceeds JavaScript's safe integer range",
      );

    const context = this.getContext(stft);
    const samplesPtr = stft_alloc(sampleBytes);
    const outMagPtr = stft_alloc(totalBinBytes);
    const outPowerPtr = stft_alloc(totalBinBytes);
    const outDbPtr = stft_alloc(totalBinBytes);

    try {
      if (!samplesPtr || !outMagPtr || !outPowerPtr || !outDbPtr)
        throw new Error("Failed to allocate WASM STFT buffers");
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
        totalBins,
      );
      if (computedFrames < 0)
        throw new Error(processErrorMessage(computedFrames));

      const magnitude = new Float32Array(
        memory.buffer,
        outMagPtr,
        computedFrames * binCount,
      ).slice();
      const power = new Float32Array(
        memory.buffer,
        outPowerPtr,
        computedFrames * binCount,
      ).slice();
      const db = new Float32Array(
        memory.buffer,
        outDbPtr,
        computedFrames * binCount,
      ).slice();

      return {
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
    } finally {
      stft_dealloc(samplesPtr);
      stft_dealloc(outMagPtr);
      stft_dealloc(outPowerPtr);
      stft_dealloc(outDbPtr);
    }
  }
}

let cachedEnginePromise: Promise<WasmStftEngine> | null = null;

export async function createWasmStftEngine(
  wasmSource?: BufferSource | Response | PromiseLike<BufferSource | Response>,
): Promise<WasmStftEngine> {
  let wasmBytes: BufferSource;
  if (!wasmSource) {
    wasmBytes = getWasmStftBinary() as unknown as BufferSource;
  } else if (wasmSource instanceof Response) {
    wasmBytes = await wasmSource.arrayBuffer();
  } else if (
    typeof Promise !== "undefined" &&
    typeof (wasmSource as Promise<unknown>).then === "function"
  ) {
    const resolved = await wasmSource;
    wasmBytes =
      resolved instanceof Response
        ? await resolved.arrayBuffer()
        : (resolved as BufferSource);
  } else {
    wasmBytes = wasmSource as BufferSource;
  }

  const { instance } = await WebAssembly.instantiate(wasmBytes, {});
  return new DefaultWasmStftEngine(
    instance.exports as unknown as WasmStftExports,
  );
}

export function getWasmStftEngine(): Promise<WasmStftEngine> {
  if (!cachedEnginePromise) {
    cachedEnginePromise = createWasmStftEngine();
  }
  return cachedEnginePromise;
}

export async function computeWasmStftMatrix(
  samples: Float32Array,
  options: {
    channel: number;
    timeStart: number;
    sampleRate: number;
    stft: StftConfig;
  },
  engine?: WasmStftEngine,
): Promise<SpectrogramMatrix> {
  const activeEngine = engine ?? (await getWasmStftEngine());
  return activeEngine.computeMatrix(samples, options);
}
