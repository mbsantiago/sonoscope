# @sonogram/react

React hooks and declarative components for [Sonogram](https://github.com/mbsantiago/spectrogram-js) spectrogram visualization.

## Installation

```bash
npm install @sonogram/react @sonogram/core
```

## Quick Start

### Declarative Component

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
      style={{ height: "300px" }}
    />
  );
}
```

### Custom Hook

```tsx
import { useSpectrogram } from "@sonogram/react";

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
