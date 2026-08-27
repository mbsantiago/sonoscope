import "./styles.css";
import "@sonoscope/halftone-spectrogram/auto";
import { Sonoscope } from "@sonoscope/core";

async function main() {
  const canvas = document.getElementById("spectrogram") as HTMLCanvasElement;
  const audioUrl = "https://xeno-canto.org/1145817/download";

  const scope = await Sonoscope.fromUrl(audioUrl);

  // Initialize halftone shader program
  scope.createSpectrogram(canvas, {
    colorMap: "plasma",
    frequencyScale: "mel",
    minDb: -90,
    maxDb: -20,
    renderer: {
      type: "webgl",
      program: "halftone",
      dotFrequency: 0.24,
      dotAngle: 45,
      energyGamma: 1.4,
      dotSoftness: 0.75,
      // maxDotRadius: 0.7071,
      // minEnergyThreshold: 0.0,
      // backgroundOpacity: 1.0,
    },
  });

  // Enable 2D panning and zooming
  scope.attachNavigation(canvas);
}

main();
