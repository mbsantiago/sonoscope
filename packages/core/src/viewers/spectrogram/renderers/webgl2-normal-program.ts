import type { SpectrogramMatrix, ValueScaleConfig } from "../types";
import type { RenderInput } from "./canvas";
import { valueScaleBounds } from "../value-scale";
import { tileFrequencyRange } from "./webgl2-geometry";
import {
  frequencyScaleCode,
  type WebGL2Frame,
  type WebGL2RenderProgram,
  type WebGL2RenderResources,
  WebGL2ShaderProgram,
} from "./webgl2-program";

export const WEBGL2_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_tileUv;
out vec2 v_globalUv;
out vec2 v_tileUv;
void main() {
  v_globalUv = a_position * 0.5 + 0.5;
  v_tileUv = a_tileUv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const WEBGL2_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_globalUv;
in vec2 v_tileUv;
out vec4 outColor;

uniform sampler2D u_tile;
uniform sampler2D u_colormap;
uniform vec4 u_viewport;
uniform vec2 u_tileTimeRange;
uniform vec2 u_tileFrequencyRange;
uniform vec2 u_tileSize;
uniform vec2 u_canvasSize;
uniform vec4 u_valueScale;
uniform float u_frequencyScale;
uniform float u_overlayMode;

float hzToMel(float hz) { return 1127.01048 * log(1.0 + hz / 700.0); }
float melToHz(float mel) { return 700.0 * (pow(10.0, mel / 2595.0) - 1.0); }
float hzToScale(float hz, float scale) {
  if (scale == 1.0) return log(max(1.0, hz)) / log(10.0);
  if (scale == 2.0) return hzToMel(hz);
  return hz;
}
float scaleToHz(float value, float scale) {
  if (scale == 1.0) return pow(10.0, value);
  if (scale == 2.0) return melToHz(value);
  return value;
}

void main() {
  if (u_overlayMode == 1.0) {
    float hatch = step(0.84, fract((gl_FragCoord.x + gl_FragCoord.y) / 12.0));
    outColor = mix(vec4(0.059, 0.09, 0.165, 1.0), vec4(0.278, 0.333, 0.412, 1.0), hatch);
    return;
  }

  if (u_overlayMode == 2.0) {
    outColor = vec4(1.0, 1.0, 1.0, 0.9);
    return;
  }

  float globalX = gl_FragCoord.x / max(1.0, u_canvasSize.x);
  float canvasY = 1.0 - gl_FragCoord.y / max(1.0, u_canvasSize.y);
  float time = mix(u_viewport.x, u_viewport.y, globalX);
  if (time < u_tileTimeRange.x || time > u_tileTimeRange.y) discard;
  float minScale = hzToScale(u_viewport.z, u_frequencyScale);
  float maxScale = hzToScale(u_viewport.w, u_frequencyScale);
  float frequency = scaleToHz(mix(maxScale, minScale, canvasY), u_frequencyScale);
  float frequencyStep = (u_tileFrequencyRange.y - u_tileFrequencyRange.x) / max(1.0, u_tileSize.y - 1.0);
  if (frequency > u_tileFrequencyRange.x && frequency <= u_tileFrequencyRange.x + frequencyStep * 0.5 + 0.000001) {
    outColor = texture(u_colormap, vec2(0.0, 0.5));
    return;
  }
  float hopDuration = (u_tileTimeRange.y - u_tileTimeRange.x) / max(1.0, u_tileSize.x);
  float framePosition = clamp((time - u_tileTimeRange.x) / max(0.000001, hopDuration), 0.0, max(0.0, u_tileSize.x - 1.0));
  float binPosition = clamp((frequency - u_tileFrequencyRange.x) / max(0.000001, u_tileFrequencyRange.y - u_tileFrequencyRange.x) * max(1.0, u_tileSize.y - 1.0), 0.0, max(0.0, u_tileSize.y - 1.0));
  int frame0 = int(floor(framePosition));
  int frame1 = int(ceil(framePosition));
  int bin0 = int(floor(binPosition));
  int bin1 = int(ceil(binPosition));
  float frameFraction = fract(framePosition);
  float binFraction = fract(binPosition);
  float low0 = texelFetch(u_tile, ivec2(frame0, bin0), 0).r;
  float low1 = texelFetch(u_tile, ivec2(frame1, bin0), 0).r;
  float high0 = texelFetch(u_tile, ivec2(frame0, bin1), 0).r;
  float high1 = texelFetch(u_tile, ivec2(frame1, bin1), 0).r;
  float normalized = mix(mix(low0, low1, frameFraction), mix(high0, high1, frameFraction), binFraction);
  outColor = texture(u_colormap, vec2(clamp(normalized, 0.0, 1.0), 0.5));
}`;

export class NormalSpectrogramProgram implements WebGL2RenderProgram {
  readonly shader: WebGL2ShaderProgram;
  private readonly quadBuffer: WebGLBuffer;
  private readonly vao: WebGLVertexArrayObject | null;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    fragmentShader = WEBGL2_FRAGMENT_SHADER,
  ) {
    this.shader = new WebGL2ShaderProgram(
      gl,
      WEBGL2_VERTEX_SHADER,
      fragmentShader,
    );
    const quadBuffer = gl.createBuffer();
    if (!quadBuffer)
      throw new Error("Unable to initialize WebGL2 normal renderer resources");
    this.quadBuffer = quadBuffer;

    this.vao =
      typeof gl.createVertexArray === "function"
        ? gl.createVertexArray()
        : null;

    this.setFullViewportQuad();
    if (this.vao) {
      this.setupVao();
    }
  }

  paint(
    input: RenderInput,
    frame: WebGL2Frame,
    resources: WebGL2RenderResources,
  ): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0.02, 0.025, 0.035, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.shader.use();
    if (this.vao) {
      gl.bindVertexArray(this.vao);
    } else {
      this.bindAttributes();
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, resources.colorMapTexture);
    this.shader.uniform1i("u_colormap", 1);
    this.shader.uniform4f(
      "u_viewport",
      input.viewport.startTime,
      input.viewport.endTime,
      input.viewport.minFrequency ?? 0,
      input.viewport.maxFrequency ?? 24000,
    );
    this.shader.uniform2f(
      "u_canvasSize",
      frame.deviceWidth,
      frame.deviceHeight,
    );
    const bounds = valueScaleBounds(input.valueScale);
    this.shader.uniform4f(
      "u_valueScale",
      bounds.min,
      bounds.max,
      input.valueScale.gamma,
      input.valueScale.clamp ? 1 : 0,
    );
    this.shader.uniform1f(
      "u_frequencyScale",
      frequencyScaleCode(input.frequencyScale),
    );

    this.setCustomUniforms(input);

    const placeholderCount = input.placeholders?.length ?? 0;
    for (let index = 0; index < placeholderCount; index++)
      this.drawPlaceholder();
    for (const tile of input.tiles)
      this.drawTile(tile, input.valueScale, resources);
    if (this.vao) {
      gl.bindVertexArray(null);
    }
  }

  protected setCustomUniforms(_input: RenderInput): void {}

  delete(): void {
    if (this.vao) {
      this.gl.deleteVertexArray(this.vao);
    }
    this.gl.deleteBuffer(this.quadBuffer);
    this.shader.delete();
  }

  private setupVao(): void {
    if (!this.vao) return;
    this.gl.bindVertexArray(this.vao);
    this.bindAttributes();
    this.gl.bindVertexArray(null);
  }

  private bindAttributes(): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    if (this.shader.position >= 0) {
      this.gl.enableVertexAttribArray(this.shader.position);
      this.gl.vertexAttribPointer(
        this.shader.position,
        2,
        this.gl.FLOAT,
        false,
        16,
        0,
      );
    }
    if (this.shader.tileUv >= 0) {
      this.gl.enableVertexAttribArray(this.shader.tileUv);
      this.gl.vertexAttribPointer(
        this.shader.tileUv,
        2,
        this.gl.FLOAT,
        false,
        16,
        8,
      );
    }
  }

  private drawTile(
    tile: SpectrogramMatrix,
    valueScale: Required<ValueScaleConfig>,
    resources: WebGL2RenderResources,
  ): void {
    if (tile.frameCount === 0 || tile.binCount === 0) return;
    const entry = resources.textureForTile(tile, valueScale);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, entry.texture);
    this.shader.uniform1i("u_tile", 0);
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
    this.shader.uniform2f("u_tileTimeRange", tileStartTime, tileEndTime);
    const range = tileFrequencyRange(tile);
    this.shader.uniform2f("u_tileFrequencyRange", range.min, range.max);
    this.shader.uniform2f("u_tileSize", entry.width, entry.height);
    this.shader.uniform1f("u_overlayMode", 0);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawPlaceholder(): void {
    this.shader.uniform1f("u_overlayMode", 1);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  private setFullViewportQuad(): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]),
      this.gl.STATIC_DRAW,
    );
  }
}
