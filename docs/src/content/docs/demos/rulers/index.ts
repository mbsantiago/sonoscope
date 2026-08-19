import { Sonoscope } from "@sonoscope/core";

async function main() {
  const audioUrl =
    "https://upload.wikimedia.org/wikipedia/commons/c/c5/Marico_Sunbird_%28Nectarinia_mariquensis%29_%28W1CDR0000941_BD17%29.ogg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original";

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
