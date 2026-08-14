import type { SpectrogramMatrix, ValueScaleConfig } from "../types";
import type { RenderInput } from "./canvas";
export declare const WEBGL2_UNIFORMS: readonly [
  "u_tile",
  "u_colormap",
  "u_viewport",
  "u_tileTimeRange",
  "u_tileFrequencyRange",
  "u_tileSize",
  "u_canvasSize",
  "u_valueScale",
  "u_frequencyScale",
  "u_overlayMode",
  "u_terrainHeight",
  "u_terrainPlayhead",
  "u_terrainTimeRange",
];
export type UniformName = (typeof WEBGL2_UNIFORMS)[number];
export type TextureEntry = {
  texture: WebGLTexture;
  width: number;
  height: number;
};
export type WebGL2Frame = {
  width: number;
  height: number;
  dpr: number;
  deviceWidth: number;
  deviceHeight: number;
};
export type WebGL2RenderResources = {
  colorMapTexture: WebGLTexture;
  tiles: SpectrogramMatrix[];
  textureForTile(
    tile: SpectrogramMatrix,
    valueScale: Required<ValueScaleConfig>,
  ): TextureEntry;
};
export type WebGL2RenderProgram = {
  readonly shader: WebGL2ShaderProgram;
  paint(
    input: RenderInput,
    frame: WebGL2Frame,
    resources: WebGL2RenderResources,
  ): void;
  delete(): void;
};
export declare class WebGL2ShaderProgram {
  private readonly gl;
  readonly program: WebGLProgram;
  readonly position: number;
  readonly tileUv: number;
  private readonly uniforms;
  constructor(
    gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
  );
  use(): void;
  delete(): void;
  uniform1i(name: UniformName, value: number): void;
  uniform1f(name: UniformName, value: number): void;
  uniform2f(name: UniformName, x: number, y: number): void;
  uniform4f(
    name: UniformName,
    x: number,
    y: number,
    z: number,
    w: number,
  ): void;
}
export declare function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader;
export declare function numberedSource(source: string): string;
export declare function frequencyScaleCode(
  scale: RenderInput["viewport"]["frequencyScale"],
): number;
//# sourceMappingURL=webgl2-program.d.ts.map
