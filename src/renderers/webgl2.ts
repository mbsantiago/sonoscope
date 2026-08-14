import { buildColorMap } from "../colormap";
import { valueDataForMode } from "../spectrogram-sampling";
import type {
  ColorMapConfig,
  SpectrogramMatrix,
  ValueScaleConfig,
  ViewportConfig,
} from "../types";
import { valueScaleBounds } from "../value-scale";
import {
  CanvasSpectrogramRenderer,
  type LoadingRenderInput,
  type PlayheadRenderInput,
  type RenderInput,
  type SpectrogramRenderer,
} from "./canvas";
import {
  DitherSpectrogramProgram,
  WEBGL2_DITHER_FRAGMENT_SHADER,
} from "./webgl2-dither-program";
import {
  NormalSpectrogramProgram,
  WEBGL2_FRAGMENT_SHADER,
  WEBGL2_VERTEX_SHADER,
} from "./webgl2-normal-program";
import {
  numberedSource,
  type TextureEntry,
  type WebGL2Frame,
  type WebGL2RenderProgram,
  type WebGL2RenderResources,
} from "./webgl2-program";
import {
  SobelSpectrogramProgram,
  WEBGL2_SOBEL_FRAGMENT_SHADER,
} from "./webgl2-sobel-program";
import {
  TerrainSpectrogramProgram,
  WEBGL2_TERRAIN_FRAGMENT_SHADER,
  WEBGL2_TERRAIN_VERTEX_SHADER,
} from "./webgl2-terrain-program";

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

type FrameState = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  dpr: number;
  deviceWidth: number;
  deviceHeight: number;
  viewport: ViewportConfig;
  input: RenderInput;
};

export class WebGL2SpectrogramRenderer implements SpectrogramRenderer {
  readonly kind = "webgl2" as const;
  private readonly fallback = new CanvasSpectrogramRenderer();
  private readonly normalProgram: WebGL2RenderProgram;
  private readonly ditherProgram: WebGL2RenderProgram;
  private readonly sobelProgram: WebGL2RenderProgram;
  private readonly terrainProgram: WebGL2RenderProgram;
  private readonly customProgram: WebGL2RenderProgram | undefined;
  private readonly colorMapTexture: WebGLTexture;
  private readonly tileTextures = new Map<string, TextureEntry>();
  private colorMapKey = "";
  private frameState: FrameState | undefined;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    customProgram?: WebGL2RenderProgram,
  ) {
    this.normalProgram = new NormalSpectrogramProgram(gl);
    this.ditherProgram = new DitherSpectrogramProgram(gl);
    this.sobelProgram = new SobelSpectrogramProgram(gl);
    this.terrainProgram = new TerrainSpectrogramProgram(gl);
    this.customProgram = customProgram;
    const colorMapTexture = gl.createTexture();
    if (!colorMapTexture)
      throw new Error("Unable to initialize WebGL2 renderer resources");
    this.colorMapTexture = colorMapTexture;
  }

  static create(
    canvas: HTMLCanvasElement,
    customProgram?: WebGL2RenderProgram,
  ): WebGL2SpectrogramRenderer | undefined {
    const gl = canvas.getContext("webgl2");
    return gl && isUsableWebGL2Context(gl)
      ? new WebGL2SpectrogramRenderer(gl, customProgram)
      : undefined;
  }

  static diagnose(canvas: HTMLCanvasElement): string | undefined {
    const gl = canvas.getContext("webgl2");
    if (!gl) return 'canvas.getContext("webgl2") returned null';
    if (!isUsableWebGL2Context(gl))
      return 'canvas.getContext("webgl2") did not return a usable WebGL2RenderingContext';
    return (
      compileShaderDiagnostic(gl, gl.VERTEX_SHADER, WEBGL2_VERTEX_SHADER) ??
      compileShaderDiagnostic(gl, gl.FRAGMENT_SHADER, WEBGL2_FRAGMENT_SHADER) ??
      compileShaderDiagnostic(
        gl,
        gl.FRAGMENT_SHADER,
        WEBGL2_DITHER_FRAGMENT_SHADER,
      ) ??
      compileShaderDiagnostic(
        gl,
        gl.FRAGMENT_SHADER,
        WEBGL2_SOBEL_FRAGMENT_SHADER,
      ) ??
      compileShaderDiagnostic(
        gl,
        gl.VERTEX_SHADER,
        WEBGL2_TERRAIN_VERTEX_SHADER,
      ) ??
      compileShaderDiagnostic(
        gl,
        gl.FRAGMENT_SHADER,
        WEBGL2_TERRAIN_FRAGMENT_SHADER,
      )
    );
  }

  invalidate(): void {
    this.fallback.invalidate();
    this.frameState = undefined;
    for (const entry of this.tileTextures.values())
      this.gl.deleteTexture(entry.texture);
    this.tileTextures.clear();
  }

  render(input: RenderInput): void {
    if (this.gl.isContextLost()) {
      this.fallback.render(input);
      return;
    }
    const paint = () => this.paint(input, this.programFor(input));
    if (input.profile) {
      input.profile.measure(
        "renderer.paint",
        { tiles: input.tiles.length, renderer: this.kind },
        paint,
      );
      return;
    }
    paint();
  }

  renderPlayhead(input: PlayheadRenderInput): boolean {
    if (this.gl.isContextLost()) {
      return this.fallback.renderPlayhead(input);
    }
    const frame = this.frameState;
    if (
      !frame ||
      frame.canvas !== input.canvas ||
      !sameViewport(frame.viewport, input.viewport)
    )
      return false;
    const size = canvasSize(input.canvas);
    if (
      frame.width !== size.width ||
      frame.height !== size.height ||
      frame.dpr !== size.dpr ||
      frame.deviceWidth !== size.deviceWidth ||
      frame.deviceHeight !== size.deviceHeight
    )
      return false;
    this.paint(
      { ...frame.input, playheadTime: input.playheadTime },
      this.programFor(frame.input),
    );
    return true;
  }

  renderLoading(input: LoadingRenderInput): void {
    if (this.gl.isContextLost()) {
      this.fallback.renderLoading(input);
      return;
    }
    this.frameState = undefined;
    const gl = this.gl;
    const { deviceWidth, deviceHeight } = canvasSize(input.canvas);
    input.canvas.width = deviceWidth;
    input.canvas.height = deviceHeight;
    gl.viewport(0, 0, deviceWidth, deviceHeight);
    gl.clearColor(0.06, 0.09, 0.16, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  destroy(): void {
    this.invalidate();
    this.gl.deleteTexture(this.colorMapTexture);
    this.normalProgram.delete();
    this.ditherProgram.delete();
    this.sobelProgram.delete();
    this.terrainProgram.delete();
    this.customProgram?.delete();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  private paint(input: RenderInput, program: WebGL2RenderProgram): void {
    const frame = canvasSize(input.canvas);
    input.canvas.width = frame.deviceWidth;
    input.canvas.height = frame.deviceHeight;

    this.updateColorMap(input.colorMap);
    this.gl.viewport(0, 0, frame.deviceWidth, frame.deviceHeight);
    program.paint(input, frame, this.renderResources(input));
    this.throwOnError("render");
    const { profile: _profile, ...frameInput } = input;
    this.frameState = {
      canvas: input.canvas,
      width: frame.width,
      height: frame.height,
      dpr: frame.dpr,
      deviceWidth: frame.deviceWidth,
      deviceHeight: frame.deviceHeight,
      viewport: { ...input.viewport },
      input: {
        ...frameInput,
        tiles: [...input.tiles],
        placeholders: [...(input.placeholders ?? [])],
      },
    };
  }

  private programFor(input: RenderInput): WebGL2RenderProgram {
    if (typeof input.webglProgram === "object") return input.webglProgram;
    if (input.webglProgram === "terrain") return this.terrainProgram;
    if (input.webglProgram === "sobel") return this.sobelProgram;
    if (input.webglProgram === "dither") return this.ditherProgram;
    if (input.webglProgram === "normal") return this.normalProgram;
    if (this.customProgram) return this.customProgram;
    return this.normalProgram;
  }

  private renderResources(input: RenderInput): WebGL2RenderResources {
    return {
      colorMapTexture: this.colorMapTexture,
      tiles: input.tiles,
      textureForTile: (tile, valueScale) =>
        this.textureForTile(tile, valueScale),
    };
  }

  private textureForTile(
    tile: SpectrogramMatrix,
    valueScale: Required<ValueScaleConfig>,
  ): TextureEntry {
    const key = `${tile.channel}:${tile.timeStart}:${tile.timeEnd}:${valueScale.mode}:${valueScale.min}:${valueScale.max}:${valueScale.gamma}:${valueScale.clamp}`;
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

function isUsableWebGL2Context(context: WebGL2RenderingContext): boolean {
  return (
    typeof context.createShader === "function" &&
    typeof context.createProgram === "function" &&
    typeof context.texImage2D === "function"
  );
}

function canvasSize(canvas: HTMLCanvasElement): WebGL2Frame {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || canvas.width || 1));
  const height = Math.max(1, Math.round(rect.height || canvas.height || 1));
  const dpr = globalThis.devicePixelRatio || 1;
  return {
    width,
    height,
    dpr,
    deviceWidth: Math.max(1, Math.round(width * dpr)),
    deviceHeight: Math.max(1, Math.round(height * dpr)),
  };
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

function compileShaderDiagnostic(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): string | undefined {
  const shader = gl.createShader(type);
  const kind =
    type === gl.VERTEX_SHADER
      ? "vertex"
      : type === gl.FRAGMENT_SHADER
        ? "fragment"
        : "unknown";
  if (!shader) return `Unable to create WebGL2 ${kind} shader`;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean;
  const log = gl.getShaderInfoLog(shader)?.trim() || "unknown shader error";
  gl.deleteShader(shader);
  return ok
    ? undefined
    : `Unable to compile WebGL2 ${kind} shader: ${log}\n${numberedSource(source)}`;
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
