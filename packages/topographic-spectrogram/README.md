# @sonoscope/topographic-spectrogram

Topographic contour elevation line WebGL2 shader program plugin for [Sonoscope](https://github.com/mbsantiago/sonoscope).

Renders real-time elevation isolines and topography contours across the frequency-time spectrum on the GPU.

## Installation

```bash
npm install @sonoscope/topographic-spectrogram @sonoscope/core
```

## Usage

```typescript
import "@sonoscope/topographic-spectrogram/auto";
import { Sonoscope } from "@sonoscope/core";

const scope = new Sonoscope({ source });
scope.createSpectrogram(canvas, {
  renderer: { type: "webgl", program: "topographic" },
});
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `contourInterval` | `number` | `0.15` | Energy spacing between adjacent contour rings |
| `contourLineWidth` | `number` | `1.0` | Line thickness in screen pixels |
| `contourLineOpacity` | `number` | `0.9` | Opacity of the contour lines [0, 1] |
| `minEnergyThreshold` | `number` | `0.14` | Noise floor cutoff threshold |

## License

MIT
