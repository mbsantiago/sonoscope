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

## License

MIT
