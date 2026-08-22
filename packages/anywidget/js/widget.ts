import type { RenderProps } from "@anywidget/types";
import "./widget.css";
import {
  attachPlayheadOverlay,
  type FollowPlaybackMode,
  type FrequencyRulerProgramName,
  type FrequencyScale,
  Sonoscope,
  type TimeRulerProgramName,
} from "@sonoscope/core";

interface WidgetModel {
  url: string;
  audio_bytes?: unknown;
  mime_type?: string;
  width: number;
  height: number;
  program: "halftone" | "normal" | "sobel" | "terrain";
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
    | "gray"
    | "gray_r";
  frequency_scale: FrequencyScale;
  min_db: number;
  max_db: number;
  window_size: number;
  hop_size: number;
  show_frequency_ruler: boolean;
  freq_ruler_program: FrequencyRulerProgramName;
  freq_ruler_width: number;
  show_time_ruler: boolean;
  time_ruler_program: TimeRulerProgramName;
  time_ruler_height: number;
  show_waveform: boolean;
  waveform_height: number;
  follow_playback: FollowPlaybackMode;
}

function toUint8Array(input: unknown): Uint8Array | null {
  if (!input) return null;
  if (input instanceof Uint8Array) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (input instanceof DataView) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (Array.isArray(input)) {
    return new Uint8Array(input);
  }
  if (typeof input === "string") {
    const raw = input.includes(",") ? input.split(",")[1] || "" : input;
    try {
      const binaryString = atob(raw);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    } catch {
      const bytes = new Uint8Array(input.length);
      for (let i = 0; i < input.length; i++) {
        bytes[i] = input.charCodeAt(i) & 0xff;
      }
      return bytes;
    }
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "buffer" in input &&
    (input as { buffer: unknown }).buffer instanceof ArrayBuffer
  ) {
    const obj = input as {
      buffer: ArrayBuffer;
      byteOffset?: number;
      byteLength?: number;
    };
    return new Uint8Array(
      obj.buffer,
      obj.byteOffset || 0,
      obj.byteLength || obj.buffer.byteLength,
    );
  }
  return null;
}

async function render({
  model,
  el,
  signal,
}: RenderProps<WidgetModel> & { signal: AbortSignal }) {
  const url = model.get("url");
  const width = model.get("width") || 800;
  const height = model.get("height") || 400;
  const showFreqRuler = model.get("show_frequency_ruler") ?? true;
  const freqRulerWidth = showFreqRuler
    ? model.get("freq_ruler_width") || 56
    : 0;
  const showTimeRuler = model.get("show_time_ruler") ?? true;
  const timeRulerHeight = showTimeRuler
    ? model.get("time_ruler_height") || 24
    : 0;
  const showWaveform = model.get("show_waveform") ?? true;
  const waveformHeight = showWaveform ? model.get("waveform_height") || 80 : 0;
  const frequencyScale: FrequencyScale = model.get("frequency_scale") || "mel";
  const program = model.get("program") || "normal";
  const cmap = model.get("cmap") || "viridis";
  const minDb = model.get("min_db") ?? -80;
  const maxDb = model.get("max_db") ?? 0;
  const windowSize = model.get("window_size") || 512;
  const hopSize = model.get("hop_size") || 128;
  const timeRulerProg: TimeRulerProgramName =
    model.get("time_ruler_program") || "ticks";
  const freqRulerProg: FrequencyRulerProgramName =
    model.get("freq_ruler_program") || "ticks";
  const followPlayback: FollowPlaybackMode =
    model.get("follow_playback") || "page";

  const root = document.createElement("div");
  root.className = "sonoscope-widget";
  root.style.width = `${width + freqRulerWidth + 2}px`;
  root.style.maxWidth = "100%";
  el.appendChild(root);

  const grid = document.createElement("div");
  grid.className = "sonoscope-grid";
  if (showFreqRuler) {
    grid.style.gridTemplateColumns = `${freqRulerWidth}px 1fr`;
  } else {
    grid.style.gridTemplateColumns = "1fr";
  }
  root.appendChild(grid);

  let timeRulerCanvas: HTMLCanvasElement | null = null;
  let timeRulerContainer: HTMLDivElement | null = null;

  if (showTimeRuler) {
    if (showFreqRuler) {
      const cornerTop = document.createElement("div");
      cornerTop.className = "sonoscope-corner sonoscope-corner-top";
      cornerTop.style.height = `${timeRulerHeight}px`;
      cornerTop.textContent = "Hz \\ s";
      grid.appendChild(cornerTop);
    }

    timeRulerContainer = document.createElement("div");
    timeRulerContainer.className = "sonoscope-time-ruler-container";
    timeRulerContainer.style.height = `${timeRulerHeight}px`;
    timeRulerCanvas = document.createElement("canvas");
    timeRulerCanvas.className = "sonoscope-canvas";
    timeRulerContainer.appendChild(timeRulerCanvas);
    grid.appendChild(timeRulerContainer);
  }

  let freqRulerCanvas: HTMLCanvasElement | null = null;
  let freqRulerContainer: HTMLDivElement | null = null;

  if (showFreqRuler) {
    freqRulerContainer = document.createElement("div");
    freqRulerContainer.className = "sonoscope-freq-ruler-container";
    freqRulerContainer.style.width = `${freqRulerWidth}px`;
    freqRulerContainer.style.height = `${height}px`;
    freqRulerCanvas = document.createElement("canvas");
    freqRulerCanvas.className = "sonoscope-canvas";
    freqRulerContainer.appendChild(freqRulerCanvas);
    grid.appendChild(freqRulerContainer);
  }

  const specContainer = document.createElement("div");
  specContainer.className = "sonoscope-spec-container";
  specContainer.style.height = `${height}px`;
  const specCanvas = document.createElement("canvas");
  specCanvas.className = "sonoscope-canvas";
  specContainer.appendChild(specCanvas);
  grid.appendChild(specContainer);

  let waveformCanvas: HTMLCanvasElement | null = null;
  let waveformContainer: HTMLDivElement | null = null;

  if (showWaveform) {
    if (showFreqRuler) {
      const cornerWave = document.createElement("div");
      cornerWave.className = "sonoscope-corner sonoscope-corner-wave";
      cornerWave.style.height = `${waveformHeight}px`;
      cornerWave.textContent = "WAV";
      grid.appendChild(cornerWave);
    }

    waveformContainer = document.createElement("div");
    waveformContainer.className = "sonoscope-waveform-container";
    waveformContainer.style.height = `${waveformHeight}px`;
    waveformCanvas = document.createElement("canvas");
    waveformCanvas.className = "sonoscope-canvas";
    waveformContainer.appendChild(waveformCanvas);
    grid.appendChild(waveformContainer);
  }

  const audio = document.createElement("audio");
  audio.className = "sonoscope-audio";
  audio.controls = true;
  audio.crossOrigin = "anonymous";
  root.appendChild(audio);

  const rawAudioBytes = model.get("audio_bytes");
  const mimeType = model.get("mime_type") || "audio/wav";
  const uint8 = toUint8Array(rawAudioBytes);

  let scope: Sonoscope;
  if (uint8 && uint8.length > 0) {
    const blob = new Blob([uint8 as unknown as BlobPart], { type: mimeType });
    scope = await Sonoscope.fromBlob(blob, {
      followPlayback,
      audio,
    });
  } else if (url) {
    audio.src = url;
    scope = await Sonoscope.fromAudio(audio, {
      followPlayback,
    });
  } else {
    // Empty initial placeholder or error
    scope = new Sonoscope({
      source: {
        id: "empty",
        duration: 0.1,
        sampleRate: 44100,
        channelCount: 1,
        read: () => new Float32Array(0),
      },
      followPlayback,
      audio,
    });
  }

  const minFreq = frequencyScale === "log" ? 20 : 0;
  const maxFreq = Math.floor(scope.getSampleRate() / 2);
  scope.setViewport({ minFrequency: minFreq, maxFrequency: maxFreq });

  const navCleanups: Array<() => void> = [];
  const playheadOverlays: Array<{ destroy: () => void }> = [];

  let timeRuler: ReturnType<typeof scope.createTimeRuler> | null = null;
  if (timeRulerCanvas && timeRulerContainer) {
    timeRuler = scope.createTimeRuler(timeRulerCanvas, {
      program: timeRulerProg,
      tickPosition: "top",
      color: "rgba(128, 128, 128, 0.75)",
      tickColor: "rgba(128, 128, 128, 0.35)",
    });
    navCleanups.push(scope.attachNavigation(timeRulerCanvas, { axis: "time" }));
    playheadOverlays.push(attachPlayheadOverlay(timeRulerContainer, scope));

    const onTimeRulerClick = (e: MouseEvent) => {
      if (!timeRulerCanvas || !timeRuler) return;
      const rect = timeRulerCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = timeRuler.canvasToTime(x);
      scope.seek(time);
    };
    timeRulerCanvas.addEventListener("dblclick", onTimeRulerClick);
    timeRulerCanvas.addEventListener("click", onTimeRulerClick);
  }

  let freqRuler: ReturnType<typeof scope.createFrequencyRuler> | null = null;
  if (freqRulerCanvas) {
    freqRuler = scope.createFrequencyRuler(freqRulerCanvas, {
      program: freqRulerProg,
      frequencyScale,
      color: "rgba(128, 128, 128, 0.75)",
      tickColor: "rgba(128, 128, 128, 0.35)",
      tickPosition: "right",
    });
    navCleanups.push(
      scope.attachNavigation(freqRulerCanvas, { axis: "frequency" }),
    );
  }

  const spec = scope.createSpectrogram(specCanvas, {
    minDb,
    maxDb,
    windowSize,
    hopSize,
    frequencyScale,
    renderer: { type: "webgl", program },
    colorMap: cmap,
  });
  navCleanups.push(scope.attachNavigation(specCanvas));
  playheadOverlays.push(attachPlayheadOverlay(specContainer, scope));

  specCanvas.addEventListener("dblclick", (e) => {
    const rect = specCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { time } = spec.canvasToTimeFrequency(x, y);
    scope.seek(time);
  });

  let waveform: ReturnType<typeof scope.createWaveform> | null = null;
  if (waveformCanvas && waveformContainer) {
    waveform = scope.createWaveform(waveformCanvas, {
      colorMap: cmap,
    });
    navCleanups.push(scope.attachNavigation(waveformCanvas, { axis: "time" }));
    playheadOverlays.push(attachPlayheadOverlay(waveformContainer, scope));

    waveformCanvas.addEventListener("dblclick", (e) => {
      if (!waveformCanvas || !waveform) return;
      const rect = waveformCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = waveform.canvasToTime(x);
      scope.seek(time);
    });
  }

  const modelUnsubs: Array<() => void> = [];

  const onCmapChange = () => {
    const nextCmap = model.get("cmap");
    spec.updateConfig({ colorMap: nextCmap });
    waveform?.updateConfig({ colorMap: nextCmap });
  };
  model.on("change:cmap", onCmapChange);
  modelUnsubs.push(() => model.off("change:cmap", onCmapChange));

  const onMinDbChange = () => {
    spec.updateConfig({ minDb: model.get("min_db") });
  };
  model.on("change:min_db", onMinDbChange);
  modelUnsubs.push(() => model.off("change:min_db", onMinDbChange));

  const onMaxDbChange = () => {
    spec.updateConfig({ maxDb: model.get("max_db") });
  };
  model.on("change:max_db", onMaxDbChange);
  modelUnsubs.push(() => model.off("change:max_db", onMaxDbChange));

  const onScaleChange = () => {
    const nextScale = model.get("frequency_scale");
    const nextMinFreq = nextScale === "log" ? 20 : 0;
    scope.setViewport({ minFrequency: nextMinFreq });
    spec.updateConfig({ frequencyScale: nextScale });
    freqRuler?.updateConfig({
      frequencyScale: nextScale,
    });
  };
  model.on("change:frequency_scale", onScaleChange);
  modelUnsubs.push(() => model.off("change:frequency_scale", onScaleChange));

  const onProgramChange = () => {
    spec.updateConfig({
      renderer: { type: "webgl", program: model.get("program") },
    });
  };
  model.on("change:program", onProgramChange);
  modelUnsubs.push(() => model.off("change:program", onProgramChange));

  const onTimeProgChange = () => {
    timeRuler?.updateConfig({ program: model.get("time_ruler_program") });
  };
  model.on("change:time_ruler_program", onTimeProgChange);
  modelUnsubs.push(() =>
    model.off("change:time_ruler_program", onTimeProgChange),
  );

  const onFreqProgChange = () => {
    freqRuler?.updateConfig({ program: model.get("freq_ruler_program") });
  };
  model.on("change:freq_ruler_program", onFreqProgChange);
  modelUnsubs.push(() =>
    model.off("change:freq_ruler_program", onFreqProgChange),
  );

  const onFollowChange = () => {
    scope.setFollowPlayback(model.get("follow_playback"));
  };
  model.on("change:follow_playback", onFollowChange);
  modelUnsubs.push(() => model.off("change:follow_playback", onFollowChange));

  signal.addEventListener("abort", () => {
    for (const unsub of modelUnsubs) unsub();
    for (const cleanup of navCleanups) cleanup();
    for (const overlay of playheadOverlays) overlay.destroy();
    timeRuler?.destroy();
    freqRuler?.destroy();
    spec.destroy();
    waveform?.destroy();
    scope.destroy();
  });
}

export default { render };
