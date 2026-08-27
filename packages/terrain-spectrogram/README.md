# @sonoscope/terrain-spectrogram

3D Perspective contour terrain WebGL2 shader program plugin for [Sonoscope](https://github.com/mbsantiago/sonoscope).

Visual treatment inspired by Chrome Music Lab's 3D sonogram shaders, adapted for real-time WebGL2 GPU audio spectrogram rendering.

> [!NOTE]
> **Visualization Only:** Due to the 3D perspective projection, the spectrogram does not align with standard 2D frequency axes. Attached frequency rulers and point coordinate queries will not return accurate frequency values. Use this shader for visual presentation rather than quantitative acoustic analysis.

## Installation

```bash
npm install @sonoscope/terrain-spectrogram @sonoscope/core
```

## Usage

```typescript
import "@sonoscope/terrain-spectrogram/auto";
import { Sonoscope } from "@sonoscope/core";

const scope = new Sonoscope({ source });
scope.createSpectrogram(canvas, {
  renderer: { type: "webgl", program: "terrain" },
});
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `heightScale` | `number` | `0.55` | Mountain peak height multiplier |
| `heightGamma` | `number` | `1.0` | Peak contrast curve exponent |
| `meshResolution` | `number` \| `[number, number]` | `64` | Grid mesh resolution (columns/rows) |
| `fov` | `number` | `70` | Camera field of view in degrees |
| `ambientLight` | `number` | `0.75` | Base ambient fill light [0, 1] |
| `diffuseLight` | `number` | `0.25` | Directional slope shading strength [0, 1] |
| `lightDirection` | `[number, number, number]` | `[0.15, 0.85, 0.45]` | 3D light direction vector |
| `smoothing` | `number` | `0.6` | 5-tap neighbor height smoothing weight [0, 1] |

## License

MIT
