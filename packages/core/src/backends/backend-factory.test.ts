import { describe, expect, it } from "vitest";
import { Sonoscope } from "../sonoscope";
import type { SpectrogramMatrix } from "../types";
import { SpectrogramViewer } from "../viewer";
import {
  MainThreadComputeBackend,
  type SpectrogramComputeBackend,
} from "./backend";
import {
  createSpectrogramBackend,
  isSpectrogramComputeBackend,
} from "./backend-factory";
import { WasmComputeBackend, WasmWorkerComputeBackend } from "./wasm-backend";
import type { SpectrogramWorkerLike } from "./worker-backend";
import { WorkerComputeBackend } from "./worker-backend";

const fakeWorker = (): SpectrogramWorkerLike => ({
  onmessage: null,
  onerror: null,
  postMessage: () => undefined,
  terminate: () => undefined,
});

type GlobalWithWorker = {
  Worker?: typeof Worker | undefined;
};

describe("backend-factory", () => {
  it("recognizes custom SpectrogramComputeBackend instances", () => {
    const customBackend: SpectrogramComputeBackend = {
      computeTile: async () => ({}) as SpectrogramMatrix,
    };
    expect(isSpectrogramComputeBackend(customBackend)).toBe(true);
    expect(createSpectrogramBackend(customBackend)).toBe(customBackend);
  });

  describe("auto mode", () => {
    it("selects WasmWorkerComputeBackend when WASM and Worker are supported", () => {
      const g = globalThis as GlobalWithWorker;
      const originalWorker = g.Worker;
      g.Worker = class {} as unknown as typeof Worker;
      try {
        const backend = createSpectrogramBackend("auto", {
          isWasmSupported: () => true,
          isWorkerSupported: () => true,
        });
        expect(backend).toBeInstanceOf(WasmWorkerComputeBackend);
      } finally {
        g.Worker = originalWorker;
      }
    });

    it("selects WasmComputeBackend when WASM is supported but Worker is not", () => {
      const backend = createSpectrogramBackend("auto", {
        isWasmSupported: () => true,
        isWorkerSupported: () => false,
      });
      expect(backend).toBeInstanceOf(WasmComputeBackend);
    });

    it("falls back to WorkerComputeBackend when WASM is not supported but Worker is", () => {
      const g = globalThis as GlobalWithWorker;
      const originalWorker = g.Worker;
      g.Worker = class {} as unknown as typeof Worker;
      try {
        const backend = createSpectrogramBackend("auto", {
          isWasmSupported: () => false,
          isWorkerSupported: () => true,
        });
        expect(backend).toBeInstanceOf(WorkerComputeBackend);
      } finally {
        g.Worker = originalWorker;
      }
    });

    it("falls back to MainThreadComputeBackend when neither WASM nor Worker is supported", () => {
      const backend = createSpectrogramBackend("auto", {
        isWasmSupported: () => false,
        isWorkerSupported: () => false,
      });
      expect(backend).toBeInstanceOf(MainThreadComputeBackend);
    });
  });

  describe("wasm mode", () => {
    it("throws if WASM is unavailable", () => {
      expect(() =>
        createSpectrogramBackend("wasm", {
          isWasmSupported: () => false,
        }),
      ).toThrow(/WebAssembly is unavailable/);
    });

    it("creates WasmWorkerComputeBackend by default when workers are available", () => {
      const g = globalThis as GlobalWithWorker;
      const originalWorker = g.Worker;
      g.Worker = class {} as unknown as typeof Worker;
      try {
        const backend = createSpectrogramBackend("wasm", {
          isWasmSupported: () => true,
          isWorkerSupported: () => true,
        });
        expect(backend).toBeInstanceOf(WasmWorkerComputeBackend);
      } finally {
        g.Worker = originalWorker;
      }
    });

    it("creates WasmComputeBackend when worker is disabled via config", () => {
      const backend = createSpectrogramBackend(
        { type: "wasm", worker: false },
        {
          isWasmSupported: () => true,
          isWorkerSupported: () => true,
        },
      );
      expect(backend).toBeInstanceOf(WasmComputeBackend);
    });

    it("creates WasmWorkerComputeBackend with custom options", () => {
      const backend = createSpectrogramBackend(
        { type: "wasm", workerCount: 3, createWorker: fakeWorker },
        {
          isWasmSupported: () => true,
          isWorkerSupported: () => true,
        },
      );
      expect(backend).toBeInstanceOf(WasmWorkerComputeBackend);
    });
  });

  describe("worker mode", () => {
    it("creates WorkerComputeBackend when workers are available", () => {
      const backend = createSpectrogramBackend(
        { type: "worker", createWorker: fakeWorker },
        {
          isWorkerSupported: () => true,
        },
      );
      expect(backend).toBeInstanceOf(WorkerComputeBackend);
    });

    it("throws if worker mode is requested but workers are unavailable", () => {
      expect(() =>
        createSpectrogramBackend("worker", {
          isWorkerSupported: () => false,
        }),
      ).toThrow(/Web Workers are unavailable/);
    });
  });

  describe("main-thread mode", () => {
    it("creates MainThreadComputeBackend", () => {
      const backend = createSpectrogramBackend("main-thread");
      expect(backend).toBeInstanceOf(MainThreadComputeBackend);
    });

    it("creates MainThreadComputeBackend from object config", () => {
      const backend = createSpectrogramBackend({ type: "main-thread" });
      expect(backend).toBeInstanceOf(MainThreadComputeBackend);
    });
  });

  describe("SpectrogramViewer integration", () => {
    function canvas(): HTMLCanvasElement {
      const context = {
        setTransform: () => undefined,
        clearRect: () => undefined,
        fillRect: () => undefined,
        fillText: () => undefined,
        createImageData: (w: number, h: number) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4),
        }),
        putImageData: () => undefined,
        save: () => undefined,
        restore: () => undefined,
        beginPath: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        stroke: () => undefined,
      };
      return {
        width: 100,
        height: 50,
        getBoundingClientRect: () => ({ width: 100, height: 50 }),
        getContext: () => context,
      } as unknown as HTMLCanvasElement;
    }

    it("creates viewer with auto backend by default", async () => {
      const source = {
        id: "test",
        sampleRate: 1000,
        duration: 1,
        channelCount: 1,
        read: () => new Float32Array(1000),
      };
      const scope = Sonoscope.fromSource(source);
      const viewer = new SpectrogramViewer(scope, canvas());
      expect(viewer.getConfig().backend).toBe("auto");
    });

    it("creates viewer with custom backend instance", async () => {
      const source = {
        id: "test",
        sampleRate: 1000,
        duration: 1,
        channelCount: 1,
        read: () => new Float32Array(1000),
      };
      let customComputed = false;
      const customBackend: SpectrogramComputeBackend = {
        computeTile: async (req) => {
          customComputed = true;
          return {
            channel: req.channel,
            timeStart: req.timeStart,
            timeEnd: req.timeEnd,
            frameStart: 0,
            frameCount: 1,
            binCount: 1,
            sampleRate: 1000,
            times: new Float32Array(1),
            frequencies: new Float32Array(1),
            magnitude: new Float32Array(1),
          };
        },
      };

      const scope = Sonoscope.fromSource(source);
      const viewer = new SpectrogramViewer(scope, canvas(), {
        backend: customBackend,
      });

      await viewer.render();
      expect(customComputed).toBe(true);
    });
  });
});
