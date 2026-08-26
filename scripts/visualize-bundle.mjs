import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { visualizer } from "rollup-plugin-visualizer";
import { build } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");
const coreDir = resolve(rootDir, "packages/core");
const outputFile = resolve(rootDir, "core-bundle-stats.html");

const shouldOpen = process.argv.includes("--open");

console.log("Analyzing @sonoscope/core bundle size...");

await build({
  root: coreDir,
  configFile: resolve(coreDir, "vite.config.ts"),
  plugins: [
    visualizer({
      filename: outputFile,
      title: "@sonoscope/core Bundle Analysis",
      open: shouldOpen,
      gzipSize: true,
      brotliSize: true,
      template: "treemap",
    }),
  ],
});

console.log(`\nBundle analysis saved to: ${outputFile}`);
if (!shouldOpen) {
  console.log(
    "Tip: Open the file in your browser, or run with --open to open automatically.",
  );
}
