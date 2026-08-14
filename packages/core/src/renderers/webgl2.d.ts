import type { SpectrogramMatrix, ValueScaleConfig } from "../types";
import {
  type LoadingRenderInput,
  type PlayheadRenderInput,
  type RenderInput,
  type SpectrogramRenderer,
} from "./canvas";
import { type WebGL2RenderProgram } from "./webgl2-program";

export { WEBGL2_DITHER_FRAGMENT_SHADER } from "./webgl2-dither-program";
export { terrainVerticesForTile, tileFrequencyRange } from "./webgl2-geometry";
export {
  WEBGL2_FRAGMENT_SHADER,
  WEBGL2_VERTEX_SHADER,
} from "./webgl2-normal-program";
export { WEBGL2_SOBEL_FRAGMENT_SHADER } from "./webgl2-sobel-program";
export {
  WEBGL2_TERRAIN_FRAGMENT_SHADER,
  WEBGL2_TERRAIN_VERTEX_SHADER,
} from "./webgl2-terrain-program";
export declare class WebGL2SpectrogramRenderer implements SpectrogramRenderer {
  private readonly gl;
  readonly kind: "webgl2";
  private readonly fallback;
  private readonly normalProgram;
  private readonly ditherProgram;
  private readonly sobelProgram;
  private readonly terrainProgram;
  private readonly customProgram;
  private readonly colorMapTexture;
  private readonly tileTextures;
  private colorMapKey;
  private frameState;
  constructor(gl: WebGL2RenderingContext, customProgram?: WebGL2RenderProgram);
  static create(
    canvas: HTMLCanvasElement,
    customProgram?: WebGL2RenderProgram,
  ): WebGL2SpectrogramRenderer | undefined;
  static diagnose(canvas: HTMLCanvasElement): string | undefined;
  invalidate(): void;
  render(input: RenderInput): void;
  renderPlayhead(input: PlayheadRenderInput): boolean;
  renderLoading(input: LoadingRenderInput): void;
  destroy(): void;
  private paint;
  private programFor;
  private renderResources;
  private textureForTile;
  private updateColorMap;
  private throwOnError;
}
export declare function textureValuesForTile(
  tile: SpectrogramMatrix,
  valueScale: Required<ValueScaleConfig>,
): Uint8Array;
//# sourceMappingURL=webgl2.d.ts.map
