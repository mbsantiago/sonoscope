import type { RenderInput } from './canvas';
import { frequencyScaleCode, WebGL2ShaderProgram, type WebGL2Frame, type WebGL2RenderProgram, type WebGL2RenderResources } from './webgl2-program';
import type { SpectrogramMatrix, ValueScaleConfig, ViewportConfig } from '../types';
import { tileFrequencyRange } from './webgl2-geometry';

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
  float framePosition = clamp((time - u_tileTimeRange.x) / max(0.000001, u_tileTimeRange.y - u_tileTimeRange.x) * max(1.0, u_tileSize.x - 1.0), 0.0, max(0.0, u_tileSize.x - 1.0));
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

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.shader = new WebGL2ShaderProgram(gl, WEBGL2_VERTEX_SHADER, WEBGL2_FRAGMENT_SHADER);
    const quadBuffer = gl.createBuffer();
    if (!quadBuffer) throw new Error('Unable to initialize WebGL2 normal renderer resources');
    this.quadBuffer = quadBuffer;
    this.setFullViewportQuad();
  }

  paint(input: RenderInput, frame: WebGL2Frame, resources: WebGL2RenderResources): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0.02, 0.025, 0.035, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.shader.use();
    this.bindAttributes();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, resources.colorMapTexture);
    this.shader.uniform1i('u_colormap', 1);
    this.shader.uniform4f('u_viewport', input.viewport.startTime, input.viewport.endTime, input.viewport.minFrequency, input.viewport.maxFrequency);
    this.shader.uniform2f('u_canvasSize', frame.deviceWidth, frame.deviceHeight);
    this.shader.uniform4f('u_valueScale', input.valueScale.min, input.valueScale.max, input.valueScale.gamma, input.valueScale.clamp ? 1 : 0);
    this.shader.uniform1f('u_frequencyScale', frequencyScaleCode(input.viewport.frequencyScale));

    const placeholderCount = input.placeholders?.length ?? 0;
    for (let index = 0; index < placeholderCount; index++) this.drawPlaceholder();
    for (const tile of input.tiles) this.drawTile(tile, input.valueScale, resources);
    if (input.playheadTime !== undefined) this.drawPlayhead(input.playheadTime, input.viewport, frame.deviceWidth);
  }

  delete(): void {
    this.gl.deleteBuffer(this.quadBuffer);
    this.shader.delete();
  }

  private bindAttributes(): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.enableVertexAttribArray(this.shader.position);
    this.gl.vertexAttribPointer(this.shader.position, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(this.shader.tileUv);
    this.gl.vertexAttribPointer(this.shader.tileUv, 2, this.gl.FLOAT, false, 16, 8);
  }

  private drawTile(tile: SpectrogramMatrix, valueScale: Required<ValueScaleConfig>, resources: WebGL2RenderResources): void {
    if (tile.frameCount === 0 || tile.binCount === 0) return;
    const entry = resources.textureForTile(tile, valueScale);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, entry.texture);
    this.shader.uniform1i('u_tile', 0);
    this.shader.uniform1f('u_overlayMode', 0);
    this.setFullViewportQuad();
    this.shader.uniform2f('u_tileTimeRange', tile.timeStart, tile.timeEnd);
    const frequencyRange = tileFrequencyRange(tile);
    this.shader.uniform2f('u_tileFrequencyRange', frequencyRange.min, frequencyRange.max);
    this.shader.uniform2f('u_tileSize', entry.width, entry.height);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawPlaceholder(): void {
    this.setFullViewportQuad();
    this.shader.uniform1f('u_overlayMode', 1);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawPlayhead(time: number, viewport: ViewportConfig, deviceWidth: number): void {
    if (time < viewport.startTime || time > viewport.endTime) return;
    const x = (time - viewport.startTime) / (viewport.endTime - viewport.startTime);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.shader.uniform1f('u_overlayMode', 2);
    const pixelWidth = 1 / Math.max(1, deviceWidth);
    this.setLineQuad(x, Math.min(1, x + pixelWidth));
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    this.gl.disable(this.gl.BLEND);
  }

  private setFullViewportQuad(): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0]), this.gl.DYNAMIC_DRAW);
  }

  private setLineQuad(start: number, end: number): void {
    const left = start * 2 - 1;
    const right = end * 2 - 1;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([left, -1, 0, 1, right, -1, 1, 1, left, 1, 0, 0, right, 1, 1, 0]), this.gl.DYNAMIC_DRAW);
  }
}
