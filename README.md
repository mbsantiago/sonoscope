# Sonoscope 🎵

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

// 1. Create unified coordinator for audio & time viewport
const scope = await Sonoscope.fromUrl("https://example.com/audio.wav", {
  audio,
  followPlayback: "page",
});

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

# Build all packages
npm run build
```
