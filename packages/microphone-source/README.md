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

The monitor displays only the newest `historySeconds` of PCM. It is not a recording source. It does not preserve absolute timestamps, expose prior audio for seeking, or support export. Use Sonoscope's normal audio sources for those jobs.

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

Pass `loading: "placeholder"` to `attachSpectrogram()` if the standard missing-tile drawing is preferred.
