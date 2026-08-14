import { buildColorMap } from "../colormap";
import {
  canvasToTimeFrequency,
  timeFrequencyToCanvas,
} from "../frequency-scale";
import { normalizeValue } from "../value-scale";

export { pickNearestBin, pickNearestFrame } from "../spectrogram-sampling";

import type { PerformanceProfiler } from "../performance";
import {
  locateSamplePosition,
  sampleValueDataPosition,
  valueDataForMode,
} from "../spectrogram-sampling";
import type {
  ColorMapConfig,
  Rgba,
  SpectrogramMatrix,
  ValueScaleConfig,
  ViewportConfig,
} from "../types";
import type { WebGL2RenderProgram } from "./webgl2-program";

export type RenderInput = {
  canvas: HTMLCanvasElement;
  viewport: ViewportConfig;
  valueScale: Required<ValueScaleConfig>;
  colorMap: ColorMapConfig;
  tiles: SpectrogramMatrix[];
  placeholders?: Array<{ timeStart: number; timeEnd: number }>;
  playheadTime?: number;
  webglProgram?:
    | "normal"
    | "dither"
    | "sobel"
    | "terrain"
    | WebGL2RenderProgram;
  profile?: PerformanceProfiler;
};

export type PlayheadRenderInput = {
  canvas: HTMLCanvasElement;
  viewport: ViewportConfig;
  playheadTime: number;
};

export type LoadingRenderInput = {
  canvas: HTMLCanvasElement;
  text?: string;
};

export type RendererKind = "webgl2" | "canvas2d";

export interface SpectrogramRenderer {
  readonly kind: RendererKind;
  invalidate(): void;
  render(input: RenderInput): void;
  renderPlayhead(input: PlayheadRenderInput): boolean;
  renderLoading(input: LoadingRenderInput): void;
  destroy?(): void;
}

type BaseFrame = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  dpr: number;
  deviceWidth: number;
  deviceHeight: number;
  viewport: ViewportConfig;
  image: ImageData;
};

export class CanvasSpectrogramRenderer implements SpectrogramRenderer {
  readonly kind = "canvas2d" as const;
  private baseFrame: BaseFrame | undefined;

  invalidate(): void {
    this.baseFrame = undefined;
  }

  render(input: RenderInput): void {
    const paint = () => {
      const rect = input.canvas.getBoundingClientRect();
      const width = Math.max(
        1,
        Math.round(rect.width || input.canvas.width || 1),
      );
      const height = Math.max(
        1,
        Math.round(rect.height || input.canvas.height || 1),
      );
      const dpr = globalThis.devicePixelRatio || 1;
      const deviceWidth = Math.max(1, Math.round(width * dpr));
      const deviceHeight = Math.max(1, Math.round(height * dpr));
      input.canvas.width = deviceWidth;
      input.canvas.height = deviceHeight;

      const context = input.canvas.getContext("2d");
      if (!context) throw new Error("Unable to get 2D canvas context");

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const colors = buildColorMap(input.colorMap);
      const image = context.createImageData(deviceWidth, deviceHeight);
      for (const placeholder of input.placeholders ?? [])
        this.paintPlaceholder(
          image,
          deviceWidth,
          deviceHeight,
          input.viewport,
          placeholder.timeStart,
          placeholder.timeEnd,
        );
      for (const tile of input.tiles)
        this.paintTile(
          image,
          deviceWidth,
          deviceHeight,
          tile,
          input.viewport,
          input.valueScale,
          colors,
        );
      context.putImageData(image, 0, 0);
      this.baseFrame = {
        canvas: input.canvas,
        width,
        height,
        dpr,
        deviceWidth,
        deviceHeight,
        viewport: { ...input.viewport },
        image,
      };

      if (input.playheadTime !== undefined)
        this.drawPlayhead(
          context,
          width,
          height,
          input.viewport,
          input.playheadTime,
        );
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

  renderPlayhead(input: PlayheadRenderInput): boolean {
    const frame = this.baseFrame;
    if (
      !frame ||
      frame.canvas !== input.canvas ||
      !sameViewport(frame.viewport, input.viewport)
    )
      return false;

    const rect = input.canvas.getBoundingClientRect();
    const width = Math.max(
      1,
      Math.round(rect.width || input.canvas.width || 1),
    );
    const height = Math.max(
      1,
      Math.round(rect.height || input.canvas.height || 1),
    );
    const dpr = globalThis.devicePixelRatio || 1;
    const deviceWidth = Math.max(1, Math.round(width * dpr));
    const deviceHeight = Math.max(1, Math.round(height * dpr));
    if (
      frame.width !== width ||
      frame.height !== height ||
      frame.dpr !== dpr ||
      frame.deviceWidth !== deviceWidth ||
      frame.deviceHeight !== deviceHeight
    )
      return false;

    const context = input.canvas.getContext("2d");
    if (!context) throw new Error("Unable to get 2D canvas context");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.putImageData(frame.image, 0, 0);
    this.drawPlayhead(
      context,
      width,
      height,
      input.viewport,
      input.playheadTime,
    );
    return true;
  }

  renderLoading(input: LoadingRenderInput): void {
    const rect = input.canvas.getBoundingClientRect();
    const width = Math.max(
      1,
      Math.round(rect.width || input.canvas.width || 1),
    );
    const height = Math.max(
      1,
      Math.round(rect.height || input.canvas.height || 1),
    );
    const dpr = globalThis.devicePixelRatio || 1;
    input.canvas.width = Math.max(1, Math.round(width * dpr));
    input.canvas.height = Math.max(1, Math.round(height * dpr));

    const context = input.canvas.getContext("2d");
    if (!context) throw new Error("Unable to get 2D canvas context");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.save();
    context.fillStyle = "rgba(15,23,42,0.78)";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "rgba(248,250,252,0.92)";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "14px system-ui, sans-serif";
    context.fillText(
      input.text ?? "Loading spectrogram...",
      width / 2,
      height / 2,
    );
    context.restore();
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
    const startX = Math.max(
      0,
      Math.floor(
        ((tile.timeStart - viewport.startTime) /
          (viewport.endTime - viewport.startTime)) *
          width,
      ),
    );
    const endX = Math.min(
      width,
      Math.ceil(
        ((tile.timeEnd - viewport.startTime) /
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
      if (time < tile.timeStart || time > tile.timeEnd || tile.frameCount === 0)
        continue;
      const timePosition = locateSamplePosition(tile.times, time);

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

  private drawPlayhead(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    viewport: ViewportConfig,
    time: number,
  ): void {
    if (time < viewport.startTime || time > viewport.endTime) return;

    const { x } = timeFrequencyToCanvas(
      time,
      viewport.minFrequency,
      width,
      height,
      viewport,
    );
    context.save();
    context.strokeStyle = "rgba(255,255,255,0.9)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.restore();
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

function sameViewport(left: ViewportConfig, right: ViewportConfig): boolean {
  return (
    left.startTime === right.startTime &&
    left.endTime === right.endTime &&
    left.minFrequency === right.minFrequency &&
    left.maxFrequency === right.maxFrequency &&
    left.frequencyScale === right.frequencyScale
  );
}
