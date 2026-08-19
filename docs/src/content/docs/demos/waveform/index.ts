import "./styles.css";
import { Sonoscope } from "@sonoscope/core";

async function main() {
  const canvas = document.getElementById("waveform") as HTMLCanvasElement;
  const audioUrl = "https://xeno-canto.org/1145817/download";

  const scope = await Sonoscope.fromUrl(audioUrl);
  const wave = scope.createWaveform(canvas, {
    colorMap: "inferno",
  });

  scope.attachNavigation(canvas, { axis: "time" });
}

main();
