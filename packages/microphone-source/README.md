# @sonoscope/microphone-source

Experimental browser microphone monitor for [Sonoscope](https://github.com/mbsantiago/sonoscope). It displays a bounded window of recent audio in a Sonoscope spectrogram.

## Installation

```bash
npm install @sonoscope/microphone-source @sonoscope/core
```

## Quick start

```ts
import { createMicrophoneMonitor } from "@sonoscope/microphone-source";

const monitor = await createMicrophoneMonitor({ historySeconds: 10 });
const canvas = document.getElementById("spectrogram") as HTMLCanvasElement;

monitor.attachSpectrogram(canvas, {
  colorMap: "viridis",
  valueMode: "db",
  // The monitor keeps its previous frame visible while refreshing by default.
});

// Releases microphone resources and disposes the viewer.
monitor.destroy();
```

## Limits

The monitor starts with an empty window. New audio appears at the right edge and scrolls left as the window fills. Once it is full, it follows the latest `historySeconds` of audio. Older samples are discarded, so it is not for recording, seeking through past audio, or export.

## Options

- `historySeconds`: Visible audio history in seconds. Defaults to `10`.
- `refreshRate`: Maximum visual refreshes per second. Defaults to `10`.
- `channelCount`: Requested input channels. Defaults to `1`.
- `deviceId`: Specific microphone input device ID.
- `audioContext`: Existing context to use without taking ownership.
- `mediaStream`: Existing media stream to use without taking ownership.
- `echoCancellation`: Browser acoustic echo cancellation. Defaults to `true`.
- `noiseSuppression`: Browser background noise suppression. Defaults to `false`.
- `autoGainControl`: Browser automatic gain control. Defaults to `false`.

## Lifecycle

- `pause()` ignores new microphone samples while keeping the capture graph connected.
- `resume()` accepts samples again.
- `stop()` releases resources owned by the monitor and leaves the final image visible.
- `destroy()` stops capture and disposes its spectrogram, navigation handlers, and Sonoscope scope.

By default, the display waits for a complete update before replacing the image. Pass `loading: "placeholder"` to `attachSpectrogram()` to show Sonoscope's usual loading pattern instead.
