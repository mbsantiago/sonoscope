import type { FrequencyScale } from "../../../types";
import { createProgram } from "../../shared/webgl2-compile";
export { numberedSource } from "../../shared/webgl2-compile";
import type { SpectrogramMatrix, ValueScaleConfig } from "../types";
import type { RenderInput } from "./canvas";

const WEBGL2_UNIFORMS = [
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
  // Halftone shader parameters
  "u_dotFrequency",
  "u_minEnergyThreshold",
  "u_energyGamma",
] as const;
type UniformName = (typeof WEBGL2_UNIFORMS)[number];

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

export class WebGL2ShaderProgram {
  readonly program: WebGLProgram;
  readonly position: number;
  readonly tileUv: number;
  private readonly uniforms: Partial<Record<UniformName, WebGLUniformLocation>>;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
  ) {
    const program = createProgram(
      gl,
      vertexSource,
      fragmentSource,
      "spectrogram",
    );
    this.program = program;
    this.position = gl.getAttribLocation(program, "a_position");
    this.tileUv = gl.getAttribLocation(program, "a_tileUv");
    this.uniforms = Object.fromEntries(
      WEBGL2_UNIFORMS.flatMap((name) => {
        const location = gl.getUniformLocation(program, name);
        if (!location) return [];
        return [[name, location]];
      }),
    ) as WebGL2ShaderProgram["uniforms"];
  }

  use(): void {
    this.gl.useProgram(this.program);
  }

  delete(): void {
    this.gl.deleteProgram(this.program);
  }

  uniform1i(name: UniformName, value: number): void {
    const location = this.uniforms[name];
    if (location) this.gl.uniform1i(location, value);
  }

  uniform1f(name: UniformName, value: number): void {
    const location = this.uniforms[name];
    if (location) this.gl.uniform1f(location, value);
  }

  uniform2f(name: UniformName, x: number, y: number): void {
    const location = this.uniforms[name];
    if (location) this.gl.uniform2f(location, x, y);
  }

  uniform4f(
    name: UniformName,
    x: number,
    y: number,
    z: number,
    w: number,
  ): void {
    const location = this.uniforms[name];
    if (location) this.gl.uniform4f(location, x, y, z, w);
  }
}

export function frequencyScaleCode(scale: FrequencyScale | undefined): number {
  if (scale === "log") return 1;
  if (scale === "mel") return 2;
  return 0;
}
