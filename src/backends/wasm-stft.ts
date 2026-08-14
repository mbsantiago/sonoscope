import type { SpectrogramMatrix, StftConfig, WindowName } from "../types";
import { getWasmStftBinary } from "./wasm-stft-binary";

export interface WasmStftExports {
  memory: WebAssembly.Memory;
  stft_alloc(size: number): number;
  stft_dealloc(ptr: number, size: number): void;
  stft_process(
    samples_ptr: number,
    samples_len: number,
    window_type_u32: number,
    window_size: number,
    hop_size: number,
    fft_size: number,
    out_mag_ptr: number,
    out_power_ptr: number,
    out_db_ptr: number,
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
      return 0;
  }
}

class DefaultWasmStftEngine implements WasmStftEngine {
  constructor(readonly exports: WasmStftExports) {}

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
    const frameCount = Math.max(
      0,
      Math.floor((samples.length - stft.windowSize) / stft.hopSize) + 1,
    );
    const binCount = stft.fftSize / 2;
    const totalBins = frameCount * binCount;

    const times = Float32Array.from(
      { length: frameCount },
      (_, i) => timeStart + (i * stft.hopSize) / sampleRate,
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

    const samplesPtr = stft_alloc(sampleBytes);
    const outMagPtr = stft_alloc(totalBinBytes);
    const outPowerPtr = stft_alloc(totalBinBytes);
    const outDbPtr = stft_alloc(totalBinBytes);

    try {
      new Float32Array(memory.buffer, samplesPtr, samples.length).set(samples);

      const computedFrames = stft_process(
        samplesPtr,
        samples.length,
        windowNameToU32(stft.window),
        stft.windowSize,
        stft.hopSize,
        stft.fftSize,
        outMagPtr,
        outPowerPtr,
        outDbPtr,
      );

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
      stft_dealloc(samplesPtr, sampleBytes);
      stft_dealloc(outMagPtr, totalBinBytes);
      stft_dealloc(outPowerPtr, totalBinBytes);
      stft_dealloc(outDbPtr, totalBinBytes);
    }
  }
}

let cachedEnginePromise: Promise<WasmStftEngine> | null = null;

export async function createWasmStftEngine(
  wasmSource?: BufferSource | Response | PromiseLike<BufferSource | Response>,
): Promise<WasmStftEngine> {
  let wasmBytes: BufferSource;
  if (!wasmSource) {
    wasmBytes = getWasmStftBinary().buffer as ArrayBuffer;
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
