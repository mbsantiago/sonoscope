import { Sonoscope } from "@sonoscope/core";

async function main() {
  const canvas = document.getElementById("waveform") as HTMLCanvasElement;
  const audioUrl =
    "https://upload.wikimedia.org/wikipedia/commons/c/c5/Marico_Sunbird_%28Nectarinia_mariquensis%29_%28W1CDR0000941_BD17%29.ogg?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original";

  const scope = await Sonoscope.fromUrl(audioUrl);
  const wave = scope.createWaveform(canvas, {
    colorMap: "inferno",
  });

  scope.attachNavigation(canvas, { axis: "time" });
}

main();
