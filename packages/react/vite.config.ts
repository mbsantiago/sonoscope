import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "@sonogram/core"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "@sonogram/core": "SonogramCore",
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
      "@sonogram/core": resolve(import.meta.dirname, "../core/src/index.ts"),
    },
  },
});
