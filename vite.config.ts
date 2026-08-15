import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@sonoscope/core": resolve(import.meta.dirname, "packages/core/src/index.ts"),
      "@sonoscope/react": resolve(import.meta.dirname, "packages/react/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/dist/**", "**/*.browser.test.ts"],
  },
});
