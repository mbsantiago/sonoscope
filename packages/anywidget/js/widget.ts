import type { RenderProps } from "@anywidget/types";
import "./widget.css";
import {
  attachCanvasNavigation,
  attachPlayheadOverlay,
  Sonoscope,
} from "@sonoscope/core";

interface WidgetModel {
  url: string;
  width: number;
  height: number;
  program: "dither" | "normal";
  cmap:
    | "viridis"
    | "plasma"
    | "inferno"
    | "magma"
    | "cividis"
    | "turbo"
    | "jet"
    | "rainbow"
    | "bone"
    | "gray";
  frequency_scale: "mel" | "linear";
  min_db: number;
  max_db: number;
  window_size: number;
  hop_size: number;
}

async function render({
  model,
  el,
  signal,
}: RenderProps<WidgetModel> & { signal: AbortSignal }) {
  const url = model.get("url");

  const width = model.get("width");
  const height = model.get("height");

  const flex = document.createElement("div");
  flex.style.display = "flex";
  flex.style.flexDirection = "column";
  flex.style.height = `${height + 80 + 40}px`;
  flex.style.width = `${width}px`;
  el.appendChild(flex);

  const audio = document.createElement("audio");
  audio.src = url;
  audio.controls = true;
  flex.appendChild(audio);

  const specContainer = document.createElement("div");
  specContainer.style.position = "relative";
  specContainer.style.width = `${width}px`;
  specContainer.style.height = `${height}px`;
  flex.appendChild(specContainer);

  const specCanvas = document.createElement("canvas");
  specCanvas.width = width;
  specCanvas.height = height;
  specCanvas.style.width = "100%";
  specCanvas.style.height = "100%";
  specCanvas.style.display = "block";
  specContainer.appendChild(specCanvas);

  const waveformContainer = document.createElement("div");
  waveformContainer.style.position = "relative";
  waveformContainer.style.width = `${width}px`;
  waveformContainer.style.height = "80px";
  flex.appendChild(waveformContainer);

  const waveformCanvas = document.createElement("canvas");
  waveformCanvas.width = width;
  waveformCanvas.height = 80;
  waveformCanvas.style.width = "100%";
  waveformCanvas.style.height = "100%";
  waveformCanvas.style.display = "block";
  waveformContainer.appendChild(waveformCanvas);

  specCanvas.addEventListener("dblclick", (e) => {
    const rect = specCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { time } = spec.canvasToTimeFrequency(x, y);
    audio.currentTime = time;
  });

  const program = model.get("program");
  const cmap = model.get("cmap");
  const frequencyScale = model.get("frequency_scale");
  const scope = await Sonoscope.fromAudio(audio);
  const spec = scope.createSpectrogram(specCanvas, {
    minValue: model.get("min_db"),
    maxValue: model.get("max_db"),
    windowSize: model.get("window_size"),
    hopSize: model.get("hop_size"),
    frequencyScale: frequencyScale,
    renderer: { type: "webgl", program: program },
    colorMap: cmap,
  });
  const waveform = scope.createWaveform(waveformCanvas);
  attachCanvasNavigation(spec, specCanvas);
  attachCanvasNavigation(waveform, waveformCanvas);
  const specOverlay = attachPlayheadOverlay(specContainer, scope);
  const waveOverlay = attachPlayheadOverlay(waveformContainer, scope);

  signal.addEventListener("abort", () => {
    specOverlay.destroy();
    waveOverlay.destroy();
    spec.destroy();
    waveform.destroy();
    scope.destroy();
  });
}

export default { render };
