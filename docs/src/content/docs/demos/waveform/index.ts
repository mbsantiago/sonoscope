import "./styles.css";
import { Sonoscope } from "@sonoscope/core";

async function main() {
  const canvas = document.getElementById("waveform") as HTMLCanvasElement;
  const audioUrl = "https://xeno-canto.org/1145817/download";

  const scope = await Sonoscope.fromUrl(audioUrl);

  // Initialize the waveform viewer
  const wave = scope.createWaveform(canvas, {
    // Try different renderers: "canvas2d", "webgl2", or "bars"
    renderer: "bars",

    // Color options: solid color or named colormap
    color: "#38bdf8",
    // colorMap: "magma",

    // Amplitude scale (gain multiplier)
    amplitudeScale: 1.0,
  });

  // Enable click-and-drag panning and pinch-to-zoom
  scope.attachNavigation(canvas, { axis: "time" });
}

main();

