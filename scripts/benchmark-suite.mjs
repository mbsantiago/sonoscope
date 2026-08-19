import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({
  root: new URL("../", import.meta.url).pathname,
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});

try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string")
    throw new Error("Unable to get server address");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });

    await page.goto(`${baseUrl}/examples/basic/index.html`, {
      waitUntil: "networkidle",
    });

    const benchmarkResults = await page.evaluate(async () => {
      const { computeStftMatrix } = await import(
        "/packages/core/src/viewers/spectrogram/backends/stft.ts"
      );
      const { computeWasmStftMatrix } = await import(
        "/packages/core/src/viewers/spectrogram/backends/wasm-stft.ts"
      );
      const { CanvasSpectrogramRenderer } = await import(
        "/packages/core/src/viewers/spectrogram/renderers/canvas.ts"
      );
      const { WebGL2SpectrogramRenderer } = await import(
        "/packages/core/src/viewers/spectrogram/renderers/webgl2.ts"
      );

      function stats(arr) {
        const sorted = [...arr].sort((a, b) => a - b);
        const count = sorted.length;
        const sum = sorted.reduce((a, b) => a + b, 0);
        const mean = sum / count;
        const median =
          count % 2 === 0
            ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
            : sorted[Math.floor(count / 2)];
        const variance =
          sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count;
        const std = Math.sqrt(variance);
        const min = sorted[0];
        const max = sorted[count - 1];
        const p95 = sorted[Math.floor(count * 0.95)];
        return { count, mean, median, std, min, max, p95 };
      }

      // ==========================================
      // 1. STFT COMPUTE BENCHMARK (WASM vs JS)
      // ==========================================
      const sampleRate = 48_000;
      const durations = [2.0, 10.0];
      const fftConfigs = [
        { windowSize: 512, fftSize: 512, hopSize: 128 },
        { windowSize: 1024, fftSize: 1024, hopSize: 256 },
        { windowSize: 2048, fftSize: 2048, hopSize: 512 },
        { windowSize: 4096, fftSize: 4096, hopSize: 1024 },
      ];

      const stftResults = [];

      for (const dur of durations) {
        const samples = Float32Array.from(
          { length: Math.round(sampleRate * dur) },
          (_, i) => {
            const t = i / sampleRate;
            return (
              Math.sin(2 * Math.PI * 440 * t) +
              0.5 * Math.sin(2 * Math.PI * 2200 * t)
            );
          },
        );

        for (const cfg of fftConfigs) {
          const stft = { ...cfg, window: "hann" };
          const iterations = dur === 2.0 ? 30 : 15;

          // Warmup
          computeStftMatrix(samples, {
            channel: 0,
            timeStart: 0,
            sampleRate,
            stft,
          });
          await computeWasmStftMatrix(samples, {
            channel: 0,
            timeStart: 0,
            sampleRate,
            stft,
          });

          // JS
          const jsTimes = [];
          for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            computeStftMatrix(samples, {
              channel: 0,
              timeStart: 0,
              sampleRate,
              stft,
            });
            jsTimes.push(performance.now() - t0);
          }

          // WASM SIMD
          const wasmTimes = [];
          for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            await computeWasmStftMatrix(samples, {
              channel: 0,
              timeStart: 0,
              sampleRate,
              stft,
            });
            wasmTimes.push(performance.now() - t0);
          }

          const jsStat = stats(jsTimes);
          const wasmStat = stats(wasmTimes);
          stftResults.push({
            duration: dur,
            fftSize: cfg.fftSize,
            hopSize: cfg.hopSize,
            iterations,
            js: jsStat,
            wasm: wasmStat,
            speedup: jsStat.mean / wasmStat.mean,
          });
        }
      }

      // ==========================================
      // 2. RENDERER BENCHMARK (WebGL2 vs Canvas2D)
      // ==========================================
      const renderSamples = Float32Array.from(
        { length: sampleRate * 2.0 },
        (_, i) => {
          const t = i / sampleRate;
          return (
            Math.sin(2 * Math.PI * 440 * t) +
            0.5 * Math.sin(2 * Math.PI * 2200 * t)
          );
        },
      );

      const matrix = await computeWasmStftMatrix(renderSamples, {
        channel: 0,
        timeStart: 0,
        sampleRate,
        stft: { windowSize: 2048, fftSize: 2048, hopSize: 512, window: "hann" },
      });

      const resolutions = [
        { width: 400, height: 240, label: "400x240 (Compact)" },
        { width: 800, height: 480, label: "800x480 (Standard)" },
        { width: 1920, height: 1080, label: "1920x1080 (Full HD)" },
      ];

      const renderResults = [];
      const renderIterations = 50;

      for (const res of resolutions) {
        // Canvas 2D
        const c2d = document.createElement("canvas");
        c2d.width = res.width;
        c2d.height = res.height;
        Object.defineProperty(c2d, "getBoundingClientRect", {
          value: () => ({ width: res.width, height: res.height }),
        });
        const canvasRenderer = new CanvasSpectrogramRenderer();

        // WebGL2
        const cGl = document.createElement("canvas");
        cGl.width = res.width;
        cGl.height = res.height;
        Object.defineProperty(cGl, "getBoundingClientRect", {
          value: () => ({ width: res.width, height: res.height }),
        });
        const gl = cGl.getContext("webgl2");
        const webglRenderer = new WebGL2SpectrogramRenderer(gl);

        const renderInput = {
          viewport: {
            startTime: 0,
            endTime: 2.0,
            minFrequency: 0,
            maxFrequency: sampleRate / 2,
            frequencyScale: "linear",
          },
          valueScale: { mode: "db", min: -100, max: 0, gamma: 1, clamp: true },
          colorMap: "magma",
          tiles: [matrix],
        };

        // Warmup
        canvasRenderer.render({ ...renderInput, canvas: c2d });
        webglRenderer.render({ ...renderInput, canvas: cGl });
        gl.finish();

        // Canvas 2D timing
        const c2dTimes = [];
        for (let i = 0; i < renderIterations; i++) {
          const t0 = performance.now();
          canvasRenderer.render({ ...renderInput, canvas: c2d });
          c2dTimes.push(performance.now() - t0);
        }

        // WebGL2 timing (with gl.finish)
        const glTimes = [];
        for (let i = 0; i < renderIterations; i++) {
          const t0 = performance.now();
          webglRenderer.render({ ...renderInput, canvas: cGl });
          gl.finish();
          glTimes.push(performance.now() - t0);
        }

        const c2dStat = stats(c2dTimes);
        const glStat = stats(glTimes);
        renderResults.push({
          resolution: res.label,
          width: res.width,
          height: res.height,
          iterations: renderIterations,
          c2d: c2dStat,
          gl: glStat,
          speedup: c2dStat.mean / glStat.mean,
        });

        webglRenderer.destroy();
      }

      return { stftResults, renderResults };
    });

    console.log(JSON.stringify(benchmarkResults, null, 2));
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
