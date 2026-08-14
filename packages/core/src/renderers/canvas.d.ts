export { pickNearestBin, pickNearestFrame } from "../spectrogram-sampling";

import type { PerformanceProfiler } from "../performance";
import type {
  ColorMapConfig,
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
  placeholders?: Array<{
    timeStart: number;
    timeEnd: number;
  }>;
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
export declare class CanvasSpectrogramRenderer implements SpectrogramRenderer {
  readonly kind: "canvas2d";
  private baseFrame;
  invalidate(): void;
  render(input: RenderInput): void;
  renderPlayhead(input: PlayheadRenderInput): boolean;
  renderLoading(input: LoadingRenderInput): void;
  private paintTile;
  private drawPlayhead;
  private paintPlaceholder;
}
//# sourceMappingURL=canvas.d.ts.map
