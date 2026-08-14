import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    sourcemap: true,
  },
  test: {
    environment: "node",
    exclude: ["dist/**", "src/**/*.browser.test.ts"],
  },
});

