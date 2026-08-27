import "./styles.css";
import "@sonoscope/topographic-spectrogram/auto";
import { Sonoscope } from "@sonoscope/core";

async function main() {
  const canvas = document.getElementById("spectrogram") as HTMLCanvasElement;
  const audioUrl = "https://xeno-canto.org/1145817/download";

  const scope = await Sonoscope.fromUrl(audioUrl);

  // Initialize topographic elevation contour program
  scope.createSpectrogram(canvas, {
    frequencyScale: "mel",
    colorMap: "viridis",
    minDb: -90,
    maxDb: -10,
    renderer: {
      type: "webgl",
      program: "topographic",
      contourInterval: 0.15,
      contourLineWidth: 1.0,
      contourLineOpacity: 0.9,
      smoothingRadius: 1.0,
      noiseFadeWidth: 0.15,
      lineFeather: 0.75,
      // majorIntervalMultiplier: 5,
      // majorLineWidth: 2.0,
    },
  });

  // Enable 2D panning and zooming
  scope.attachNavigation(canvas);
}

main();
