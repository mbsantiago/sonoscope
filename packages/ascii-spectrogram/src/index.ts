import {
  buildColorMap,
  canvasToTimeFrequency,
  locateSamplePosition,
  normalizeValue,
  type RenderInput,
  type Rgba,
  registerSpectrogramRenderer,
  type SpectrogramMatrix,
  type SpectrogramRenderer,
  sampleValueDataPosition,
  type ValueScaleConfig,
  type ViewportConfig,
  valueDataForMode,
} from "@sonoscope/core";

export interface AsciiSpectrogramRendererOptions {
  /**
   * Character set ordered from lowest to highest intensity.
   * @default " .:-=+*#%@"
   */
  charSet?: string | undefined;

  /**
   * Font size in pixels.
   * @default 10
   */
  fontSize?: number | undefined;

  /**
   * Font family for monospace text rendering.
   * @default "monospace"
   */
  fontFamily?: string | undefined;

  /**
   * Color rendering style:
   * - "colormap": Text colored by active spectrogram colormap.
   * - "monochrome": Single color for all text.
   * - "green": Classic CRT green phosphor palette.
   * - "amber": Classic CRT amber phosphor palette.
   * @default "colormap"
   */
  colorMode?: "colormap" | "monochrome" | "green" | "amber" | undefined;

  /**
   * Custom text color used when colorMode is "monochrome".
   * @default "#00ff66"
   */
  textColor?: string | undefined;

  /**
   * Background canvas color.
   * @default "#0a0a0c"
   */
  backgroundColor?: string | undefined;

  /**
   * Whether to invert character intensity mapping.
   * @default false
   */
  invert?: boolean | undefined;

  /**
   * Explicit horizontal width of each character cell in CSS pixels.
   * Defaults to Math.ceil(fontSize * 0.6).
   */
  charWidth?: number | undefined;

  /**
   * Explicit vertical height of each character cell in CSS pixels.
   * Defaults to fontSize.
   */
  charHeight?: number | undefined;
}

const DEFAULT_CHARSET = " .:-=+*#%@";
const DEFAULT_FONT_SIZE = 10;
const DEFAULT_FONT_FAMILY = "monospace";
const DEFAULT_BG = "#0a0a0c";

/**
 * Custom Spectrogram Renderer that transforms spectral energy into ASCII art typography.
 */
export class AsciiSpectrogramRenderer implements SpectrogramRenderer {
  readonly kind = "canvas2d" as const;

  private options: AsciiSpectrogramRendererOptions;

  constructor(options: AsciiSpectrogramRendererOptions = {}) {
    this.options = { ...options };
  }

  updateOptions(options: Partial<AsciiSpectrogramRendererOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): AsciiSpectrogramRendererOptions {
    return { ...this.options };
  }

  invalidate(): void {}

  render(input: RenderInput): void {
    const width = Math.max(1, input.canvas.width || 1);
    const height = Math.max(1, input.canvas.height || 1);

    const context = input.canvas.getContext("2d");
    if (!context) throw new Error("Unable to get 2D canvas context");

    const fontSize = this.options.fontSize ?? DEFAULT_FONT_SIZE;
    const fontFamily = this.options.fontFamily ?? DEFAULT_FONT_FAMILY;
    const charWidth =
      this.options.charWidth ?? Math.max(4, Math.ceil(fontSize * 0.6));
    const charHeight = this.options.charHeight ?? Math.max(6, fontSize);
    const charSet = this.options.charSet ?? DEFAULT_CHARSET;
    const chars = charSet.split("");
    const numChars = chars.length;
    const bgColor = this.options.backgroundColor ?? DEFAULT_BG;
    const colorMode = this.options.colorMode ?? "colormap";
    const invert = this.options.invert ?? false;

    // Fill background
    context.fillStyle = bgColor;
    context.fillRect(0, 0, width, height);

    if (numChars === 0) return;

    context.font = `${fontSize}px ${fontFamily}`;
    context.textBaseline = "top";

    const cols = Math.ceil(width / charWidth);
    const rows = Math.ceil(height / charHeight);

    const colors = buildColorMap(input.colorMap);

    for (const tile of input.tiles) {
      this.paintTileAscii(
        context,
        cols,
        rows,
        charWidth,
        charHeight,
        chars,
        numChars,
        tile,
        input.viewport,
        input.valueScale,
        colors,
        colorMode,
        invert,
      );
    }
  }

  private paintTileAscii(
    context: CanvasRenderingContext2D,
    cols: number,
    rows: number,
    charWidth: number,
    charHeight: number,
    chars: string[],
    numChars: number,
    tile: SpectrogramMatrix,
    viewport: ViewportConfig,
    valueScale: Required<ValueScaleConfig>,
    colors: Rgba[],
    colorMode: "colormap" | "monochrome" | "green" | "amber",
    invert: boolean,
  ): void {
    if (tile.frameCount === 0 || tile.binCount === 0) return;

    const hopDuration =
      tile.times.length > 1
        ? (tile.times[tile.times.length - 1]! - tile.times[0]!) /
          Math.max(1, tile.frameCount - 1)
        : tile.sampleRate > 0
          ? (tile.timeEnd - tile.timeStart) / tile.frameCount
          : 0;
    const tileStartTime =
      tile.times.length > 0 ? tile.times[0]! : tile.timeStart;
    const tileEndTime = tileStartTime + tile.frameCount * hopDuration;

    const vpDuration = viewport.endTime - viewport.startTime;
    if (vpDuration <= 0) return;

    const valueData = valueDataForMode(tile, valueScale.mode);

    // Precalculate frequency row positions
    const rowPositions = Array.from({ length: rows }, (_, row) => {
      const pixelY = (row + 0.5) * charHeight;
      const { frequency } = canvasToTimeFrequency(
        0,
        pixelY,
        cols * charWidth,
        rows * charHeight,
        viewport,
      );
      return locateSamplePosition(tile.frequencies, frequency);
    });

    for (let col = 0; col < cols; col++) {
      const pixelX = (col + 0.5) * charWidth;
      const time =
        viewport.startTime + (pixelX / (cols * charWidth)) * vpDuration;
      if (time < tileStartTime || time > tileEndTime) continue;

      const framePosition = Math.max(
        0,
        Math.min(
          tile.frameCount - 1,
          (time - tileStartTime) / Math.max(0.000001, hopDuration),
        ),
      );
      const low = Math.floor(framePosition);
      const high = Math.min(tile.frameCount - 1, Math.ceil(framePosition));
      const fraction = framePosition - low;
      const timePosition = { low, high, fraction };

      for (let row = 0; row < rows; row++) {
        const rawValue = sampleValueDataPosition(
          valueData,
          timePosition,
          rowPositions[row]!,
        );
        let normalized = normalizeValue(rawValue, valueScale);
        if (invert) normalized = 1 - normalized;

        const charIdx = Math.max(
          0,
          Math.min(numChars - 1, Math.floor(normalized * numChars)),
        );
        const char = chars[charIdx] ?? " ";
        if (char === " ") continue;

        context.fillStyle = this.resolveCharColor(
          normalized,
          colors,
          colorMode,
        );
        context.fillText(char, col * charWidth, row * charHeight);
      }
    }
  }

  private resolveCharColor(
    normalized: number,
    colors: Rgba[],
    colorMode: "colormap" | "monochrome" | "green" | "amber",
  ): string {
    if (colorMode === "monochrome") {
      return this.options.textColor ?? "#00ff66";
    }
    if (colorMode === "green") {
      const g = Math.round(100 + normalized * 155);
      return `rgb(0, ${g}, ${Math.round(normalized * 50)})`;
    }
    if (colorMode === "amber") {
      const r = Math.round(120 + normalized * 135);
      const g = Math.round(60 + normalized * 115);
      return `rgb(${r}, ${g}, 0)`;
    }
    const colorIndex = Math.max(0, Math.min(255, Math.round(normalized * 255)));
    const color = colors[colorIndex]!;
    return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
  }
}

/**
 * Helper to construct an ASCII spectrogram renderer instance.
 */
export function createAsciiRenderer(
  options?: AsciiSpectrogramRendererOptions,
): AsciiSpectrogramRenderer {
  return new AsciiSpectrogramRenderer(options);
}

/**
 * Registers the ASCII spectrogram renderer globally under a specified name.
 * @param name Custom renderer name (default: "ascii").
 * @param defaultOptions Default options applied when instantiating the renderer.
 */
export function registerAsciiRenderer(
  name = "ascii",
  defaultOptions?: AsciiSpectrogramRendererOptions,
): void {
  registerSpectrogramRenderer(name, (_canvas, options) => {
    return new AsciiSpectrogramRenderer({
      ...defaultOptions,
      ...(options as AsciiSpectrogramRendererOptions),
    });
  });
}
