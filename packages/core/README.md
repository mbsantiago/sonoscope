# @sonoscope/core

[![npm version](https://img.shields.io/npm/v/@sonoscope/core?logo=npm&color=3aa99f)](https://www.npmjs.com/package/@sonoscope/core)
[![CI](https://github.com/mbsantiago/sonoscope/actions/workflows/ci.yml/badge.svg)](https://github.com/mbsantiago/sonoscope/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

WebGL2 and WebAssembly audio visualization engine for the web.

## Installation

```bash
npm install @sonoscope/core
```

## Quick start

### Unified coordinator pattern

```typescript
import { Sonoscope } from "@sonoscope/core";

const audio = document.querySelector("audio")!;
const waveCanvas = document.querySelector<HTMLCanvasElement>("#wave-canvas")!;
const specCanvas = document.querySelector<HTMLCanvasElement>("#spec-canvas")!;

// 1. Initialize coordinator from audio element
const scope = await Sonoscope.fromAudio(audio, {
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

### Standalone visualizer (from URL)

```typescript
import { Sonoscope } from "@sonoscope/core";

// Initialize purely from URL without an <audio> element
const scope = await Sonoscope.fromUrl("https://example.com/audio.wav");

const viewer = scope.createSpectrogram(document.querySelector<HTMLCanvasElement>("canvas")!, {
  colorMap: "magma",
  frequencyScale: "mel",
  valueMode: "db",
});
```

## Features

- **Unified viewport coordinator (`Sonoscope`).** Single source of truth for time bounds, playback position, follow modes (`page`, `smooth`, `off`), and multi-canvas synchronization.
- **WASM STFT acceleration.** Rust WebAssembly STFT compute backend with multi-worker pool and pure TypeScript fallback.
- **WebGL2 shaders and 35+ colormaps.** Hardware-accelerated tile rasterization (normal, dither/halftone, 3D terrain) and 35+ Matplotlib colormaps (Viridis, Magma, Inferno, Turbo, Cividis, and more).
- **Multi-scale waveform peak decimation.** Multi-resolution pyramid peak decimation for instant waveform envelope rendering.
- **Adaptive streaming decoders.** On-demand HTTP range-request WAV decoders and WebCodecs streaming MP3 pipelines.
- **Canvas navigation.** Built-in cursor-centered wheel zoom and drag panning utilities.
