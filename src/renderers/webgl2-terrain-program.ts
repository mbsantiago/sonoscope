import type { RenderInput } from './canvas';
import { WebGL2ShaderProgram, type WebGL2Frame, type WebGL2RenderProgram, type WebGL2RenderResources } from './webgl2-program';
import type { SpectrogramMatrix, ValueScaleConfig } from '../types';
import { terrainVerticesForTile } from './webgl2-geometry';

export const WEBGL2_TERRAIN_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_tileUv;
out vec2 v_tileUv;
out float v_height;

uniform sampler2D u_tile;
uniform vec2 u_tileTimeRange;
uniform vec2 u_canvasSize;
uniform float u_terrainHeight;

void main() {
  v_tileUv = a_tileUv;
  float heightValue = texture(u_tile, a_tileUv).r;
  v_height = heightValue;
  vec2 terrain = vec2(a_position.x * 2.0 - 1.0, a_position.y * 2.0 - 1.0);
  float isoX = (terrain.x - terrain.y) * 0.58;
  float isoY = (terrain.x + terrain.y) * 0.28 + heightValue * u_terrainHeight;
  gl_Position = vec4(isoX, isoY - 0.58, -heightValue * 0.2, 1.0);
}`;

export const WEBGL2_TERRAIN_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_tileUv;
in float v_height;
out vec4 outColor;

uniform sampler2D u_tile;
uniform vec2 u_tileSize;

void main() {
  vec2 stepSize = 1.0 / max(vec2(1.0), u_tileSize - 1.0);
  float left = texture(u_tile, clamp(v_tileUv - vec2(stepSize.x, 0.0), 0.0, 1.0)).r;
  float right = texture(u_tile, clamp(v_tileUv + vec2(stepSize.x, 0.0), 0.0, 1.0)).r;
  float low = texture(u_tile, clamp(v_tileUv - vec2(0.0, stepSize.y), 0.0, 1.0)).r;
  float high = texture(u_tile, clamp(v_tileUv + vec2(0.0, stepSize.y), 0.0, 1.0)).r;
  vec3 normal = normalize(vec3((left - right) * 1.8, (low - high) * 1.8, 0.6));
  float light = clamp(dot(normal, normalize(vec3(-0.35, -0.55, 0.9))), 0.0, 1.0);
  float contour = smoothstep(0.015, 0.0, abs(fract(v_height * 18.0) - 0.5));
  float ridge = smoothstep(0.965, 1.0, fract(v_tileUv.y * u_tileSize.y));
  float tone = 0.18 + v_height * 0.48 + light * 0.26 + contour * 0.18 + ridge * 0.16;
  outColor = vec4(vec3(clamp(tone, 0.0, 1.0)), 1.0);
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
    this.shader.uniform2f('u_canvasSize', frame.deviceWidth, frame.deviceHeight);
    this.shader.uniform1f('u_terrainHeight', 0.72);
    for (const tile of input.tiles) this.drawTile(tile, input.valueScale, resources);
    gl.disable(gl.DEPTH_TEST);
  }

  delete(): void {
    this.gl.deleteBuffer(this.terrainBuffer);
    this.shader.delete();
  }

  private bindAttributes(): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.terrainBuffer);
    this.gl.enableVertexAttribArray(this.shader.position);
    this.gl.vertexAttribPointer(this.shader.position, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(this.shader.tileUv);
    this.gl.vertexAttribPointer(this.shader.tileUv, 2, this.gl.FLOAT, false, 16, 8);
  }

  private drawTile(tile: SpectrogramMatrix, valueScale: Required<ValueScaleConfig>, resources: WebGL2RenderResources): void {
    if (tile.frameCount < 2 || tile.binCount < 2) return;
    const entry = resources.textureForTile(tile, valueScale);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, entry.texture);
    this.shader.uniform1i('u_tile', 0);
    this.shader.uniform2f('u_tileTimeRange', tile.timeStart, tile.timeEnd);
    this.shader.uniform2f('u_tileSize', entry.width, entry.height);
    const vertices = terrainVerticesForTile(tile, 96, 96);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.terrainBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, vertices.length / 4);
  }
}
