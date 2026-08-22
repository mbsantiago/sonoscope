import "./styles.css";
import { Sonoscope } from "@sonoscope/core";

async function main() {
  const canvas = document.getElementById("spectrogram") as HTMLCanvasElement;
  const audioUrl = "https://xeno-canto.org/1145817/download";

  const scope = await Sonoscope.fromUrl(audioUrl);

  // Initialize the spectrogram viewer
  const viewer = scope.createSpectrogram(canvas, {
    // Frequency scale: "linear", "mel", or "log"
    frequencyScale: "mel",

    // Colormap palette: "viridis", "inferno", "magma", "plasma", "turbo"
    colorMap: "inferno",

    // Decibel dynamic range mapping
    minValue: -80,
    maxValue: 0,

    // STFT resolution parameters
    windowSize: 1024,
    hopSize: 256,
  });

  // Enable 2D panning and zooming across time and frequency
  scope.attachNavigation(canvas);
}

main();

