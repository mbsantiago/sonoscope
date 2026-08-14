import type { BackendMode } from "../types";
import type { SpectrogramComputeBackend } from "./backend";
export declare function isSpectrogramComputeBackend(
  value: unknown,
): value is SpectrogramComputeBackend;
export declare function isWasmSupported(): boolean;
export declare function isWorkerSupported(): boolean;
export type BackendFactoryOptions = {
  isWasmSupported?: () => boolean;
  isWorkerSupported?: () => boolean;
};
export declare function createSpectrogramBackend(
  mode?: BackendMode,
  options?: BackendFactoryOptions,
): SpectrogramComputeBackend;
//# sourceMappingURL=backend-factory.d.ts.map
