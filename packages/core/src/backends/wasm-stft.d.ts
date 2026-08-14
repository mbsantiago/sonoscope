import type { SpectrogramMatrix, StftConfig } from "../types";
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
export declare function createWasmStftEngine(
  wasmSource?: BufferSource | Response | PromiseLike<BufferSource | Response>,
): Promise<WasmStftEngine>;
export declare function getWasmStftEngine(): Promise<WasmStftEngine>;
export declare function computeWasmStftMatrix(
  samples: Float32Array,
  options: {
    channel: number;
    timeStart: number;
    sampleRate: number;
    stft: StftConfig;
  },
  engine?: WasmStftEngine,
): Promise<SpectrogramMatrix>;
//# sourceMappingURL=wasm-stft.d.ts.map
