import type { StftConfig } from "./types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { StreamingWavSource } from "../../sources/streaming-wav-source";
import { decodeWavPcm, parseWavHeader } from "../../sources/wav";
import { MainThreadComputeBackend } from "./backends/backend";
import { computeStftMatrix } from "./backends/stft";
import { WasmComputeBackend } from "./backends/wasm-backend";
import { computeWasmStftMatrix, getWasmStftEngine } from "./backends/wasm-stft";

interface ReferenceRun {
  config: StftConfig;
  frameCount: number;
  binCount: number;
  times: number[];
  frequencies: number[];
  magnitude: number[];
  power: number[];
  db: number[];
}

interface ReferenceFixture {
  signal: string;
  sampleRate: number;
  duration: number;
  sampleCount: number;
  runs: ReferenceRun[];
}

const FIXTURES_ROOT = resolve(
  __dirname,
  "../../../../../tests/fixtures/synthetic",
);

function loadFixture(signalName: string): {
  samples: Float32Array;
  sampleRate: number;
  runs: ReferenceRun[];
  wavBytes: Uint8Array;
} {
  const wavPath = resolve(FIXTURES_ROOT, `${signalName}.wav`);
  const jsonPath = resolve(FIXTURES_ROOT, `${signalName}_reference.json`);

  const wavBuffer = readFileSync(wavPath);
  const wavBytes = new Uint8Array(
    wavBuffer.buffer,
    wavBuffer.byteOffset,
    wavBuffer.byteLength,
  );
  const info = parseWavHeader(wavBytes);
  const decodedChannels = decodeWavPcm(wavBytes, info, 0);
  const samples = decodedChannels[0]!;

  const jsonContent = readFileSync(jsonPath, "utf-8");
  const fixture: ReferenceFixture = JSON.parse(jsonContent);

  return { samples, sampleRate: info.sampleRate, runs: fixture.runs, wavBytes };
}

function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe("SciPy Spectrogram Parity Validation", () => {
  const signals = ["sine", "chirp", "impulse"] as const;

  for (const signal of signals) {
    describe(`Signal: ${signal}`, () => {
      const { samples, sampleRate, runs, wavBytes } = loadFixture(signal);

      for (const run of runs) {
        const {
          config,
          frameCount,
          binCount,
          times,
          frequencies,
          magnitude,
          power,
          db,
        } = run;
        const testCaseName = `${config.window} window (size=${config.windowSize}, hop=${config.hopSize}, fft=${config.fftSize})`;

        it(`JS STFT matches SciPy for ${testCaseName}`, () => {
          const matrix = computeStftMatrix(samples, {
            channel: 0,
            timeStart: 0,
            sampleRate,
            stft: config,
          });

          // Verify grid coordinates
          expect(matrix.frameCount).toBe(frameCount);
          expect(matrix.binCount).toBe(binCount);

          for (let i = 0; i < frameCount; i++) {
            expect(matrix.times[i]).toBeCloseTo(times[i]!, 5);
          }
          for (let i = 0; i < binCount; i++) {
            expect(matrix.frequencies[i]).toBeCloseTo(frequencies[i]!, 4);
          }

          // Verify values
          for (let i = 0; i < matrix.magnitude.length; i++) {
            expect(matrix.magnitude[i]).toBeCloseTo(magnitude[i]!, 4);
            if (matrix.power) {
              expect(matrix.power[i]).toBeCloseTo(power[i]!, 4);
            }
            if (matrix.db && db[i]! > -100) {
              expect(matrix.db[i]).toBeCloseTo(db[i]!, 1);
            }
          }
        });

        it(`WASM STFT matches SciPy for ${testCaseName}`, async () => {
          await getWasmStftEngine();
          const matrix = await computeWasmStftMatrix(samples, {
            channel: 0,
            timeStart: 0,
            sampleRate,
            stft: config,
          });

          expect(matrix.frameCount).toBe(frameCount);
          expect(matrix.binCount).toBe(binCount);

          for (let i = 0; i < frameCount; i++) {
            expect(matrix.times[i]).toBeCloseTo(times[i]!, 5);
          }
          for (let i = 0; i < binCount; i++) {
            expect(matrix.frequencies[i]).toBeCloseTo(frequencies[i]!, 4);
          }

          for (let i = 0; i < matrix.magnitude.length; i++) {
            expect(matrix.magnitude[i]).toBeCloseTo(magnitude[i]!, 4);
            if (matrix.power) {
              expect(matrix.power[i]).toBeCloseTo(power[i]!, 4);
            }
            if (matrix.db && db[i]! > -100) {
              expect(matrix.db[i]).toBeCloseTo(db[i]!, 1);
            }
          }
        });

        it(`MainThreadComputeBackend tile computation matches SciPy for ${testCaseName}`, async () => {
          const wavSource = await StreamingWavSource.fromReader(
            streamFromBytes(wavBytes).getReader(),
          );

          const backend = new MainThreadComputeBackend();
          const matrix = await backend.computeTile({
            source: wavSource,
            channel: 0,
            timeStart: 0,
            timeEnd: wavSource.duration,
            stft: config,
          });

          expect(matrix.frameCount).toBe(frameCount);
          expect(matrix.binCount).toBe(binCount);
          expect(matrix.magnitude.length).toBe(magnitude.length);
          for (let i = 0; i < matrix.magnitude.length; i++) {
            expect(matrix.magnitude[i]).toBeCloseTo(magnitude[i]!, 4);
          }
        });

        it(`WasmComputeBackend tile computation matches SciPy for ${testCaseName}`, async () => {
          const wavSource = await StreamingWavSource.fromReader(
            streamFromBytes(wavBytes).getReader(),
          );

          const backend = new WasmComputeBackend();
          const matrix = await backend.computeTile({
            source: wavSource,
            channel: 0,
            timeStart: 0,
            timeEnd: wavSource.duration,
            stft: config,
          });

          expect(matrix.frameCount).toBe(frameCount);
          expect(matrix.binCount).toBe(binCount);
          expect(matrix.magnitude.length).toBe(magnitude.length);
          for (let i = 0; i < matrix.magnitude.length; i++) {
            expect(matrix.magnitude[i]).toBeCloseTo(magnitude[i]!, 4);
          }
        });
      }
    });
  }
});
