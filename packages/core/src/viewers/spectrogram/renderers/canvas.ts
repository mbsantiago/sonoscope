import type { PerformanceProfiler } from "../../../performance";
import type {
  ColorMapConfig,
  FrequencyScale,
  Rgba,
  ViewportConfig,
} from "../../../types";
import type { SpectrogramMatrix, ValueScaleConfig } from "../types";
import type { WebGL2RenderProgram } from "./webgl2-program";
import { buildColorMap } from "../../../colormap";
import { canvasToTimeFrequency } from "../frequency-scale";
import {
  locateSamplePosition,
  sampleValueDataPosition,
  valueDataForMode,
} from "../spectrogram-sampling";
import { normalizeValue } from "../value-scale";

export type HalftoneRenderOptions = {
  dotFrequency?: number | undefined;
  minEnergyThreshold?: number | undefined;
  energyGamma?: number | undefined;
};

export type RenderInput = {
  canvas: HTMLCanvasElement;
  viewport: ViewportConfig;
  frequencyScale?: FrequencyScale;
  valueScale: Required<ValueScaleConfig>;
  colorMap: ColorMapConfig;
  tiles: SpectrogramMatrix[];
  placeholders?: Array<{ timeStart: number; timeEnd: number }>;
  playheadTime?: number;
  webglProgram?:
    | "normal"
    | "halftone"
    | "sobel"
    | "terrain"
    | WebGL2RenderProgram;
  halftone?: HalftoneRenderOptions | undefined;
  profile?: PerformanceProfiler;
};

export type RendererKind = "webgl2" | "canvas2d";

export interface SpectrogramRenderer {
  readonly kind: RendererKind;
  invalidate(): void;
  render(input: RenderInput): void;
  destroy?(): void;
}

export class CanvasSpectrogramRenderer implements SpectrogramRenderer {
  readonly kind = "canvas2d" as const;

  invalidate(): void {}

  render(input: RenderInput): void {
    const paint = () => {
      const width = Math.max(1, input.canvas.width || 1);
      const height = Math.max(1, input.canvas.height || 1);

      const context = input.canvas.getContext("2d");
      if (!context) throw new Error("Unable to get 2D canvas context");

      context.clearRect(0, 0, width, height);

      const colors = buildColorMap(input.colorMap);
      const image = context.createImageData(width, height);
      for (const placeholder of input.placeholders ?? [])
        this.paintPlaceholder(
          image,
          width,
          height,
          input.viewport,
          placeholder.timeStart,
          placeholder.timeEnd,
        );
      for (const tile of input.tiles)
        this.paintTile(
          image,
          width,
          height,
          tile,
          input.viewport,
          input.valueScale,
          colors,
        );
      context.putImageData(image, 0, 0);
    };

    if (input.profile) {
      input.profile.measure(
        "renderer.paint",
        { tiles: input.tiles.length },
        paint,
      );
      return;
    }
    paint();
  }

  private paintTile(
    image: ImageData,
    width: number,
    height: number,
    tile: SpectrogramMatrix,
    viewport: ViewportConfig,
    valueScale: Required<ValueScaleConfig>,
    colors: Rgba[],
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

    const startX = Math.max(
      0,
      Math.floor(
        ((tileStartTime - viewport.startTime) /
          (viewport.endTime - viewport.startTime)) *
          width,
      ),
    );
    const endX = Math.min(
      width,
      Math.ceil(
        ((tileEndTime - viewport.startTime) /
          (viewport.endTime - viewport.startTime)) *
          width,
      ),
    );
    const valueData = valueDataForMode(tile, valueScale.mode);
    const rowPositions = Array.from({ length: height }, (_, y) => {
      const { frequency } = canvasToTimeFrequency(
        0,
        y,
        width,
        height,
        viewport,
      );
      return locateSamplePosition(tile.frequencies, frequency);
    });

    for (let x = startX; x < endX; x++) {
      const time =
        viewport.startTime +
        (x / width) * (viewport.endTime - viewport.startTime);
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

      for (let y = 0; y < height; y++) {
        const normalized = normalizeValue(
          sampleValueDataPosition(valueData, timePosition, rowPositions[y]!),
          valueScale,
        );
        const color =
          colors[Math.max(0, Math.min(255, Math.round(normalized * 255)))]!;
        const pixelIndex = (y * width + x) * 4;
        image.data[pixelIndex] = color[0];
        image.data[pixelIndex + 1] = color[1];
        image.data[pixelIndex + 2] = color[2];
        image.data[pixelIndex + 3] = color[3];
      }
    }
  }

  private paintPlaceholder(
    image: ImageData,
    width: number,
    height: number,
    viewport: ViewportConfig,
    timeStart: number,
    timeEnd: number,
  ): void {
    const startX = Math.max(
      0,
      Math.floor(
        ((timeStart - viewport.startTime) /
          (viewport.endTime - viewport.startTime)) *
          width,
      ),
    );
    const endX = Math.min(
      width,
      Math.ceil(
        ((timeEnd - viewport.startTime) /
          (viewport.endTime - viewport.startTime)) *
          width,
      ),
    );
    if (endX <= startX) return;

    for (let y = 0; y < height; y++) {
      for (let x = startX; x < endX; x++) {
        const pixelIndex = (y * width + x) * 4;
        const hatch = (x + y) % 12 < 2;
        image.data[pixelIndex] = hatch ? 71 : 15;
        image.data[pixelIndex + 1] = hatch ? 85 : 23;
        image.data[pixelIndex + 2] = hatch ? 105 : 42;
        image.data[pixelIndex + 3] = 255;
      }
    }
  }
}
