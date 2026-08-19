# Sonoscope 🎵

[![CI](https://github.com/mbsantiago/sonoscope/actions/workflows/ci.yml/badge.svg)](https://github.com/mbsantiago/sonoscope/actions/workflows/ci.yml)
[![Documentation](https://github.com/mbsantiago/sonoscope/actions/workflows/deploy-pages.yml/badge.svg)](https://mbsantiago.github.io/sonoscope/)
[![Release & Publish](https://github.com/mbsantiago/sonoscope/actions/workflows/release.yml/badge.svg)](https://github.com/mbsantiago/sonoscope/actions/workflows/release.yml)
[![npm @sonoscope/core](https://img.shields.io/npm/v/@sonoscope/core?label=@sonoscope/core&logo=npm&color=3aa99f)](https://www.npmjs.com/package/@sonoscope/core)
[![npm @sonoscope/react](https://img.shields.io/npm/v/@sonoscope/react?label=@sonoscope/react&logo=npm&color=3aa99f)](https://www.npmjs.com/package/@sonoscope/react)
[![PyPI - sonoscope](https://img.shields.io/pypi/v/sonoscope?label=sonoscope&logo=pypi&color=d0a215)](https://pypi.org/project/sonoscope/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

High-performance WebGL2 and WASM-accelerated audio visualization ecosystem for the web.

Sonoscope is structured as a modern monorepo featuring a unified audio & viewport coordinator, high-performance rendering engines, and declarative React bindings:

- **[`@sonoscope/core`](file:///home/santiago/Tmp/spectrogram-js/packages/core)**: Unified audio & viewport coordinator (`Sonoscope`), hardware-accelerated `SpectrogramViewer` (WebGL2 / WASM STFT) and `WaveformViewer` (Peak Decimation / GPU envelopes), streaming decoders, and canvas navigation.
- **[`@sonoscope/react`](file:///home/santiago/Tmp/spectrogram-js/packages/react)**: Declarative React components (`<Waveform />`, `<Spectrogram />`, `<SonoscopeProvider />`) and custom hooks (`useSonoscope`, `useSpectrogram`).

---

## Packages

| Package | Version | Description |
| :--- | :--- | :--- |
| [`@sonoscope/core`](file:///home/santiago/Tmp/spectrogram-js/packages/core) | `0.1.0` | Core audio & viewport coordinator, Spectrogram & Waveform viewers, WASM STFT, WebGL2 shaders, 35+ colormaps, streaming decoders |
| [`@sonoscope/react`](file:///home/santiago/Tmp/spectrogram-js/packages/react) | `0.1.0` | React hooks & declarative components (`useSonoscope`, `<SonoscopeProvider />`, `<Waveform />`, `<Spectrogram />`) |

---

## Quick Start

### Core (`@sonoscope/core`)

```bash
npm install @sonoscope/core
```

#### Synchronized Multi-Viewer (Waveform + Spectrogram)

```typescript
import { Sonoscope } from "@sonoscope/core";

const audio = document.querySelector("audio")!;
const waveCanvas = document.querySelector("#wave-canvas")!;
const specCanvas = document.querySelector("#spec-canvas")!;

// 1. Create unified coordinator from an Audio element, URL, Blob/File, or Float32Array
const scope = await Sonoscope.fromAudio(audio, {
  followPlayback: "page",
});

// Or from a drag-and-drop / uploaded File or Blob:
// const scope = await Sonoscope.fromBlob(file, { audio });

// Or from raw synthesized Float32Array samples:
// const scope = Sonoscope.fromArray(samples, 44100, { audio });

// 2. Attach viewers (automatically render on creation)
const waveform = scope.createWaveform(waveCanvas, {
  colorMap: "magma",
  amplitudeScale: 1.2,
});

const spectrogram = scope.createSpectrogram(specCanvas, {
  colorMap: "magma",
  frequencyScale: "mel",
  valueMode: "db",
});
```

### Python & Jupyter (`sonoscope`)

```bash
pip install sonoscope
```

```python
import numpy as np
from sonoscope import Sonoscope

# 1. From a local file path (reads bytes and syncs via binary traitlets)
widget = Sonoscope.from_file("recording.wav")

# 2. Or from a NumPy array (automatically encoded to in-memory WAV)
y = np.sin(2 * np.pi * 440 * np.linspace(0, 5, 22050 * 5, endpoint=False))
widget = Sonoscope.from_array(y, sample_rate=22050, cmap="viridis", frequency_scale="mel")

# Render directly in JupyterLab, VS Code, Google Colab, or Marimo
widget
```


### React (`@sonoscope/react`)

```bash
npm install @sonoscope/react @sonoscope/core
```

```tsx
import {
  SonoscopeProvider,
  Spectrogram,
  Waveform,
  useSonoscope,
} from "@sonoscope/react";

export function AudioExplorer({ url }: { url: string }) {
  const { scope, loading, error } = useSonoscope({
    url,
    followPlayback: "page",
  });

  if (loading) return <div>Loading audio stream...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <SonoscopeProvider value={scope}>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <Waveform style={{ height: "80px" }} amplitudeScale={1.2} />
        <Spectrogram
          style={{ height: "320px" }}
          colorMap="magma"
          frequencyScale="mel"
          valueMode="db"
        />
      </div>
    </SonoscopeProvider>
  );
}
```

---

## Key Capabilities

- 🎯 **Unified Viewport & Clock Coordinator (`Sonoscope`)**: Single source of truth for audio sources, time bounds, playback synchronization, seeking, and multi-viewer synchronization.
- ⚡ **Rust + WASM Accelerated STFT**: Embedded SIMD-ready Rust STFT with parallel worker pools and pure TypeScript fallback.
- 🎨 **WebGL2 Custom Shaders & 35+ Matplotlib Colormaps**: Hardware-accelerated tile rasterization with support for normal, dither, sobel, and 3D terrain shaders.
- 📊 **Multi-Scale Waveform Peak Decimation**: Multi-resolution min/max pyramid decimation for sub-millisecond envelope drawing across hours of audio.
- 🌊 **Adaptive Demand-Driven Streaming Decoders**: On-demand byte-range WAV slicing and WebCodecs MP3 stream decoding with backpressure.
- 🖱️ **Canvas Navigation**: Built-in wheel zoom (cursor-centered) and drag panning utilities with pointer capture.

---

## Development & Demos

```bash
# Install dependencies
npm install

# Run local Vite demo suite (includes Waveform, 4x4 Grid, Controls, Minimap, Shaders, React, etc.)
npm run dev:example

# Run tests
npm test
npm run test:browser

# Regenerate SciPy baseline reference fixtures (requires uv)
npm run fixtures:generate

# Build all packages
npm run build
```

---

## Mathematical Verification & SciPy Parity

Sonoscope's STFT engines (Pure TypeScript, Rust/WASM, Main Thread, and Worker pools) are strictly validated for mathematical parity against **SciPy's [`scipy.signal.ShortTimeFFT`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.ShortTimeFFT.spectrogram.html)**.

Synthetic audio fixtures (440 Hz Sine, Logarithmic Chirp, and Discrete Impulses) and ground-truth matrices are generated with `uv run scripts/generate_baseline_spectrograms.py` and tested across multiple windowing configurations for:
- Time grid alignment ($\Delta < 10^{-5}\text{ s}$)
- Frequency bin centers ($\Delta < 10^{-4}\text{ Hz}$)
- Magnitude & Power values ($\Delta < 10^{-4}$)
- Decibel values ($\Delta < 0.1\text{ dB}$ for bins $>-100\text{ dB}$)
