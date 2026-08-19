import "./styles.css";
import { Sonoscope } from "@sonoscope/core";

async function main() {
  const canvas = document.getElementById("spectrogram") as HTMLCanvasElement;
  const audioUrl = "https://xeno-canto.org/1145817/download";

  const scope = await Sonoscope.fromUrl(audioUrl, {
    frequencyScale: "mel",
  });

  scope.createSpectrogram(canvas, {
    colorMap: "inferno",
    minValue: -80,
    maxValue: 0,
  });

  scope.attachNavigation(canvas);
}

main();
