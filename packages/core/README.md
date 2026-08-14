# @sonogram/core

High-performance WebGL2 and WASM-accelerated audio spectrogram engine for the web.

## Installation

```bash
npm install @sonogram/core
```

## Quick Start

```typescript
import { SpectrogramViewer } from "@sonogram/core";

const canvas = document.querySelector("canvas")!;
const audio = document.querySelector("audio")!;

const viewer = await SpectrogramViewer.fromUrl({
  canvas,
  audio,
  url: "https://example.com/audio.wav",
  colorMap: "magma",
  frequencyScale: "mel",
  valueMode: "db",
});
```

## Features

- ⚡ **WASM FFT Acceleration**: Inlined Rust WASM STFT engine with fallback to pure JavaScript FFT.
- 🎨 **WebGL2 Custom Shaders & 35+ Colormaps**: Hardware-accelerated tile rasterization (normal, dither, sobel, 3D terrain) + Matplotlib colormaps (Viridis, Magma, Cividis, Turbo, Tab20, etc.).
- 🌊 **Adaptive Streaming Decoders**: On-demand range requests for WAV and WebCodecs-based streaming MP3 decoding with backpressure.
- 🖱️ **Canvas Navigation**: Built-in wheel zoom and click-and-drag viewport panning utilities.
