import "./styles.css";
import { Sonoscope, type SpectrogramViewer } from "@sonoscope/core";

const audioUrl = "https://xeno-canto.org/1145817/download";

let currentScope: Sonoscope | null = null;
let currentViewer: SpectrogramViewer | null = null;
let detachNav: (() => void) | null = null;
let detachPlayhead: (() => void) | null = null;

const selectEl = document.getElementById("source-select") as HTMLSelectElement;
const infoEl = document.getElementById("source-info") as HTMLSpanElement;
const canvas = document.getElementById("spectrogram") as HTMLCanvasElement;
const container = document.getElementById("container") as HTMLDivElement;
const audioControls = document.getElementById("audio-controls") as HTMLDivElement;
const audioElement = document.getElementById("audio-player") as HTMLAudioElement;

function cleanup() {
  detachPlayhead?.();
  detachNav?.();
  currentViewer?.destroy();
  currentScope?.destroy();
  currentViewer = null;
  currentScope = null;
  detachPlayhead = null;
  detachNav = null;
}

function generateChirpSignal(sampleRate = 44100, duration = 3.0): Float32Array {
  const length = Math.floor(sampleRate * duration);
  const samples = new Float32Array(length);
  const f0 = 200;
  const f1 = 5000;
  const k = (f1 - f0) / duration;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * (f0 * t + 0.5 * k * t * t);
    samples[i] = 0.6 * Math.sin(phase) + 0.25 * Math.sin(phase * 2);
  }
  return samples;
}

async function loadSource(type: string) {
  cleanup();
  infoEl.textContent = "Loading...";
  audioControls.classList.add("hidden");

  try {
    if (type === "audio") {
      audioControls.classList.remove("hidden");
      audioElement.src = audioUrl;
      currentScope = await Sonoscope.fromAudio(audioElement, {
        followPlayback: "page",
      });
      infoEl.textContent = `fromAudio (${currentScope.getDuration().toFixed(1)}s, ${currentScope.getSampleRate()} Hz)`;
      currentViewer = currentScope.createSpectrogram(canvas, {
        colorMap: "viridis",
        frequencyScale: "mel",
        minValue: -80,
        maxValue: 0,
      });
      detachNav = currentScope.attachNavigation(canvas);
      detachPlayhead = currentScope.attachPlayhead(container);
    } else if (type === "array") {
      const sampleRate = 44100;
      const samples = generateChirpSignal(sampleRate, 3.0);
      currentScope = Sonoscope.fromArray(samples, sampleRate);
      infoEl.textContent = `fromArray (3.0s synthetic chirp @ ${sampleRate} Hz)`;
      currentViewer = currentScope.createSpectrogram(canvas, {
        colorMap: "turbo",
        frequencyScale: "linear",
        minValue: -70,
        maxValue: 0,
      });
      detachNav = currentScope.attachNavigation(canvas);
    } else if (type === "clip") {
      currentScope = await Sonoscope.fromUrl(audioUrl, {
        clipStart: 1.0,
        clipEnd: 3.5,
      });
      infoEl.textContent = `Audio Clip (1.0s - 3.5s of ${audioUrl.split("/").pop()})`;
      currentViewer = currentScope.createSpectrogram(canvas, {
        colorMap: "plasma",
        frequencyScale: "mel",
        minValue: -80,
        maxValue: 0,
      });
      detachNav = currentScope.attachNavigation(canvas);
    } else {
      // "url"
      currentScope = await Sonoscope.fromUrl(audioUrl);
      infoEl.textContent = `fromUrl (${currentScope.getDuration().toFixed(1)}s, ${currentScope.getSampleRate()} Hz)`;
      currentViewer = currentScope.createSpectrogram(canvas, {
        colorMap: "inferno",
        frequencyScale: "mel",
        minValue: -80,
        maxValue: 0,
      });
      detachNav = currentScope.attachNavigation(canvas);
    }
  } catch (err) {
    infoEl.textContent = `Error: ${(err as Error).message}`;
  }
}

selectEl.addEventListener("change", () => {
  loadSource(selectEl.value);
});

loadSource("url");
