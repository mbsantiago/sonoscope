import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vite";

export default defineConfig({
	test: {
		browser: {
			enabled: true,
			provider: playwright(),
			headless: true,
			instances: [{ browser: "chromium" }],
		},
		include: ["src/**/*.browser.test.ts"],
	},
});
