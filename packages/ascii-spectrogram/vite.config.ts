import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        auto: resolve(import.meta.dirname, "src/auto.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ["@sonoscope/core"],
      output: {
        globals: {
          "@sonoscope/core": "SonoscopeCore",
        },
      },
    },
    sourcemap: true,
    minify: "terser",
    terserOptions: {
      compress: {
        passes: 3,
        drop_console: false,
        pure_getters: true,
      },
      format: {
        comments: false,
      },
    },
  },
  resolve: {
    alias: {
      "@sonoscope/core": resolve(import.meta.dirname, "../core/src/index.ts"),
    },
  },
});
