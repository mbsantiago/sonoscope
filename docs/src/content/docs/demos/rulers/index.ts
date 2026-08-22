import "./styles.css";
import { Sonoscope } from "@sonoscope/core";

async function main() {
  const audioUrl = "https://xeno-canto.org/1145817/download";

  const scope = await Sonoscope.fromUrl(audioUrl);

  // 1. Horizontal Time Ruler (top)
  const timeCanvas = document.getElementById("time-ruler") as HTMLCanvasElement;
  scope.createTimeRuler(timeCanvas, {
    program: "ticks", // Try: 'ticks' or 'boxes'
    tickPosition: "bottom", // 'top' | 'bottom' | 'both' | 'inside'
    timeFormat: "auto", // 'auto' | 'seconds' | 'timecode' | 'hhmmss'
    color: "#a0a0a0",
  });

  // 2. Vertical Frequency Ruler (left)
  const freqCanvas = document.getElementById("freq-ruler") as HTMLCanvasElement;
  scope.createFrequencyRuler(freqCanvas, {
    program: "ticks", // Try: 'ticks' or 'boxes'
    frequencyScale: "mel",
    tickPosition: "right", // 'left' | 'right' | 'both' | 'inside'
    frequencyFormat: "auto", // 'auto' | 'hz' | 'khz'
    color: "#a0a0a0",
  });

  // 3. Central Spectrogram
  const specCanvas = document.getElementById("spectrogram") as HTMLCanvasElement;
  scope.createSpectrogram(specCanvas, {
    colorMap: "viridis",
    frequencyScale: "mel",
    minDb: -80,
    maxDb: 0,
  });

  // 4. Attach drag/zoom navigation to sync all views
  scope.attachNavigation(specCanvas, { axis: "both" });
  scope.attachNavigation(timeCanvas, { axis: "time" });
  scope.attachNavigation(freqCanvas, { axis: "frequency" });
}

main();
