import type { BackendMode } from "../types";
import type { SpectrogramComputeBackend } from "./backend";
import { MainThreadComputeBackend } from "./backend";
import { WasmComputeBackend, WasmWorkerComputeBackend } from "./wasm-backend";
import { createWasmStftEngine } from "./wasm-stft";
import { WorkerComputeBackend } from "./worker-backend";

export function isSpectrogramComputeBackend(
  value: unknown,
): value is SpectrogramComputeBackend {
  return (
    typeof value === "object" &&
    value !== null &&
    "computeTile" in value &&
    typeof (value as SpectrogramComputeBackend).computeTile === "function"
  );
}

export function isWasmSupported(): boolean {
  try {
    return (
      typeof WebAssembly !== "undefined" &&
      typeof WebAssembly.instantiate === "function" &&
      typeof WebAssembly.Memory === "function"
    );
  } catch {
    return false;
  }
}

export function isWorkerSupported(): boolean {
  try {
    return typeof Worker !== "undefined";
  } catch {
    return false;
  }
}

export type BackendFactoryOptions = {
  isWasmSupported?: () => boolean;
  isWorkerSupported?: () => boolean;
};

export function createSpectrogramBackend(
  mode?: BackendMode,
  options?: BackendFactoryOptions,
): SpectrogramComputeBackend {
  if (isSpectrogramComputeBackend(mode)) {
    return mode;
  }

  const checkWasm = options?.isWasmSupported ?? isWasmSupported;
  const checkWorker = options?.isWorkerSupported ?? isWorkerSupported;
  const targetMode = mode ?? "auto";

  if (targetMode === "auto") {
    if (checkWasm()) {
      if (checkWorker()) {
        try {
          return new WasmWorkerComputeBackend();
        } catch {
          return new WasmComputeBackend();
        }
      }
      return new WasmComputeBackend();
    }
    if (checkWorker()) {
      try {
        return new WorkerComputeBackend();
      } catch {
        return new MainThreadComputeBackend();
      }
    }
    return new MainThreadComputeBackend();
  }

  const isWasmObj =
    typeof targetMode === "object" && targetMode.type === "wasm";
  if (targetMode === "wasm" || isWasmObj) {
    if (!checkWasm()) {
      throw new Error(
        "WASM backend requested but WebAssembly is unavailable in this environment",
      );
    }
    const wasmConfig = isWasmObj ? targetMode : undefined;
    const workerOpt = wasmConfig?.worker;
    const useWorker = workerOpt !== undefined ? workerOpt : checkWorker();
    if (useWorker) {
      if (!checkWorker() && !wasmConfig?.createWorker) {
        throw new Error(
          "WASM worker backend requested but Web Workers are unavailable in this environment",
        );
      }
      return new WasmWorkerComputeBackend({
        ...(wasmConfig?.workerCount !== undefined
          ? { workerCount: wasmConfig.workerCount }
          : {}),
        ...(wasmConfig?.workerUrl !== undefined
          ? { workerUrl: wasmConfig.workerUrl }
          : {}),
        ...(wasmConfig?.createWorker !== undefined
          ? { createWorker: wasmConfig.createWorker }
          : {}),
      });
    }
    return new WasmComputeBackend(
      wasmConfig?.wasmSource
        ? createWasmStftEngine(wasmConfig.wasmSource)
        : undefined,
    );
  }

  const isWorkerObj =
    typeof targetMode === "object" && targetMode.type === "worker";
  if (targetMode === "worker" || isWorkerObj) {
    const workerConfig = isWorkerObj ? targetMode : undefined;
    if (!checkWorker() && !workerConfig?.createWorker) {
      throw new Error(
        "Worker backend requested but Web Workers are unavailable in this environment",
      );
    }
    return new WorkerComputeBackend({
      ...(workerConfig?.workerCount !== undefined
        ? { workerCount: workerConfig.workerCount }
        : {}),
      ...(workerConfig?.workerUrl !== undefined
        ? { workerUrl: workerConfig.workerUrl }
        : {}),
      ...(workerConfig?.createWorker !== undefined
        ? { createWorker: workerConfig.createWorker }
        : {}),
    });
  }

  if (
    targetMode === "main-thread" ||
    (typeof targetMode === "object" && targetMode.type === "main-thread")
  ) {
    return new MainThreadComputeBackend();
  }

  throw new Error(`Unsupported backend mode: ${JSON.stringify(targetMode)}`);
}
