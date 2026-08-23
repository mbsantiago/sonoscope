import type { SpectrogramMatrix } from "../types";
import { describe, it } from "vitest";
import { computeStftMatrix } from "../backends/stft";
import { computeWasmStftMatrix } from "../backends/wasm-stft";
import { CanvasSpectrogramRenderer } from "./canvas";
import { WebGL2SpectrogramRenderer } from "./webgl2";
import { createSpectrogramProgram } from "./webgl2-program-factory";

interface BenchmarkStats {
  name: string;
  count: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  p95: number;
}

function formatStats(name: string, durations: number[]): BenchmarkStats {
  const sorted = [...durations].sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) {
    return {
      name,
      count: 0,
      mean: 0,
      median: 0,
      std: 0,
      min: 0,
      max: 0,
      p95: 0,
    };
  }
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  const median =
    count % 2 === 0
      ? ((sorted[count / 2 - 1] ?? 0) + (sorted[count / 2] ?? 0)) / 2
      : (sorted[Math.floor(count / 2)] ?? 0);
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
  const std = Math.sqrt(variance);
  const p95 = sorted[Math.floor(count * 0.95)] ?? 0;
  return {
    name,
    count,
    mean,
    median,
    std,
    min: sorted[0] ?? 0,
    max: sorted[count - 1] ?? 0,
    p95,
  };
}

describe("Comprehensive Performance Benchmark (Browser / Chromium)", () => {
  it("benchmarks WASM SIMD STFT vs Pure JS STFT across FFT sizes", async () => {
    const sampleRate = 48_000;
    const duration = 2.0;
    const samples = Float32Array.from(
      { length: sampleRate * duration },
      (_, index) => {
        const t = index / sampleRate;
        return (
          Math.sin(2 * Math.PI * 440 * t) +
          0.5 * Math.sin(2 * Math.PI * 2200 * t)
        );
      },
    );

    const configs = [
      { windowSize: 512, fftSize: 512, hopSize: 128 },
      { windowSize: 1024, fftSize: 1024, hopSize: 256 },
      { windowSize: 2048, fftSize: 2048, hopSize: 512 },
      { windowSize: 4096, fftSize: 4096, hopSize: 1024 },
    ];

    const iterations = 30;
    const results: Array<{
      config: (typeof configs)[number];
      js: BenchmarkStats;
      wasm: BenchmarkStats;
      speedup: number;
    }> = [];

    for (const config of configs) {
      const stftConfig = { ...config, window: "hann" as const };

      // Warmup
      computeStftMatrix(samples, {
        channel: 0,
        timeStart: 0,
        sampleRate,
        stft: stftConfig,
      });
      await computeWasmStftMatrix(samples, {
        channel: 0,
        timeStart: 0,
        sampleRate,
        stft: stftConfig,
      });

      // JS Benchmark
      const jsDurations: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        computeStftMatrix(samples, {
          channel: 0,
          timeStart: 0,
          sampleRate,
          stft: stftConfig,
        });
        jsDurations.push(performance.now() - start);
      }

      // WASM Benchmark
      const wasmDurations: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await computeWasmStftMatrix(samples, {
          channel: 0,
          timeStart: 0,
          sampleRate,
          stft: stftConfig,
        });
        wasmDurations.push(performance.now() - start);
      }

      const jsStats = formatStats(
        `JS STFT (fft=${config.fftSize}, hop=${config.hopSize})`,
        jsDurations,
      );
      const wasmStats = formatStats(
        `WASM STFT (fft=${config.fftSize}, hop=${config.hopSize})`,
        wasmDurations,
      );
      results.push({
        config,
        js: jsStats,
        wasm: wasmStats,
        speedup: jsStats.mean / wasmStats.mean,
      });
    }

    console.log(
      "\n=== STFT COMPUTE BENCHMARK: WASM SIMD vs PURE JS (2s Audio @ 48kHz, N=30) ===",
    );
    console.table(
      results.map((r) => ({
        "FFT Size": r.config.fftSize,
        "Hop Size": r.config.hopSize,
        "JS Mean (ms)": r.js.mean.toFixed(2),
        "JS Med (ms)": r.js.median.toFixed(2),
        "JS Std (ms)": r.js.std.toFixed(2),
        "WASM Mean (ms)": r.wasm.mean.toFixed(2),
        "WASM Med (ms)": r.wasm.median.toFixed(2),
        "WASM Std (ms)": r.wasm.std.toFixed(2),
        "WASM Speedup": `${r.speedup.toFixed(2)}x`,
      })),
    );
  });

  it("benchmarks WebGL2 vs Canvas2D Rendering across Canvas resolutions", async () => {
    const sampleRate = 48_000;
    const duration = 2.0;
    const samples = Float32Array.from(
      { length: sampleRate * duration },
      (_, index) => {
        const t = index / sampleRate;
        return (
          Math.sin(2 * Math.PI * 440 * t) +
          0.5 * Math.sin(2 * Math.PI * 2200 * t)
        );
      },
    );

    const matrix: SpectrogramMatrix = await computeWasmStftMatrix(samples, {
      channel: 0,
      timeStart: 0,
      sampleRate,
      stft: { windowSize: 2048, fftSize: 2048, hopSize: 512, window: "hann" },
    });

    const resolutions = [
      { width: 400, height: 240, label: "400x240 (Compact / Card)" },
      { width: 800, height: 480, label: "800x480 (Standard Viewport)" },
      { width: 1920, height: 1080, label: "1920x1080 (Full HD Display)" },
    ];

    const iterations = 50;
    const renderResults: Array<{
      res: string;
      c2d: BenchmarkStats;
      gl: BenchmarkStats;
      speedup: number;
    }> = [];

    for (const res of resolutions) {
      // Setup Canvas 2D
      const c2d = document.createElement("canvas");
      c2d.width = res.width;
      c2d.height = res.height;
      Object.defineProperty(c2d, "getBoundingClientRect", {
        value: () => ({ width: res.width, height: res.height }),
      });
      const canvasRenderer = new CanvasSpectrogramRenderer();

      // Setup WebGL2
      const cGl = document.createElement("canvas");
      cGl.width = res.width;
      cGl.height = res.height;
      Object.defineProperty(cGl, "getBoundingClientRect", {
        value: () => ({ width: res.width, height: res.height }),
      });
      const gl = cGl.getContext("webgl2")!;
      const webglRenderer = new WebGL2SpectrogramRenderer(
        gl,
        createSpectrogramProgram(gl, "normal"),
      );

      const renderInput = {
        viewport: {
          startTime: 0,
          endTime: duration,
          minFrequency: 0,
          maxFrequency: sampleRate / 2,
          frequencyScale: "linear" as const,
        },
        valueScale: {
          mode: "db" as const,
          min: -100,
          max: 0,
          gamma: 1,
          clamp: true,
        },
        colorMap: "magma" as const,
        tiles: [matrix],
      };

      // Warmup
      canvasRenderer.render({ ...renderInput, canvas: c2d });
      webglRenderer.render({ ...renderInput, canvas: cGl });
      gl.finish();

      // Benchmark Canvas 2D
      const c2dDurations: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        canvasRenderer.render({ ...renderInput, canvas: c2d });
        c2dDurations.push(performance.now() - start);
      }

      // Benchmark WebGL2 (with gl.finish to measure GPU execution time)
      const glDurations: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        webglRenderer.render({ ...renderInput, canvas: cGl });
        gl.finish();
        glDurations.push(performance.now() - start);
      }

      const c2dStats = formatStats(`Canvas 2D ${res.label}`, c2dDurations);
      const glStats = formatStats(`WebGL2 ${res.label}`, glDurations);
      renderResults.push({
        res: res.label,
        c2d: c2dStats,
        gl: glStats,
        speedup: c2dStats.mean / glStats.mean,
      });

      webglRenderer.destroy();
    }

    console.log(
      "\n=== SPECTROGRAM RENDERER BENCHMARK: WebGL2 vs Canvas 2D (Single Tile, N=50) ===",
    );
    console.table(
      renderResults.map((r) => ({
        Resolution: r.res,
        "Canvas2D Mean (ms)": r.c2d.mean.toFixed(2),
        "Canvas2D Med (ms)": r.c2d.median.toFixed(2),
        "Canvas2D Std (ms)": r.c2d.std.toFixed(2),
        "WebGL2 Mean (ms)": r.gl.mean.toFixed(3),
        "WebGL2 Med (ms)": r.gl.median.toFixed(3),
        "WebGL2 Std (ms)": r.gl.std.toFixed(3),
        "WebGL2 Speedup": `${r.speedup.toFixed(1)}x`,
      })),
    );
  });
});
