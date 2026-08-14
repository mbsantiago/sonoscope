# Sonogram 🎵

High-performance WebGL2 and WASM-accelerated audio spectrogram ecosystem for the web.

Sonogram is structured as a modern monorepo featuring core engine packages and framework bindings:

- **[`@sonogram/core`](file:///home/santiago/Tmp/spectrogram-js/packages/core)**: Framework-agnostic TypeScript spectrogram engine with WASM STFT, WebGL2 shaders, adaptive streaming decoders, and canvas navigation.
- **[`@sonogram/react`](file:///home/santiago/Tmp/spectrogram-js/packages/react)**: Declarative React component (`<Spectrogram />`) and custom hook (`useSpectrogram`).

---

## Packages

| Package | Version | Description |
| :--- | :--- | :--- |
| [`@sonogram/core`](file:///home/santiago/Tmp/spectrogram-js/packages/core) | `0.1.0` | Core spectrogram engine (WASM STFT, WebGL2, Canvas 2D fallback, 35+ colormaps, streaming decoders) |
| [`@sonogram/react`](file:///home/santiago/Tmp/spectrogram-js/packages/react) | `0.1.0` | React hooks & declarative components |

---

## Quick Start

### Core (`@sonogram/core`)

```bash
npm install @sonogram/core
```

```typescript
import { SpectrogramViewer } from "@sonogram/core";

const audio = document.querySelector("audio")!;
const canvas = document.querySelector("canvas")!;

const viewer = await SpectrogramViewer.fromUrl({
  audio,
  canvas,
  url: "https://upload.wikimedia.org/wikipedia/commons/0/01/After_You%27ve_Gone_%28Harris_1918_recording%29.wav",
  colorMap: "magma",
  frequencyScale: "mel",
  valueMode: "db",
});

await viewer.render();
```

### React (`@sonogram/react`)

```bash
npm install @sonogram/react @sonogram/core
```

```tsx
import { Spectrogram } from "@sonogram/react";

export function AudioViewer() {
  return (
    <Spectrogram
      url="https://example.com/audio.wav"
      colorMap="magma"
      frequencyScale="mel"
      valueMode="db"
      showAudioControls
      style={{ height: "320px" }}
    />
  );
}
```

---

## Key Capabilities

- ⚡ **Rust + WASM Accelerated STFT**: Embedded SIMD-ready Rust STFT with pure TypeScript fallback.
- 🎨 **WebGL2 Custom Shaders & 35+ Matplotlib Colormaps**: Hardware-accelerated tile rasterization with support for normal, dither, sobel, and 3D terrain shaders.
- 🌊 **Adaptive Demand-Driven Streaming Decoders**: On-demand byte-range WAV slicing and WebCodecs MP3 stream decoding with backpressure.
- 🖱️ **Canvas Navigation**: Built-in wheel zoom (cursor-centered) and drag panning utilities with pointer capture.

---

## Development & Demos

```bash
# Install dependencies
npm install

# Run local Vite demo suite (includes 4x4 Grid, Controls, Minimap, Shaders, React, etc.)
npm run dev:example

# Run tests
npm test
npm run test:browser

# Build all packages
npm run build
```
