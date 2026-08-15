import type { RenderProps } from "@anywidget/types";
import "./widget.css";
import { attachCanvasNavigation, Sonoscope } from "@sonoscope/core";

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

  const specCanvas = document.createElement("canvas");
  specCanvas.width = width;
  specCanvas.height = height;
  flex.appendChild(specCanvas);

  const waveformCanvas = document.createElement("canvas");
  waveformCanvas.width = width;
  waveformCanvas.height = 80;
  flex.appendChild(waveformCanvas);

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

  signal.addEventListener("abort", () => {
    spec.destroy();
    scope.destroy();
    waveform.destroy();
  });
}

export default { render };
