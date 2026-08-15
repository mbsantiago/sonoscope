# @sonoscope/core

High-performance WebGL2 and WASM-accelerated audio visualization engine for the web.

## Installation

```bash
npm install @sonoscope/core
```

## Quick Start

### Unified Coordinator Pattern (Recommended)

```typescript
import { Sonoscope } from "@sonoscope/core";

const audio = document.querySelector("audio")!;
const waveCanvas = document.querySelector("#wave-canvas")!;
const specCanvas = document.querySelector("#spec-canvas")!;

// 1. Initialize coordinator
const scope = await Sonoscope.fromUrl("https://example.com/audio.wav", {
  audio,
  followPlayback: "page",
});

// 2. Attach viewers (automatically render on creation)
const waveform = scope.createWaveform(waveCanvas, {
  colorMap: "magma",
  amplitudeScale: 1.0,
});

const spectrogram = scope.createSpectrogram(specCanvas, {
  colorMap: "magma",
  frequencyScale: "mel",
  valueMode: "db",
});
```

### Standalone Single Viewer

```typescript
import { Sonoscope } from "@sonoscope/core";

const scope = await Sonoscope.fromUrl("https://example.com/audio.wav", {
  audio: document.querySelector("audio")!,
});

const viewer = scope.createSpectrogram(document.querySelector("canvas")!, {
  colorMap: "magma",
  frequencyScale: "mel",
  valueMode: "db",
});
```

## Features

- 🎯 **Unified Viewport Coordinator (`Sonoscope`)**: Central coordinator for time bounds, playback clock, follow modes (`page`, `smooth`, `off`), and multi-canvas synchronization.
- ⚡ **WASM STFT Acceleration**: Rust WebAssembly STFT compute backend with multi-worker pool and pure JavaScript FFT fallback.
- 🎨 **WebGL2 Custom Shaders & 35+ Colormaps**: Hardware-accelerated tile rasterization (normal, dither, sobel, 3D terrain) and 35+ Matplotlib colormaps (Viridis, Magma, Inferno, Turbo, Cividis, etc.).
- 📊 **Multi-Scale Waveform Peak Decimation**: Multi-resolution pyramid peak decimation for instant waveform envelope rendering.
- 🌊 **Adaptive Streaming Decoders**: On-demand HTTP range-request WAV decoders and WebCodecs `AudioDecoder` streaming MP3 pipelines.
- 🖱️ **Canvas Navigation**: Built-in wheel zoom (cursor-centered) and pointer drag panning utilities.
