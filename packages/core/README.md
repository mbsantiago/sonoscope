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

### Interactive source replacement

Create a scope without a source when the UI needs to be ready before an audio
load finishes. Viewers can be attached immediately, and every `set*` source
method updates the same scope. A later request supersedes and aborts the
previous one; only the latest request can become current.

```typescript
import { Sonoscope } from "@sonoscope/core";

const audio = document.querySelector("audio")!;
const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
const status = document.querySelector<HTMLElement>("[data-status]")!;
const scope = new Sonoscope({ audio });
scope.createSpectrogram(canvas);

scope.on("statechange", ({ state }) => {
  if (state.status === "loading") status.textContent = "Loading audio…";
  if (state.status === "ready") status.textContent = "Audio ready";
  if (state.status === "error") status.textContent = state.error.message;
});

// Use setUrl for the initial request and later user selections alike.
void scope.setUrl("https://example.com/audio.wav").catch(() => {
  // The error state is reported through statechange.
});
```

`scope.state` is a source-agnostic snapshot with `empty`, `loading`, `ready`,
and `error` states. The `ready` state carries the common `AudioSource`; source
input details such as URL or Blob remain the caller's concern. The state is
updated before `statechange` listeners run. A current failure clears the
previous source and leaves the scope available for retry. Superseded loads
resolve without installing a source or publishing an error for the newer
request. Fetches and queued viewer work are cancelled where possible; work
that cannot be interrupted is prevented from publishing stale results.

`scope.source`, `getDuration()`, `getSampleRate()`, and `getNyquist()` are
`undefined` until a source is ready. Source-dependent operations such as
`seek()` and `setClipBounds()` throw `No audio source is ready`. Existing
`Sonoscope.fromUrl()`, `fromAudio()`, and in-memory factories remain available
when code wants to await a ready scope before continuing.

`ready` means the source metadata is available; it does not mean a progressive
source has downloaded or decoded the entire file. Progressive sources report
decoded intervals through `AudioSource.onRangeAvailable()`. Their duration may
be provisional and grow as frames arrive; the scope expands its available time
bounds as that happens, and viewers render the visible interval as soon as its
samples can be read.

## Features

- **Unified viewport coordinator (`Sonoscope`).** Single source of truth for time bounds, playback position, follow modes (`page`, `smooth`, `off`), and multi-canvas synchronization.
- **WASM STFT acceleration.** Rust WebAssembly STFT compute backend with multi-worker pool and pure TypeScript fallback.
- **WebGL2 shaders, plugins, and 35+ colormaps.** Lean, hardware-accelerated tile rasterization, extensible shader plugin architecture (with `@sonoscope/halftone-spectrogram`, `@sonoscope/terrain-spectrogram`, `@sonoscope/topographic-spectrogram`), and 35+ Matplotlib colormaps (Viridis, Magma, Inferno, Turbo, Cividis, and more).
- **Multi-scale waveform peak decimation.** Multi-resolution pyramid peak decimation for instant waveform envelope rendering.
- **Adaptive streaming decoders.** On-demand HTTP range-request WAV decoders and WebCodecs streaming MP3 pipelines.
- **Canvas navigation.** Built-in cursor-centered wheel zoom and drag panning utilities.
