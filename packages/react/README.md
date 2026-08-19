# @sonoscope/react

[![npm version](https://img.shields.io/npm/v/@sonoscope/react?logo=npm&color=3aa99f)](https://www.npmjs.com/package/@sonoscope/react)
[![CI](https://github.com/mbsantiago/sonoscope/actions/workflows/ci.yml/badge.svg)](https://github.com/mbsantiago/sonoscope/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

React hooks and declarative components for [Sonoscope](https://github.com/mbsantiago/spectrogram-js) audio visualization.

## Installation

```bash
npm install @sonoscope/react @sonoscope/core
```

## Quick Start

### Synchronized Multi-Viewer (`<Waveform />` + `<Spectrogram />`)

```tsx
import {
  SonoscopeProvider,
  Spectrogram,
  Waveform,
  useSonoscope,
} from "@sonoscope/react";

export function AudioViewer({ url }: { url: string }) {
  const { scope, loading, error } = useSonoscope({
    url,
    followPlayback: "page",
  });

  if (loading) return <div>Loading audio...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <SonoscopeProvider value={scope}>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <Waveform style={{ height: "80px" }} amplitudeScale={1.2} />
        <Spectrogram
          style={{ height: "300px" }}
          colorMap="magma"
          frequencyScale="mel"
          valueMode="db"
        />
      </div>
    </SonoscopeProvider>
  );
}
```

### Standalone Declarative Component

```tsx
import { Spectrogram } from "@sonoscope/react";

export function SingleSpectrogram() {
  return (
    <Spectrogram
      url="https://example.com/audio.wav"
      colorMap="magma"
      frequencyScale="mel"
      valueMode="db"
      showAudioControls
      style={{ height: "300px" }}
    />
  );
}
```

### Custom Hooks

```tsx
import { useSonoscope, useSpectrogram } from "@sonoscope/react";

export function CustomViewer() {
  const { canvasRef, audioRef, status, duration } = useSpectrogram({
    url: "https://example.com/audio.mp3",
    colorMap: "cividis",
    minValue: -100,
    maxValue: 0,
  });

  return (
    <div>
      <canvas ref={canvasRef} style={{ width: "100%", height: "300px" }} />
      <audio ref={audioRef} controls />
    </div>
  );
}
```
