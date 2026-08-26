import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@sonoscope/ascii-spectrogram/auto": resolve(import.meta.dirname, "packages/ascii-spectrogram/src/auto.ts"),
      "@sonoscope/ascii-spectrogram": resolve(import.meta.dirname, "packages/ascii-spectrogram/src/index.ts"),
      "@sonoscope/core": resolve(import.meta.dirname, "packages/core/src/index.ts"),
      "@sonoscope/halftone-spectrogram/auto": resolve(import.meta.dirname, "packages/halftone-spectrogram/src/auto.ts"),
      "@sonoscope/halftone-spectrogram": resolve(import.meta.dirname, "packages/halftone-spectrogram/src/index.ts"),
      "@sonoscope/react": resolve(import.meta.dirname, "packages/react/src/index.ts"),
      "@sonoscope/terrain-spectrogram/auto": resolve(import.meta.dirname, "packages/terrain-spectrogram/src/auto.ts"),
      "@sonoscope/terrain-spectrogram": resolve(import.meta.dirname, "packages/terrain-spectrogram/src/index.ts"),
      "@sonoscope/topographic-spectrogram/auto": resolve(import.meta.dirname, "packages/topographic-spectrogram/src/auto.ts"),
      "@sonoscope/topographic-spectrogram": resolve(import.meta.dirname, "packages/topographic-spectrogram/src/index.ts"),
    },
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
    include: ["packages/**/*.browser.test.ts"],
  },
});
