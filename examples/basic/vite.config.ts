import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@sonoscope/core": resolve(
        import.meta.dirname,
        "../../packages/core/src/index.ts",
      ),
      "@sonoscope/react": resolve(
        import.meta.dirname,
        "../../packages/react/src/index.ts",
      ),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        controls: resolve(import.meta.dirname, "controls.html"),
        grid: resolve(import.meta.dirname, "grid.html"),
        loading: resolve(import.meta.dirname, "loading.html"),
        minimap: resolve(import.meta.dirname, "minimap.html"),
        mp3Streaming: resolve(import.meta.dirname, "mp3-streaming.html"),
        performance: resolve(import.meta.dirname, "performance.html"),
        query: resolve(import.meta.dirname, "query.html"),
        react: resolve(import.meta.dirname, "react.html"),
        reactMinimal: resolve(import.meta.dirname, "react-minimal.html"),
        renderers: resolve(import.meta.dirname, "renderers.html"),
        shaders: resolve(import.meta.dirname, "shaders.html"),
        sources: resolve(import.meta.dirname, "sources.html"),
        waveform: resolve(import.meta.dirname, "waveform.html"),
        waveformRenderers: resolve(
          import.meta.dirname,
          "waveform-renderers.html",
        ),
        zoom: resolve(import.meta.dirname, "zoom.html"),
      },
    },
  },
});
