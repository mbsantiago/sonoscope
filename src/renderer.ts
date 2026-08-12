import { buildColorMap } from './colormap';
import { canvasToTimeFrequency, timeFrequencyToCanvas } from './frequency-scale';
import { normalizeValue } from './value-scale';
import type { PerformanceProfiler } from './performance';
import type { ColorMapConfig, Rgba, SpectrogramMatrix, ValueScaleConfig, ViewportConfig } from './types';

export type RenderInput = {
  canvas: HTMLCanvasElement;
  viewport: ViewportConfig;
  valueScale: Required<ValueScaleConfig>;
  colorMap: ColorMapConfig;
  tiles: SpectrogramMatrix[];
  playheadTime?: number;
  profile?: PerformanceProfiler;
};

export type PlayheadRenderInput = {
  canvas: HTMLCanvasElement;
  viewport: ViewportConfig;
  playheadTime: number;
};

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

export function pickNearestFrame(times: Float32Array, time: number): number {
  let best = 0;
  for (let i = 1; i < times.length; i++) {
    if (Math.abs(times[i]! - time) < Math.abs(times[best]! - time)) best = i;
  }
  return best;
}

export function pickNearestBin(frequencies: Float32Array, frequency: number): number {
  let best = 0;
  for (let i = 1; i < frequencies.length; i++) {
    if (Math.abs(frequencies[i]! - frequency) < Math.abs(frequencies[best]! - frequency)) best = i;
  }
  return best;
}

function selectedValue(tile: SpectrogramMatrix, index: number, mode: ValueScaleConfig['mode']): number {
  if (mode === 'power') return tile.power?.[index] ?? tile.magnitude[index]! ** 2;
  if (mode === 'db') return tile.db?.[index] ?? 20 * Math.log10(Math.max(1e-12, Math.abs(tile.magnitude[index]!)));
  return tile.magnitude[index]!;
}

export class CanvasSpectrogramRenderer {
  private baseFrame: BaseFrame | undefined;

  invalidate(): void {
    this.baseFrame = undefined;
  }

  render(input: RenderInput): void {
    const paint = () => {
      const rect = input.canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width || input.canvas.width || 1));
      const height = Math.max(1, Math.round(rect.height || input.canvas.height || 1));
      const dpr = globalThis.devicePixelRatio || 1;
      const deviceWidth = Math.max(1, Math.round(width * dpr));
      const deviceHeight = Math.max(1, Math.round(height * dpr));
      input.canvas.width = deviceWidth;
      input.canvas.height = deviceHeight;

      const context = input.canvas.getContext('2d');
      if (!context) throw new Error('Unable to get 2D canvas context');

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const colors = buildColorMap(input.colorMap);
      const image = context.createImageData(deviceWidth, deviceHeight);
      for (const tile of input.tiles) this.paintTile(image, deviceWidth, deviceHeight, tile, input.viewport, input.valueScale, colors);
      context.putImageData(image, 0, 0);
      this.baseFrame = { canvas: input.canvas, width, height, dpr, deviceWidth, deviceHeight, viewport: { ...input.viewport }, image };

      if (input.playheadTime !== undefined) this.drawPlayhead(context, width, height, input.viewport, input.playheadTime);
    };

    if (input.profile) {
      input.profile.measure('renderer.paint', { tiles: input.tiles.length }, paint);
      return;
    }
    paint();
  }

  renderPlayhead(input: PlayheadRenderInput): boolean {
    const frame = this.baseFrame;
    if (!frame || frame.canvas !== input.canvas || !sameViewport(frame.viewport, input.viewport)) return false;

    const rect = input.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || input.canvas.width || 1));
    const height = Math.max(1, Math.round(rect.height || input.canvas.height || 1));
    const dpr = globalThis.devicePixelRatio || 1;
    const deviceWidth = Math.max(1, Math.round(width * dpr));
    const deviceHeight = Math.max(1, Math.round(height * dpr));
    if (frame.width !== width || frame.height !== height || frame.dpr !== dpr || frame.deviceWidth !== deviceWidth || frame.deviceHeight !== deviceHeight) return false;

    const context = input.canvas.getContext('2d');
    if (!context) throw new Error('Unable to get 2D canvas context');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.putImageData(frame.image, 0, 0);
    this.drawPlayhead(context, width, height, input.viewport, input.playheadTime);
    return true;
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
    for (let x = 0; x < width; x++) {
      const time = viewport.startTime + (x / width) * (viewport.endTime - viewport.startTime);
      if (time < tile.timeStart || time > tile.timeEnd || tile.frameCount === 0) continue;

      const frame = pickNearestFrame(tile.times, time);
      for (let y = 0; y < height; y++) {
        const { frequency } = canvasToTimeFrequency(x, y, width, height, viewport);
        const bin = pickNearestBin(tile.frequencies, frequency);
        const matrixIndex = frame * tile.binCount + bin;
        const normalized = normalizeValue(selectedValue(tile, matrixIndex, valueScale.mode), valueScale);
        const color = colors[Math.max(0, Math.min(255, Math.round(normalized * 255)))]!;
        const pixelIndex = (y * width + x) * 4;
        image.data[pixelIndex] = color[0];
        image.data[pixelIndex + 1] = color[1];
        image.data[pixelIndex + 2] = color[2];
        image.data[pixelIndex + 3] = color[3];
      }
    }
  }

  private drawPlayhead(context: CanvasRenderingContext2D, width: number, height: number, viewport: ViewportConfig, time: number): void {
    if (time < viewport.startTime || time > viewport.endTime) return;

    const { x } = timeFrequencyToCanvas(time, viewport.minFrequency, width, height, viewport);
    context.save();
    context.strokeStyle = 'rgba(255,255,255,0.9)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.restore();
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
