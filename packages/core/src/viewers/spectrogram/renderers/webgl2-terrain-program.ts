/**
 * Terrain spectrogram program.
 *
 * Visual treatment inspired by Chrome Music Lab's 3D sonogram shaders:
 * https://github.com/googlecreativelab/chrome-music-lab/tree/master/spectrogram/src/bin/shaders
 * Chrome Music Lab is Copyright 2016 Google Inc. and licensed under Apache-2.0.
 * This shader is an original WebGL2 implementation adapted to sonoscope's tile texture layout.
 */

import type { SpectrogramMatrix, ValueScaleConfig } from "../types";
import type { RenderInput } from "./canvas";
import { lookAt, multiplyMat4, perspective, type Vec3 } from "./webgl2-camera";
import { tileTimeRange } from "./webgl2-geometry";
import {
  WEBGL2_SCALE_HELPERS,
  type WebGL2Frame,
  type WebGL2RenderResources,
  WebGL2TileProgramBase,
} from "./webgl2-program";

const TERRAIN_CAMERA_EYE: Vec3 = [0, 1.5, 0];
const TERRAIN_CAMERA_TARGET: Vec3 = [0, 0, 0];
const TERRAIN_CAMERA_UP: Vec3 = [0, 0, -1];
const TERRAIN_FOV_RADIANS = (70 * Math.PI) / 180;

function terrainViewProjection(aspect: number): Float32Array {
  return multiplyMat4(
    perspective(TERRAIN_FOV_RADIANS, aspect, 0.1, 100),
    lookAt(TERRAIN_CAMERA_EYE, TERRAIN_CAMERA_TARGET, TERRAIN_CAMERA_UP),
  );
}

export const WEBGL2_TERRAIN_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_tileUv;
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
uniform mat4 u_viewProjection;
uniform vec2 u_tileSize;

${WEBGL2_SCALE_HELPERS}

void main() {
  float minScale = hzToScale(u_viewport.z, u_frequencyScale);
  float maxScale = hzToScale(u_viewport.w, u_frequencyScale);
  float frequency = scaleToHz(mix(minScale, maxScale, a_tileUv.y), u_frequencyScale);
  float frequencyUv = clamp((frequency - u_tileFrequencyRange.x) / max(0.000001, u_tileFrequencyRange.y - u_tileFrequencyRange.x), 0.0, 1.0);
  v_tileUv = vec2(a_tileUv.x, frequencyUv);
  vec2 stepUv = 1.0 / max(vec2(1.0), u_tileSize - 1.0);
  float h0 = texture(u_tile, v_tileUv).r;
  float h1 = texture(u_tile, clamp(v_tileUv + vec2(stepUv.x, 0.0), 0.0, 1.0)).r;
  float h2 = texture(u_tile, clamp(v_tileUv - vec2(stepUv.x, 0.0), 0.0, 1.0)).r;
  float h3 = texture(u_tile, clamp(v_tileUv + vec2(0.0, stepUv.y), 0.0, 1.0)).r;
  float h4 = texture(u_tile, clamp(v_tileUv - vec2(0.0, stepUv.y), 0.0, 1.0)).r;
  float heightValue = (h0 * 0.4) + (h1 + h2 + h3 + h4) * 0.15;
  v_height = heightValue;
  float tileTime = mix(u_tileTimeRange.x, u_tileTimeRange.y, a_tileUv.x);
  float viewportX = clamp((tileTime - u_terrainTimeRange.x) / max(0.000001, u_terrainTimeRange.y - u_terrainTimeRange.x), 0.0, 1.0);
  float liftedHeight = pow(heightValue, 1.0) * (u_terrainHeight * 0.5);
  // The terrain lies in the X-Z plane: time recedes along X, low
  // frequencies are closest to the camera, and energy lifts the Y axis.
  vec3 worldPosition = vec3(
    (viewportX * 2.0 - 1.0) * 1.8,
    liftedHeight,
    (0.5 - a_tileUv.y) * 1.9
  );
  gl_Position = u_viewProjection * vec4(worldPosition, 1.0);
}`;

export const WEBGL2_TERRAIN_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_tileUv;
in float v_height;
out vec4 outColor;

uniform sampler2D u_tile;
uniform sampler2D u_colormap;
uniform vec2 u_tileSize;

void main() {
  vec2 stepSize = 2.0 / max(vec2(1.0), u_tileSize - 1.0);
  float left = texture(u_tile, clamp(v_tileUv - vec2(stepSize.x, 0.0), 0.0, 1.0)).r;
  float right = texture(u_tile, clamp(v_tileUv + vec2(stepSize.x, 0.0), 0.0, 1.0)).r;
  float low = texture(u_tile, clamp(v_tileUv - vec2(0.0, stepSize.y), 0.0, 1.0)).r;
  float high = texture(u_tile, clamp(v_tileUv + vec2(0.0, stepSize.y), 0.0, 1.0)).r;
  vec3 normal = normalize(vec3((left - right) * 1.0, 1.2, (low - high) * 1.0));
  vec3 localLight = normalize(vec3(0.15, 0.85, 0.45));
  float light = clamp(dot(normal, localLight), 0.0, 1.0);
  vec3 baseColor = texture(u_colormap, vec2(clamp(v_height, 0.0, 1.0), 0.5)).rgb;
  vec3 color = baseColor * (0.75 + light * 0.25);
  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

export class TerrainSpectrogramProgram extends WebGL2TileProgramBase {
  private readonly vertexCount: number;

  constructor(gl: WebGL2RenderingContext) {
    super(
      gl,
      WEBGL2_TERRAIN_VERTEX_SHADER,
      WEBGL2_TERRAIN_FRAGMENT_SHADER,
      "terrain",
      false,
    );

    const gridX = 64;
    const gridY = 64;
    const mesh = new Float32Array((gridX - 1) * (gridY - 1) * 6 * 4);
    let offset = 0;
    for (let y = 0; y < gridY - 1; y++) {
      const v0 = y / (gridY - 1);
      const v1 = (y + 1) / (gridY - 1);
      for (let x = 0; x < gridX - 1; x++) {
        const u0 = x / (gridX - 1);
        const u1 = (x + 1) / (gridX - 1);
        mesh.set([u0, v0, u0, v0, u1, v0, u1, v0, u0, v1, u0, v1], offset);
        mesh.set([u1, v0, u1, v0, u1, v1, u1, v1, u0, v1, u0, v1], offset + 12);
        offset += 24;
      }
    }
    this.vertexCount = mesh.length / 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
  }

  override paint(
    input: RenderInput,
    frame: WebGL2Frame,
    resources: WebGL2RenderResources,
  ): void {
    this.beginPaint(
      [0, 0, 0, 1],
      this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT,
      true,
    );
    this.bindCommonUniforms(input, frame, resources);
    this.shader.uniform2f(
      "u_terrainTimeRange",
      input.viewport.startTime,
      input.viewport.endTime,
    );
    const aspect = frame.deviceWidth / Math.max(1, frame.deviceHeight);
    this.shader.uniformMat4("u_viewProjection", terrainViewProjection(aspect));
    this.shader.uniform3f(
      "u_cameraPosition",
      TERRAIN_CAMERA_EYE[0],
      TERRAIN_CAMERA_EYE[1],
      TERRAIN_CAMERA_EYE[2],
    );
    this.shader.uniform1f("u_terrainHeight", 0.55);

    const vStart = input.viewport.startTime;
    const vEnd = input.viewport.endTime;
    for (const tile of input.tiles) {
      const { startTime, endTime } = tileTimeRange(tile);
      if (endTime < vStart || startTime > vEnd) {
        continue;
      }
      this.drawTile(tile, input.valueScale, resources);
    }
    this.endPaint(true);
  }

  private drawTile(
    tile: SpectrogramMatrix,
    valueScale: Required<ValueScaleConfig>,
    resources: WebGL2RenderResources,
  ): void {
    if (tile.frameCount < 2 || tile.binCount < 2) return;
    const entry = resources.textureForTile(tile, valueScale);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, entry.texture);
    this.shader.uniform1i("u_tile", 0);
    const { startTime, endTime } = tileTimeRange(tile);
    this.shader.uniform2f("u_tileTimeRange", startTime, endTime);
    this.shader.uniform2f(
      "u_tileFrequencyRange",
      tile.frequencies[0] ?? 0,
      tile.frequencies[tile.frequencies.length - 1] ??
        Math.max(1, tile.sampleRate / 2),
    );
    this.shader.uniform2f("u_tileSize", entry.width, entry.height);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, this.vertexCount);
  }
}
