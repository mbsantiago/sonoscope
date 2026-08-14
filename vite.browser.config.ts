import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@sonogram/core": resolve(import.meta.dirname, "packages/core/src/index.ts"),
      "@sonogram/react": resolve(import.meta.dirname, "packages/react/src/index.ts"),
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
