import "./styles.css";
import { Sonoscope } from "@sonoscope/core";

async function main() {
  const audioUrl = "https://xeno-canto.org/1145817/download";

  const scope = await Sonoscope.fromUrl(audioUrl, {
    frequencyScale: "mel",
  });

  const timeCanvas = document.getElementById("time-ruler") as HTMLCanvasElement;
  scope.createTimeRuler(timeCanvas, { tickPosition: "bottom" });

  const freqCanvas = document.getElementById("freq-ruler") as HTMLCanvasElement;
  scope.createFrequencyRuler(freqCanvas, { tickPosition: "right" });

  const specCanvas = document.getElementById("spectrogram") as HTMLCanvasElement;
  scope.createSpectrogram(specCanvas, { colorMap: "viridis" });

  scope.attachNavigation(specCanvas, { axis: "both" });
  scope.attachNavigation(timeCanvas, { axis: "time" });
  scope.attachNavigation(freqCanvas, { axis: "frequency" });
}

main();
