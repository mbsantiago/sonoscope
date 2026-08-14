import type { SpectrogramMatrix } from "../types";
import type { ComputeTileRequest, SpectrogramComputeBackend } from "./backend";
export type SpectrogramWorkerLike = {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
};
export type WorkerComputeBackendOptions = {
  workerCount?: number;
  workerUrl?: URL | string;
  createWorker?: () => SpectrogramWorkerLike;
};
export declare function createDefaultWorker(
  workerUrl?: URL | string,
): SpectrogramWorkerLike;
export declare class WorkerComputeBackend implements SpectrogramComputeBackend {
  private nextId;
  private destroyed;
  private readonly queue;
  private readonly slots;
  constructor(options?: WorkerComputeBackendOptions);
  computeTile(request: ComputeTileRequest): Promise<SpectrogramMatrix>;
  destroy(): void;
  private pump;
  private startJob;
  private handleMessage;
  private handleWorkerError;
}
//# sourceMappingURL=worker-backend.d.ts.map
