import type { ColorMapConfig } from "../../../types";
import type { SpectrogramMatrix, ValueScaleConfig } from "../types";
import type { RenderInput, SpectrogramRenderer } from "./canvas";
import type {
  TextureEntry,
  WebGL2Frame,
  WebGL2RenderProgram,
  WebGL2RenderResources,
} from "./webgl2-program";
import { buildColorMap } from "../../../colormap";
import {
  compileShader,
  isUsableWebGL2Context,
} from "../../shared/webgl2-compile";
import { valueDataForMode } from "../spectrogram-sampling";
import { valueScaleBounds } from "../value-scale";
import {
  WEBGL2_FRAGMENT_SHADER,
  WEBGL2_VERTEX_SHADER,
} from "./webgl2-normal-program";

export class WebGL2SpectrogramRenderer implements SpectrogramRenderer {
  readonly kind = "webgl2" as const;
  private program: WebGL2RenderProgram | undefined;
  private readonly colorMapTexture: WebGLTexture;
  private readonly tileTextures = new Map<string, TextureEntry>();
  private readonly matrixIds = new WeakMap<SpectrogramMatrix, number>();
  private nextMatrixId = 1;
  private colorMapKey = "";

  constructor(
    private readonly gl: WebGL2RenderingContext,
    program: WebGL2RenderProgram,
  ) {
    this.program = program;
    const colorMapTexture = gl.createTexture();
    if (!colorMapTexture)
      throw new Error("Unable to initialize WebGL2 renderer resources");
    this.colorMapTexture = colorMapTexture;
  }

  static create(
    canvas: HTMLCanvasElement,
    program: WebGL2RenderProgram,
  ): WebGL2SpectrogramRenderer | undefined {
    const gl = canvas.getContext("webgl2");
    return gl && isUsableWebGL2Context(gl)
      ? new WebGL2SpectrogramRenderer(gl, program)
      : undefined;
  }

  static diagnose(canvas: HTMLCanvasElement): string | undefined {
    const gl = canvas.getContext("webgl2");
    if (!gl) return 'canvas.getContext("webgl2") returned null';
    if (!isUsableWebGL2Context(gl))
      return 'canvas.getContext("webgl2") did not return a usable WebGL2RenderingContext';
    return (
      compileShaderDiagnostic(gl, gl.VERTEX_SHADER, WEBGL2_VERTEX_SHADER) ??
      compileShaderDiagnostic(gl, gl.FRAGMENT_SHADER, WEBGL2_FRAGMENT_SHADER)
    );
  }

  invalidate(): void {
    for (const entry of this.tileTextures.values())
      this.gl.deleteTexture(entry.texture);
    this.tileTextures.clear();
  }

  /**
   * Swaps the active shader program in place, preserving cached GPU tile
   * textures. The renderer takes ownership of the program it is given and
   * disposes it when replaced or destroyed.
   */
  setProgram(program: WebGL2RenderProgram): void {
    if (this.program === program) return;
    this.program?.delete();
    this.program = program;
  }

  render(input: RenderInput): void {
    if (this.gl.isContextLost()) {
      throw new Error(
        "WebGL2 context is lost; create a new renderer to recover",
      );
    }
    this.paint(input, this.programFor(input));
  }

  destroy(): void {
    this.invalidate();
    this.gl.deleteTexture(this.colorMapTexture);
    this.program?.delete();
    this.program = undefined;
  }

  private paint(input: RenderInput, program: WebGL2RenderProgram): void {
    const frame = canvasSize(input.canvas);

    this.updateColorMap(input.colorMap);
    this.gl.viewport(0, 0, frame.deviceWidth, frame.deviceHeight);
    program.paint(input, frame, this.renderResources(input));
    this.throwOnError("render");
  }

  private programFor(input: RenderInput): WebGL2RenderProgram {
    return input.webglProgram ?? this.requireProgram();
  }

  private requireProgram(): WebGL2RenderProgram {
    if (!this.program) {
      throw new Error("WebGL2 renderer has been destroyed");
    }
    return this.program;
  }

  private renderResources(input: RenderInput): WebGL2RenderResources {
    return {
      colorMapTexture: this.colorMapTexture,
      tiles: input.tiles,
      textureForTile: (tile, valueScale) =>
        this.textureForTile(tile, valueScale),
    };
  }

  private matrixId(tile: SpectrogramMatrix): number {
    let id = this.matrixIds.get(tile);
    if (id === undefined) {
      id = this.nextMatrixId++;
      this.matrixIds.set(tile, id);
    }
    return id;
  }

  private textureForTile(
    tile: SpectrogramMatrix,
    valueScale: Required<ValueScaleConfig>,
  ): TextureEntry {
    const key = `${this.matrixId(tile)}:${valueScale.mode}:${valueScale.min}:${valueScale.max}:${valueScale.gamma}:${valueScale.clamp}`;
    const existing = this.tileTextures.get(key);
    if (existing) return existing;

    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Unable to create WebGL2 tile texture");
    const width = Math.max(1, tile.frameCount);
    const height = Math.max(1, tile.binCount);
    const values =
      tile.frameCount > 0 && tile.binCount > 0
        ? textureValuesForTile(tile, valueScale)
        : new Uint8Array(4);
    const activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      values,
    );
    this.throwOnError("tile texture upload");
    gl.activeTexture(activeTexture);
    const entry = { texture, width, height };
    this.tileTextures.set(key, entry);
    return entry;
  }

  private updateColorMap(config: ColorMapConfig): void {
    const key = JSON.stringify(config);
    if (key === this.colorMapKey) return;
    this.colorMapKey = key;
    const data = new Uint8Array(buildColorMap(config).flat());
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.colorMapTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
  }

  private throwOnError(phase: string): void {
    const error = this.gl.getError();
    if (error !== this.gl.NO_ERROR)
      throw new Error(
        `WebGL2 renderer ${phase} failed with GL error 0x${error.toString(16)}`,
      );
  }
}

function canvasSize(canvas: HTMLCanvasElement): WebGL2Frame {
  const width = Math.max(1, canvas.width || 1);
  const height = Math.max(1, canvas.height || 1);
  return {
    width,
    height,
    dpr: 1,
    deviceWidth: width,
    deviceHeight: height,
  };
}

function compileShaderDiagnostic(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): string | undefined {
  try {
    const shader = compileShader(gl, type, source, "spectrogram");
    gl.deleteShader(shader);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function textureValuesForTile(
  tile: SpectrogramMatrix,
  valueScale: Required<ValueScaleConfig>,
): Uint8Array {
  if (tile.frameCount === 0 || tile.binCount === 0) return new Uint8Array(4);
  const source = valueDataForMode(tile, valueScale.mode).values;
  const values = new Uint8Array(tile.frameCount * tile.binCount * 4);
  for (let frame = 0; frame < tile.frameCount; frame++) {
    for (let bin = 0; bin < tile.binCount; bin++) {
      const index = (bin * tile.frameCount + frame) * 4;
      const normalized = normalizedByte(
        source[frame * tile.binCount + bin]!,
        valueScale,
      );
      values[index] = normalized;
      values[index + 1] = normalized;
      values[index + 2] = normalized;
      values[index + 3] = 255;
    }
  }
  return values;
}

function normalizedByte(
  value: number,
  valueScale: Required<ValueScaleConfig>,
): number {
  const { min, max } = valueScaleBounds(valueScale);
  let normalized = (value - min) / (max - min || 1);
  if (valueScale.clamp) normalized = Math.max(0, Math.min(1, normalized));
  normalized = Math.max(0, normalized) ** valueScale.gamma;
  return Math.max(0, Math.min(255, Math.round(normalized * 255)));
}
