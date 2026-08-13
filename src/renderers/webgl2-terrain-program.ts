/**
 * Hidden terrain spectrogram program.
 *
 * Visual treatment inspired by Chrome Music Lab's 3D sonogram shaders:
 * https://github.com/googlecreativelab/chrome-music-lab/tree/master/spectrogram/src/bin/shaders
 * Chrome Music Lab is Copyright 2016 Google Inc. and licensed under Apache-2.0.
 * This shader is an original WebGL2 implementation adapted to espectro's tile texture layout.
 */
import type { RenderInput } from './canvas';
import { frequencyScaleCode, WebGL2ShaderProgram, type WebGL2Frame, type WebGL2RenderProgram, type WebGL2RenderResources } from './webgl2-program';
import type { SpectrogramMatrix, ValueScaleConfig } from '../types';
import { terrainVerticesForTile } from './webgl2-geometry';

export const WEBGL2_TERRAIN_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_tileUv;
out float v_viewportX;
out vec2 v_tileUv;
out float v_height;

uniform sampler2D u_tile;
uniform vec2 u_tileTimeRange;
uniform vec2 u_terrainTimeRange;
uniform vec2 u_tileFrequencyRange;
uniform vec2 u_canvasSize;
uniform vec4 u_viewport;
uniform float u_frequencyScale;
uniform float u_terrainHeight;
uniform float u_terrainPlayhead;

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
  float minScale = hzToScale(u_viewport.z, u_frequencyScale);
  float maxScale = hzToScale(u_viewport.w, u_frequencyScale);
  float frequency = scaleToHz(mix(minScale, maxScale, a_tileUv.y), u_frequencyScale);
  float frequencyUv = clamp((frequency - u_tileFrequencyRange.x) / max(0.000001, u_tileFrequencyRange.y - u_tileFrequencyRange.x), 0.0, 1.0);
  v_tileUv = vec2(a_tileUv.x, frequencyUv);
  float heightValue = texture(u_tile, v_tileUv).r;
  v_height = heightValue;
  float tileTime = mix(u_tileTimeRange.x, u_tileTimeRange.y, a_tileUv.x);
  float viewportX = clamp((tileTime - u_terrainTimeRange.x) / max(0.000001, u_terrainTimeRange.y - u_terrainTimeRange.x), 0.0, 1.0);
  v_viewportX = viewportX;
  vec2 terrain = vec2(viewportX * 2.0 - 1.0, a_tileUv.y * 2.0 - 1.0);
  float liftedHeight = pow(heightValue, 0.72) * u_terrainHeight;
  float viewX = terrain.x * 0.96;
  float playheadLift = u_terrainPlayhead == 1.0 ? 0.012 : 0.0;
  float viewY = terrain.y * 0.76 + liftedHeight * 0.42 + playheadLift;
  gl_Position = vec4(viewX, viewY - 0.01, -heightValue * 0.03 - playheadLift, 1.0);
}`;

export const WEBGL2_TERRAIN_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in float v_viewportX;
in vec2 v_tileUv;
in float v_height;
out vec4 outColor;

uniform sampler2D u_tile;
uniform sampler2D u_colormap;
uniform vec2 u_tileSize;
uniform float u_terrainPlayhead;

void main() {
  vec2 stepSize = 1.0 / max(vec2(1.0), u_tileSize - 1.0);
  float left = texture(u_tile, clamp(v_tileUv - vec2(stepSize.x, 0.0), 0.0, 1.0)).r;
  float right = texture(u_tile, clamp(v_tileUv + vec2(stepSize.x, 0.0), 0.0, 1.0)).r;
  float low = texture(u_tile, clamp(v_tileUv - vec2(0.0, stepSize.y), 0.0, 1.0)).r;
  float high = texture(u_tile, clamp(v_tileUv + vec2(0.0, stepSize.y), 0.0, 1.0)).r;
  vec3 normal = normalize(vec3((left - right) * 1.8, (low - high) * 1.8, 0.6));
  vec3 localLight = normalize(vec3(-0.35, -0.55, 0.9));
  float light = clamp(dot(normal, localLight), 0.0, 1.0);
  float contour = smoothstep(0.015, 0.0, abs(fract(v_height * 18.0) - 0.5));
  float ridge = smoothstep(0.965, 1.0, fract(v_tileUv.y * u_tileSize.y));
  float edgeFade = smoothstep(0.0, 0.16, v_viewportX) * smoothstep(1.0, 0.84, v_viewportX);
  if (u_terrainPlayhead == 1.0) {
    outColor = vec4(vec3(1.0), 0.98);
    return;
  }
  vec3 baseColor = texture(u_colormap, vec2(clamp(v_height, 0.0, 1.0), 0.5)).rgb;
  vec3 color = baseColor * (0.48 + light * 0.5) + vec3(contour * 0.18 + ridge * 0.1);
  outColor = vec4(clamp(color * mix(0.18, 1.0, edgeFade), 0.0, 1.0), 1.0);
}`;

export class TerrainSpectrogramProgram implements WebGL2RenderProgram {
  readonly shader: WebGL2ShaderProgram;
  private readonly terrainBuffer: WebGLBuffer;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.shader = new WebGL2ShaderProgram(gl, WEBGL2_TERRAIN_VERTEX_SHADER, WEBGL2_TERRAIN_FRAGMENT_SHADER);
    const terrainBuffer = gl.createBuffer();
    if (!terrainBuffer) throw new Error('Unable to initialize WebGL2 terrain renderer resources');
    this.terrainBuffer = terrainBuffer;
  }

  paint(input: RenderInput, frame: WebGL2Frame, resources: WebGL2RenderResources): void {
    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.shader.use();
    this.bindAttributes();
    this.shader.uniform4f('u_viewport', input.viewport.startTime, input.viewport.endTime, input.viewport.minFrequency, input.viewport.maxFrequency);
    this.shader.uniform2f('u_terrainTimeRange', input.viewport.startTime, input.viewport.endTime);
    this.shader.uniform2f('u_canvasSize', frame.deviceWidth, frame.deviceHeight);
    this.shader.uniform1f('u_frequencyScale', frequencyScaleCode(input.viewport.frequencyScale));
    this.shader.uniform1f('u_terrainHeight', 0.34);
    this.shader.uniform1f('u_terrainPlayhead', 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, resources.colorMapTexture);
    this.shader.uniform1i('u_colormap', 1);
    for (const tile of input.tiles) this.drawTile(tile, input.valueScale, resources);
    if (input.playheadTime !== undefined) this.drawPlayhead(input.playheadTime, input.valueScale, resources);
    gl.disable(gl.DEPTH_TEST);
  }

  delete(): void {
    this.gl.deleteBuffer(this.terrainBuffer);
    this.shader.delete();
  }

  private bindAttributes(): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.terrainBuffer);
    if (this.shader.position >= 0) {
      this.gl.enableVertexAttribArray(this.shader.position);
      this.gl.vertexAttribPointer(this.shader.position, 2, this.gl.FLOAT, false, 16, 0);
    }
    if (this.shader.tileUv >= 0) {
      this.gl.enableVertexAttribArray(this.shader.tileUv);
      this.gl.vertexAttribPointer(this.shader.tileUv, 2, this.gl.FLOAT, false, 16, 8);
    }
  }

  private drawTile(tile: SpectrogramMatrix, valueScale: Required<ValueScaleConfig>, resources: WebGL2RenderResources): void {
    if (tile.frameCount < 2 || tile.binCount < 2) return;
    const entry = resources.textureForTile(tile, valueScale);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, entry.texture);
    this.shader.uniform1i('u_tile', 0);
    this.shader.uniform2f('u_tileTimeRange', tile.timeStart, tile.timeEnd);
    this.shader.uniform2f('u_tileFrequencyRange', tile.frequencies[0] ?? 0, tile.frequencies[tile.frequencies.length - 1] ?? Math.max(1, tile.sampleRate / 2));
    this.shader.uniform2f('u_tileSize', entry.width, entry.height);
    const vertices = terrainVerticesForTile(tile, 96, 96);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.terrainBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, vertices.length / 4);
  }

  private drawPlayhead(time: number, valueScale: Required<ValueScaleConfig>, resources: WebGL2RenderResources): void {
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.shader.uniform1f('u_terrainPlayhead', 1);
    for (const tile of resources.tiles) {
      if (time < tile.timeStart || time > tile.timeEnd) continue;
      this.drawPlayheadForTile(tile, time, valueScale, resources);
    }
    this.shader.uniform1f('u_terrainPlayhead', 0);
    this.gl.disable(this.gl.BLEND);
    this.gl.enable(this.gl.DEPTH_TEST);
  }

  private drawPlayheadForTile(tile: SpectrogramMatrix, time: number, valueScale: Required<ValueScaleConfig>, resources: WebGL2RenderResources): void {
    if (tile.frameCount < 2 || tile.binCount < 2) return;
    const entry = resources.textureForTile(tile, valueScale);
    const timeUv = Math.max(0, Math.min(1, (time - tile.timeStart) / Math.max(0.000001, tile.timeEnd - tile.timeStart)));
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, entry.texture);
    this.shader.uniform1i('u_tile', 0);
    this.shader.uniform2f('u_tileTimeRange', tile.timeStart, tile.timeEnd);
    this.shader.uniform2f('u_tileFrequencyRange', tile.frequencies[0] ?? 0, tile.frequencies[tile.frequencies.length - 1] ?? Math.max(1, tile.sampleRate / 2));
    this.shader.uniform2f('u_tileSize', entry.width, entry.height);
    const vertices = terrainPlayheadVertices(timeUv, 96, 0.0035);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.terrainBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, vertices.length / 4);
  }
}

function terrainPlayheadVertices(timeUv: number, rows: number, halfWidth: number): Float32Array {
  const vertices = new Float32Array((rows - 1) * 6 * 4);
  let offset = 0;
  for (let row = 0; row < rows - 1; row++) {
    const v0 = row / (rows - 1);
    const v1 = (row + 1) / (rows - 1);
    const u0 = Math.max(0, timeUv - halfWidth);
    const u1 = Math.min(1, timeUv + halfWidth);
    offset = writeVertex(vertices, offset, u0, v0);
    offset = writeVertex(vertices, offset, u1, v0);
    offset = writeVertex(vertices, offset, u0, v1);
    offset = writeVertex(vertices, offset, u1, v0);
    offset = writeVertex(vertices, offset, u1, v1);
    offset = writeVertex(vertices, offset, u0, v1);
  }
  return vertices;
}

function writeVertex(vertices: Float32Array, offset: number, u: number, v: number): number {
  vertices[offset] = u;
  vertices[offset + 1] = v;
  vertices[offset + 2] = u;
  vertices[offset + 3] = v;
  return offset + 4;
}
