import { bench, describe } from "vitest";
import { MainThreadComputeBackend } from "./backends/backend";
import { computeStftMatrix } from "./backends/stft";
import { WasmComputeBackend } from "./backends/wasm-backend";
import { computeWasmStftMatrix } from "./backends/wasm-stft";
import { CanvasSpectrogramRenderer } from "./renderers/canvas";
import { decodeWavPcm, type WavInfo } from "./sources/wav";
import type { AudioSource, SpectrogramMatrix, StftConfig } from "./types";

const sampleRate = 48_000;
const durationSeconds = 2;

function samples(length: number): Float32Array {
  return Float32Array.from({ length }, (_, index) =>
    Math.sin((2 * Math.PI * 440 * index) / sampleRate),
  );
}

function source(data: Float32Array): AudioSource {
  return {
    id: "synthetic:48000:2",
    sampleRate,
    duration: durationSeconds,
    channelCount: 1,
    read: ({ startTime, endTime }) =>
      data.slice(
        Math.floor(startTime * sampleRate),
        Math.ceil(endTime * sampleRate),
      ),
  };
}

const configs: StftConfig[] = [
  { windowSize: 1024, fftSize: 1024, hopSize: 256, window: "hann" },
  { windowSize: 2048, fftSize: 2048, hopSize: 512, window: "hann" },
];

const data = samples(sampleRate * durationSeconds);
const audioSource = source(data);
const renderMatrix = computeStftMatrix(data, {
  channel: 0,
  timeStart: 0,
  sampleRate,
  stft: { windowSize: 1024, fftSize: 1024, hopSize: 256, window: "hann" },
});

describe("STFT compute", () => {
  for (const stft of configs) {
    bench(
      `JS computeStftMatrix fft=${stft.fftSize} hop=${stft.hopSize}`,
      () => {
        computeStftMatrix(data, { channel: 0, timeStart: 0, sampleRate, stft });
      },
    );
    bench(
      `WASM computeWasmStftMatrix fft=${stft.fftSize} hop=${stft.hopSize}`,
      async () => {
        await computeWasmStftMatrix(data, {
          channel: 0,
          timeStart: 0,
          sampleRate,
          stft,
        });
      },
    );
  }
});

describe("MainThreadComputeBackend vs WasmComputeBackend", () => {
  for (const stft of configs) {
    bench(
      `JS computeTile fft=${stft.fftSize} hop=${stft.hopSize}`,
      async () => {
        await new MainThreadComputeBackend().computeTile({
          source: audioSource,
          channel: 0,
          timeStart: 0,
          timeEnd: durationSeconds,
          stft,
        });
      },
    );
    bench(
      `WASM computeTile fft=${stft.fftSize} hop=${stft.hopSize}`,
      async () => {
        await new WasmComputeBackend().computeTile({
          source: audioSource,
          channel: 0,
          timeStart: 0,
          timeEnd: durationSeconds,
          stft,
        });
      },
    );
  }
});

describe("CanvasSpectrogramRenderer paint", () => {
  bench("paint 400x240 one tile", () => {
    paint(renderMatrix, 400, 240);
  });

  bench("paint 800x480 one tile", () => {
    paint(renderMatrix, 800, 480);
  });
});

describe("WAV PCM decoding (5s stereo 48kHz)", () => {
  const wavFrames = 48_000 * 5;
  const int16Bytes = new Uint8Array(44 + wavFrames * 4);
  const info16: WavInfo = {
    format: 1,
    channelCount: 2,
    sampleRate: 48_000,
    bitsPerSample: 16,
    blockAlign: 4,
    dataOffset: 44,
    dataSize: wavFrames * 4,
    duration: 5,
  };

  const pcm24Bytes = new Uint8Array(44 + wavFrames * 6);
  const info24: WavInfo = {
    format: 1,
    channelCount: 2,
    sampleRate: 48_000,
    bitsPerSample: 24,
    blockAlign: 6,
    dataOffset: 44,
    dataSize: wavFrames * 6,
    duration: 5,
  };

  const float32Bytes = new Uint8Array(44 + wavFrames * 8);
  const infoFloat: WavInfo = {
    format: 3,
    channelCount: 2,
    sampleRate: 48_000,
    bitsPerSample: 32,
    blockAlign: 8,
    dataOffset: 44,
    dataSize: wavFrames * 8,
    duration: 5,
  };

  const preallocatedTarget = [
    new Float32Array(wavFrames),
    new Float32Array(wavFrames),
  ];

  bench("decode 16-bit stereo PCM (new arrays)", () => {
    decodeWavPcm(int16Bytes, info16);
  });

  bench("decode 16-bit stereo PCM (direct pre-allocated target)", () => {
    decodeWavPcm(int16Bytes, info16, 44, preallocatedTarget, 0);
  });

  bench("decode 24-bit stereo PCM (new arrays)", () => {
    decodeWavPcm(pcm24Bytes, info24);
  });

  bench("decode 32-bit float stereo WAV (direct target)", () => {
    decodeWavPcm(float32Bytes, infoFloat, 44, preallocatedTarget, 0);
  });
});

function paint(matrix: SpectrogramMatrix, width: number, height: number): void {
  new CanvasSpectrogramRenderer().render({
    canvas: canvas(width, height),
    viewport: {
      startTime: 0,
      endTime: durationSeconds,
      minFrequency: 0,
      maxFrequency: sampleRate / 2,
      frequencyScale: "linear",
    },
    valueScale: { mode: "db", min: -100, max: 0, gamma: 1, clamp: true },
    colorMap: "viridis",
    tiles: [matrix],
  });
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const context = {
    setTransform: () => undefined,
    clearRect: () => undefined,
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
    width,
    height,
    getBoundingClientRect: () => ({ width, height }),
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
}
