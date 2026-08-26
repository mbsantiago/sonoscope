import type { SpectrogramMatrix } from "../types";
import { page } from "@vitest/browser/context";
import { expect, it } from "vitest";
import { WebGL2SpectrogramRenderer } from "./webgl2";
import { createSpectrogramProgram } from "./webgl2-program-factory";

function syntheticTile(): SpectrogramMatrix {
  const frameCount = 96;
  const binCount = 48;
  const magnitude = new Float32Array(frameCount * binCount);
  for (let f = 0; f < frameCount; f++) {
    for (let b = 0; b < binCount; b++) {
      const t = f / frameCount;
      const freq = b / binCount;
      const harmonic = Math.exp(
        -(((freq - 0.12 - 0.1 * Math.sin(t * 6.0)) / 0.05) ** 2),
      );
      const harmonic2 =
        0.8 * Math.exp(-(((freq - 0.35 + 0.15 * t) / 0.03) ** 2));
      const harmonic3 =
        0.6 * Math.exp(-(((freq - 0.7 - 0.1 * Math.cos(t * 4.0)) / 0.02) ** 2));
      const noise = 0.08 * Math.abs(Math.sin(f * 12.9898 + b * 78.233));
      magnitude[f * binCount + b] = Math.min(
        1,
        harmonic + harmonic2 + harmonic3 + noise,
      );
    }
  }
  const times = new Float32Array(frameCount);
  const frequencies = new Float32Array(binCount);
  for (let f = 0; f < frameCount; f++) times[f] = (f / frameCount) * 2;
  for (let b = 0; b < binCount; b++) frequencies[b] = (b / binCount) * 8000;
  return {
    channel: 0,
    timeStart: 0,
    timeEnd: 2,
    frameStart: 0,
    frameCount,
    binCount,
    sampleRate: 16000,
    times,
    frequencies,
    magnitude,
  };
}

it("debug: terrain camera snapshot", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () => ({ width: 640, height: 360 }),
  });
  document.body.appendChild(canvas);
  const gl = canvas.getContext("webgl2");
  if (!gl) return;
  const renderer = new WebGL2SpectrogramRenderer(
    gl,
    createSpectrogramProgram(gl, "terrain"),
  );

  renderer.render({
    canvas,
    viewport: {
      startTime: 0,
      endTime: 2,
      minFrequency: 0,
      maxFrequency: 8000,
    },
    frequencyScale: "linear",
    valueScale: { mode: "magnitude", min: 0, max: 1, gamma: 1, clamp: true },
    colorMap: "viridis",
    tiles: [syntheticTile()],
  });

  expect(gl.getError()).toBe(gl.NO_ERROR);
  await page.screenshot({ path: ".vitest-attachments/terrain-debug.png" });
  renderer.destroy();
  canvas.remove();
});
