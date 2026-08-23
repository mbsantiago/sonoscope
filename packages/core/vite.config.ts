import { resolve } from "node:path";
import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  build: {
    target: "es2022",
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    sourcemap: true,
    minify: "terser",
    terserOptions: {
      compress: {
        passes: 2,
        drop_console: true,
        pure_getters: true,
      },
      format: {
        comments: false,
      },
      mangle: {
        toplevel: true,
      },
    },
    rollupOptions: {plugins: [visualizer({ 
      filename: "dist/stats.html",
          open: true,
          gzipSize: true,
          brotliSize: true,
          template: "treemap",
      })]}
  },
});
