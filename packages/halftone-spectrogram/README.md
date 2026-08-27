# @sonoscope/halftone-spectrogram

Halftone dot-matrix WebGL2 shader program plugin for [Sonoscope](https://github.com/mbsantiago/sonoscope).

Renders spectrogram energy as dynamic retro halftone dots directly on the GPU.

## Installation

```bash
npm install @sonoscope/halftone-spectrogram @sonoscope/core
```

## Usage

```typescript
import "@sonoscope/halftone-spectrogram/auto";
import { Sonoscope } from "@sonoscope/core";

const scope = new Sonoscope({ source });
scope.createSpectrogram(canvas, {
  renderer: { type: "webgl", program: "halftone" },
});
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `dotFrequency` | `number` | `0.24` | Density of the dot matrix |
| `dotAngle` | `number` | `45` | Grid orientation angle in degrees |
| `minEnergyThreshold` | `number` | `0` | Energy floor for rendering dots |
| `energyGamma` | `number` | `1.4` | Falloff gamma curve |
| `maxDotRadius` | `number` | `0.7071` | Maximum dot radius |
| `dotSoftness` | `number` | `0.75` | Anti-aliasing edge softness multiplier |
| `backgroundOpacity` | `number` | `1.0` | Background opacity [0, 1] |


## License

MIT
