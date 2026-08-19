# Sonoscope

[![CI](https://github.com/mbsantiago/sonoscope/actions/workflows/ci.yml/badge.svg)](https://github.com/mbsantiago/sonoscope/actions/workflows/ci.yml) [![Documentation](https://github.com/mbsantiago/sonoscope/actions/workflows/deploy-pages.yml/badge.svg)](https://mbsantiago.github.io/sonoscope/) [![Release & Publish](https://github.com/mbsantiago/sonoscope/actions/workflows/release.yml/badge.svg)](https://github.com/mbsantiago/sonoscope/actions/workflows/release.yml) [![npm @sonoscope/core](https://img.shields.io/npm/v/@sonoscope/core?label=@sonoscope/core&logo=npm&color=3aa99f)](https://www.npmjs.com/package/@sonoscope/core) [![npm @sonoscope/react](https://img.shields.io/npm/v/@sonoscope/react?label=@sonoscope/react&logo=npm&color=3aa99f)](https://www.npmjs.com/package/@sonoscope/react) [![PyPI - sonoscope](https://img.shields.io/pypi/v/sonoscope?label=sonoscope&logo=pypi&color=d0a215)](https://pypi.org/project/sonoscope/) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Hardware-accelerated audio spectrogram and waveform visualization for the web and Python notebooks, powered by WebGL2 and WebAssembly.

---

## Motivation

Audio analysis and bioacoustics workflows often require interactive spectrograms with granular control over STFT parameters (window size, hop length, FFT resolution, window functions) that can update on the fly.
In web environments, building these interfaces often meant choosing between two compromises:

1. **Pre-rendered static images**, which cannot adapt to user parameter changes or zoom levels.
2. **Client-server architectures**, which offload STFT computation to a remote server, adding latency, hosting costs, and deployment complexity.

Long recordings and soundscapes can also span several hours.
Decoding and computing an entire multi-hour file upfront in the browser stalls or crashes the tab.

In Python notebooks, exploratory analysis still relies heavily on static Matplotlib figures where zooming or adjusting parameters requires re-running cells and re-slicing arrays.

Sonoscope addresses these constraints:

- **Demand-driven tiled computation.** Decodes and computes spectrograms only for the visible screen window rather than processing the entire file at once, keeping panning and zooming smooth on recordings of any length.
- **Client-side WebAssembly and WebGL2.** Everything runs directly in the browser with no backend server needed.
  Signal processing runs in the background using fast compiled code (Rust via WebAssembly), while visual drawing is offloaded to the graphics card (WebGL2) at 60 FPS.
- **Python notebook integration.** Provides an interactive `anywidget` component for JupyterLab, VS Code, Google Colab, and Marimo, replacing static image plots with zoomable views.
- **SciPy parity.** Verifies STFT outputs against `scipy.signal.ShortTimeFFT` to match standard scientific tooling.

---

## Packages

| Package                                                                       | Version | Description                                                                                                                                   |
| :---------------------------------------------------------------------------- | :------ | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@sonoscope/core`](file:///home/santiago/Tmp/spectrogram-js/packages/core)   | `0.1.0` | Core audio and viewport coordinator, WebGL2 and Canvas spectrogram and waveform viewers, WASM STFT compute, 35+ colormaps, streaming decoders |
| [`@sonoscope/react`](file:///home/santiago/Tmp/spectrogram-js/packages/react) | `0.1.0` | Declarative React components (`<Spectrogram />`, `<Waveform />`, `<SonoscopeProvider />`) and hooks (`useSonoscope`, `useSpectrogram`)        |
| [`sonoscope`](file:///home/santiago/Tmp/spectrogram-js/packages/anywidget)    | `0.1.0` | Interactive Jupyter, VS Code, Google Colab, and Marimo notebook widget powered by `anywidget`                                                 |

---

## Quick start

### Core (`@sonoscope/core`)

```bash
npm install @sonoscope/core
```

#### Synchronized multi-viewer (Waveform + Spectrogram)

```typescript
import { Sonoscope } from "@sonoscope/core";

const audio = document.querySelector("audio")!;
const waveCanvas = document.querySelector<HTMLCanvasElement>("#wave-canvas")!;
const specCanvas = document.querySelector<HTMLCanvasElement>("#spec-canvas")!;

// 1. Create a unified coordinator from an Audio element, URL, Blob/File, or Float32Array
const scope = await Sonoscope.fromAudio(audio, {
  followPlayback: "page",
});

// Or initialize directly:
// const scope = await Sonoscope.fromUrl("https://example.com/soundscape.wav");
// const scope = await Sonoscope.fromBlob(audioFile);
// const scope = Sonoscope.fromArray(float32Samples, 44100);

// 2. Attach synchronized viewers
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

### Python and Jupyter (`sonoscope`)

```bash
pip install sonoscope
```

```python
import numpy as np
from sonoscope import Sonoscope

# 1. From a local audio file (reads bytes and syncs via binary traitlets)
widget = Sonoscope.from_file("soundscape.wav")

# 2. Or directly from a NumPy array
sr = 22050
y = np.sin(2 * np.pi * 440 * np.linspace(0, 5, sr * 5, endpoint=False))
widget = Sonoscope.from_array(y, sample_rate=sr, cmap="viridis", frequency_scale="mel")

# Render directly in JupyterLab, VS Code, Google Colab, or Marimo
widget
```

---

## How it compares

Most JavaScript audio libraries focus on waveform navigation or real-time microphone visualizers. Sonoscope is built specifically for interactive, multi-resolution spectrogram and waveform analysis across both short audio clips and long soundscapes.

| Capability | Sonoscope | wavesurfer.js (spectrogram) | peaks.js | Web Audio API (`AnalyserNode`) |
| :--- | :--- | :--- | :--- | :--- |
| **Spectrogram renderer** | WebGL2 GPU shaders (60 FPS) | Canvas 2D | None (waveform only) | Canvas 2D (manual) |
| **STFT computation** | Rust / WebAssembly worker pool | Single-thread JavaScript | None | Browser playback FFT only |
| **Long soundscape support** | Demand-driven tiled computation | Computes full file upfront | Precomputed peak files | Live playback stream only |
| **Live STFT adjustment** | On-the-fly window, hop, and FFT updates | Full recomputation | N/A | Fixed FFT size changes only |
| **Data querying & coordinate API** | Full (time/frequency slices, dB) | Limited | None | Raw frequency byte array |
| **App integration & modularity** | Decoupled coordinator & viewers | Plugin architecture | Event-based UI | Browser audio node |
| **Scientific scales & colormaps** | Mel, Log, Linear (35+ colormaps) | Linear (basic gradient) | N/A | Linear |
| **Python notebook support** | Interactive `anywidget` component | None | None | None |

See [COMPARISON.md](file:///home/santiago/Tmp/spectrogram-js/COMPARISON.md) for an in-depth architectural and feature breakdown across all libraries.

---

## Development and demos

```bash
# Install dependencies
npm install

# Run local Vite demo suite (waveform, spectrogram grid, controls, minimap, shaders, React, etc.)
npm run dev:example

# Run unit and browser test suites
npm test
npm run test:browser

# Regenerate SciPy baseline reference fixtures (requires uv)
npm run fixtures:generate

# Build all packages
npm run build
```
