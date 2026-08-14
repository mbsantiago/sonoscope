import { describe, expect, it } from "vitest";
import { SpectrogramViewer } from "../viewer";
import { createSpectrogramBackend } from "./backend-factory";

describe("loading demo in browser", () => {
  it("tests default auto backend with worker in browser", async () => {
    const backend = createSpectrogramBackend("auto");
    const samples = new Float32Array(4096).fill(0.3);
    const source = {
      id: "test-source-auto",
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
    backend.destroy?.();
  });

  it("tests loading URL in SpectrogramViewer", async () => {
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
    viewer.destroy();
  });
});
