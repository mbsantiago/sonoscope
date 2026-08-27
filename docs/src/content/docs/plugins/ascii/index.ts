import "./styles.css";
import "@sonoscope/ascii-spectrogram/auto";
import { Sonoscope } from "@sonoscope/core";

async function main() {
  const canvas = document.getElementById("spectrogram") as HTMLCanvasElement;
  const audioUrl = "https://xeno-canto.org/1145817/download";

  const scope = await Sonoscope.fromUrl(audioUrl);

  // Initialize ASCII spectrogram
  scope.createSpectrogram(canvas, {
    renderer: "ascii",
    frequencyScale: "mel",
    minDb: -80,
    maxDb: 0,
    rendererOptions: {
      // Color styling: "green", "amber", "colormap", or "monochrome"
      colorMode: "green",
      fontSize: 10,
      fontFamily: "monospace",
      // charSet: " .:-=+*#%@",
      // invert: false,
    },
  });

  // Enable 2D panning and zooming
  scope.attachNavigation(canvas);
}

main();
