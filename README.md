# spectrogram-js

Framework-agnostic TypeScript spectrogram rendering for browser audio.

## Basic Usage

```ts
import { SpectrogramViewer } from 'spectrogram-js';

const audio = document.querySelector('audio')!;
const canvas = document.querySelector('canvas')!;

const viewer = await SpectrogramViewer.create({
  audio,
  canvas,
  colorMap: 'viridis',
});

await viewer.render();
```

## Audio Versus Source

`audio` and `source` serve different roles. The `audio` element is used for playback state, seeking, and playhead synchronization. The `source` is used for random-access sample reads during STFT computation.

If `source` is omitted, the viewer decodes `audio.currentSrc || audio.src` into a `DecodedAudioSource` automatically. Provide an explicit `source` when samples come from somewhere other than the playback element, or when you already have decoded audio data.

```ts
import { DecodedAudioSource, SpectrogramViewer } from 'spectrogram-js';

const source = await DecodedAudioSource.fromUrl('/audio/birdsong.wav');

const viewer = await SpectrogramViewer.create({
  audio,
  canvas,
  source,
});
```

## Digital dB Values

`db` values are digital spectrogram display values derived from decoded sample amplitudes. They are not calibrated dB SPL values and should not be interpreted as physical acoustic units.

## Queries

Use query APIs to inspect rendered data by time/frequency, canvas coordinates, time slices, or frame index.

```ts
const point = await viewer.queryPoint({ time: 3.4, frequency: 1200 });
const canvasPoint = await viewer.queryCanvasPoint({ x: 120, y: 80 });
const spectrum = await viewer.querySpectrum({ time: 3.4 });
const frame = await viewer.queryFrame({ frameIndex: 42 });

console.log(point.db, canvasPoint.frequency, spectrum.values.magnitude, frame.time);
```

## Basic Example

Run the Vite example server:

```bash
npm run dev:example
```

The basic example expects an audio file at `examples/basic/example.wav`. Add your own file there for local manual testing.
