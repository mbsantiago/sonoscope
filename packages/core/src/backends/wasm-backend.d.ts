import type { SpectrogramMatrix } from "../types";
import type { ComputeTileRequest, SpectrogramComputeBackend } from "./backend";
import { type WasmStftEngine } from "./wasm-stft";
import {
  type SpectrogramWorkerLike,
  WorkerComputeBackend,
  type WorkerComputeBackendOptions,
} from "./worker-backend";
export declare function createDefaultWasmWorker(
  workerUrl?: URL | string,
): SpectrogramWorkerLike;
export declare class WasmComputeBackend implements SpectrogramComputeBackend {
  private enginePromise;
  constructor(engine?: WasmStftEngine | Promise<WasmStftEngine>);
  computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix>;
}
export declare class WasmWorkerComputeBackend extends WorkerComputeBackend {
  constructor(options?: WorkerComputeBackendOptions);
}
//# sourceMappingURL=wasm-backend.d.ts.map
