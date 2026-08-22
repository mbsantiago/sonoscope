import type { StftConfig } from "./viewers/spectrogram/types";
import { bench, describe } from "vitest";
import { createWasmStftEngine } from "./viewers/spectrogram/backends/wasm-stft";

const sampleRate = 48_000;
const stft: StftConfig = {
  windowSize: 1024,
  fftSize: 1024,
  hopSize: 256,
  window: "hann",
};

function createSamples(length: number): Float32Array {
  return Float32Array.from({ length }, (_, index) =>
    Math.sin((2 * Math.PI * 440 * index) / sampleRate),
  );
}

const cases = [
  ["one frame", createSamples(stft.windowSize)],
  ["four frames", createSamples(stft.windowSize + 3 * stft.hopSize)],
  ["two seconds", createSamples(sampleRate * 2)],
] as const;

const engine = await createWasmStftEngine();
engine.computeMatrix(cases[0][1], {
  channel: 0,
  timeStart: 0,
  sampleRate,
  stft,
});

describe("WASM STFT context reuse", () => {
  for (const [name, samples] of cases) {
    bench(name, () => {
      engine.computeMatrix(samples, {
        channel: 0,
        timeStart: 0,
        sampleRate,
        stft,
      });
    });
  }
});
