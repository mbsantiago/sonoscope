import { Sonoscope } from "@sonoscope/core";

async function main() {
  const canvas = document.getElementById("spectrogram") as HTMLCanvasElement;
  const audioUrl =
    "https://upload.wikimedia.org/wikipedia/commons/c/c5/Marico_Sunbird_%28Nectarinia_mariquensis%29_%28W1CDR0000941_BD17%29.ogg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original";

  const scope = await Sonoscope.fromUrl(audioUrl, {
    frequencyScale: "mel",
  });

  const spec = scope.createSpectrogram(canvas, {
    colorMap: "inferno",
    minValue: -80,
    maxValue: 0,
  });

  scope.attachNavigation(canvas);
}

main();
