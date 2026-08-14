import { describe, expect, it } from "vitest";
import { SpectrogramViewer } from "../viewer";
import { MainThreadComputeBackend } from "./backend";
import { createSpectrogramBackend } from "./backend-factory";
import { WasmComputeBackend, WasmWorkerComputeBackend } from "./wasm-backend";
import { WorkerComputeBackend } from "./worker-backend";

describe("loading and profiler backends in browser", () => {
  const backends = [
    { name: "auto", create: () => createSpectrogramBackend("auto") },
    { name: "wasm-worker", create: () => new WasmWorkerComputeBackend() },
    { name: "wasm-main", create: () => new WasmComputeBackend() },
    { name: "js-worker", create: () => new WorkerComputeBackend() },
    { name: "js-main", create: () => new MainThreadComputeBackend() },
  ];

  for (const { name, create } of backends) {
    it(`runs computeTile successfully on ${name} in browser`, async () => {
      const backend = create();
      const samples = new Float32Array(4096).fill(0.3);
      const source = {
        id: `test-source-${name}`,
        sampleRate: 44100,
        duration: 1,
        channelCount: 1,
        read: () => samples,
      };

      const matrix = await backend.computeTile({
        channel: 0,
        timeStart: 0,
        timeEnd: 0.05,
        source,
        stft: {
          windowSize: 1024,
          fftSize: 1024,
          hopSize: 256,
          window: "hann",
        },
      });

      expect(matrix.frameCount).toBeGreaterThan(0);
      expect(matrix.magnitude.length).toBeGreaterThan(0);
      (backend as { destroy?: () => void }).destroy?.();
    });
  }

  it("tests loading URL in SpectrogramViewer and switching all shader programs", async () => {
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    const audio = document.createElement("audio");
    document.body.appendChild(audio);

    const viewer = await SpectrogramViewer.create({
      canvas,
      audio,
      source: {
        id: "test-source",
        sampleRate: 44100,
        duration: 2,
        channelCount: 1,
        read: ({ startTime, endTime }) => {
          const len = Math.round((endTime - startTime) * 44100);
          return new Float32Array(len).fill(0.1);
        },
      },
    });

    await viewer.render();
    expect(viewer.getStatus().state).toBe("ready");

    const programs = [
      "normal",
      "dither",
      "sobel",
      "terrain",
      "normal",
    ] as const;
    for (const program of programs) {
      viewer.updateConfig({ renderer: { type: "webgl", program } });
      await viewer.render();
      expect(viewer.getStatus().state).toBe("ready");
    }

    viewer.destroy();
  });

  it("safely handles rapid destruction during in-flight render without unhandled rejections", async () => {
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);

    for (let i = 0; i < 5; i++) {
      const viewer = await SpectrogramViewer.create({
        canvas,
        source: {
          id: `rapid-source-${i}`,
          sampleRate: 44100,
          duration: 10,
          channelCount: 1,
          read: ({ startTime, endTime }) => {
            const len = Math.round((endTime - startTime) * 44100);
            return new Float32Array(len).fill(0.05);
          },
        },
      });

      void viewer.render();
      viewer.destroy();
    }
  });
});
