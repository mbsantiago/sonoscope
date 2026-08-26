# @sonoscope/ascii-spectrogram

ASCII art spectrogram renderer plugin for [Sonoscope](https://github.com/mbsantiago/sonoscope).

Renders audio spectrograms into typography and text art in real time on HTML5 Canvas.

## Installation

```bash
npm install @sonoscope/ascii-spectrogram @sonoscope/core
```

## Quick Start

### Auto-Registration (Zero-Config)

Simply importing the `/auto` subpath auto-registers `"ascii"` as a renderer in Sonoscope:

```typescript
import "@sonoscope/ascii-spectrogram/auto";
import { Sonoscope } from "@sonoscope/core";

const scope = new Sonoscope({ source });
scope.createSpectrogram(canvas, {
  renderer: "ascii",
});
```

### CDN / Script Tag Usage

When using unpkg or jsdelivr in plain HTML, simply include the script after `@sonoscope/core`:

```html
<script src="https://unpkg.com/@sonoscope/core"></script>
<script src="https://unpkg.com/@sonoscope/ascii-spectrogram"></script>

<script>
  const scope = new Sonoscope.Sonoscope({ source });
  scope.createSpectrogram(document.getElementById("canvas"), {
    renderer: "ascii",
  });
</script>
```

### Custom Global Registration

To customize default options globally:

```typescript
import { registerAsciiRenderer } from "@sonoscope/ascii-spectrogram";

// Customize options (e.g. green phosphor theme)
registerAsciiRenderer("ascii", {
  colorMode: "green", // "colormap" | "monochrome" | "green" | "amber"
  fontSize: 10,
  charSet: " .:-=+*#%@",
});
```

### React Usage

```tsx
import { registerAsciiRenderer } from "@sonoscope/ascii-spectrogram";
import { Spectrogram } from "@sonoscope/react";

registerAsciiRenderer("ascii", { colorMode: "amber" });

export function AsciiSpectrogramView() {
  return (
    <Spectrogram
      url="audio.mp3"
      renderer="ascii"
    />
  );
}
```

### Direct Instance

```typescript
import { AsciiSpectrogramRenderer } from "@sonoscope/ascii-spectrogram";

const renderer = new AsciiSpectrogramRenderer({
  charSet: " ░▒▓█",
  colorMode: "colormap",
  fontSize: 12,
  backgroundColor: "#000000",
});

scope.createSpectrogram(canvas, {
  renderer,
});
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `charSet` | `string` | `" .:-=+*#%@"` | Characters ordered from lowest to highest intensity |
| `fontSize` | `number` | `10` | Font size in CSS pixels |
| `fontFamily` | `string` | `"monospace"` | Monospace font family |
| `colorMode` | `"colormap" \| "monochrome" \| "green" \| "amber"` | `"colormap"` | Color styling palette |
| `textColor` | `string` | `"#00ff66"` | Custom text color for monochrome mode |
| `backgroundColor` | `string` | `"#0a0a0c"` | Background fill color |
| `invert` | `boolean` | `false` | Invert brightness mapping |
| `charWidth` | `number` | `Math.ceil(fontSize * 0.6)` | Explicit cell width |
| `charHeight` | `number` | `fontSize` | Explicit cell height |

## License

MIT
