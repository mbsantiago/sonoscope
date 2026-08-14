import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@sonogram/core": resolve(import.meta.dirname, "packages/core/src/index.ts"),
      "@sonogram/react": resolve(import.meta.dirname, "packages/react/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/dist/**", "**/*.browser.test.ts"],
  },
});
