import {
  type RenderInput,
  registerSpectrogramProgram,
  type SpectrogramMatrix,
  type ValueScaleConfig,
  WEBGL2_SCALE_HELPERS,
  type WebGL2Frame,
  type WebGL2RenderResources,
  WebGL2TileProgramBase,
} from "@sonoscope/core";

export type Vec3 = [number, number, number];

export function perspective(
  fovyRadians: number,
  aspect: number,
  near: number,
  far: number,
): Float32Array {
  const f = 1 / Math.tan(fovyRadians / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0,
  ]);
}

export function lookAt(eye: Vec3, center: Vec3, up: Vec3): Float32Array {
  let z0 = eye[0] - center[0];
  let z1 = eye[1] - center[1];
  let z2 = eye[2] - center[2];
  let len = Math.hypot(z0, z1, z2) || 1;
  z0 /= len;
  z1 /= len;
  z2 /= len;

  let x0 = up[1] * z2 - up[2] * z1;
  let x1 = up[2] * z0 - up[0] * z2;
  let x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2) || 1;
  x0 /= len;
  x1 /= len;
  x2 /= len;

  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;

  return new Float32Array([
    x0,
    y0,
    z0,
    0,
    x1,
    y1,
    z1,
    0,
    x2,
    y2,
    z2,
    0,
    -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
    -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
    -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
    1,
  ]);
}

/** out = a * b (both column-major 4x4). */
export function multiplyMat4(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += (a[k * 4 + row] ?? 0) * (b[column * 4 + k] ?? 0);
      }
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

export function terrainVerticesForTile(
  tile: Pick<SpectrogramMatrix, "frameCount" | "binCount">,
  maxColumns = 96,
  maxRows = 96,
): Float32Array {
  const columns = Math.max(2, Math.min(maxColumns, tile.frameCount));
  const rows = Math.max(2, Math.min(maxRows, tile.binCount));
  const vertices = new Float32Array((columns - 1) * (rows - 1) * 6 * 4);
  let offset = 0;
  for (let row = 0; row < rows - 1; row++) {
    const v0 = row / (rows - 1);
    const v1 = (row + 1) / (rows - 1);
    for (let column = 0; column < columns - 1; column++) {
      const u0 = column / (columns - 1);
      const u1 = (column + 1) / (columns - 1);
      vertices[offset] = u0;
      vertices[offset + 1] = v0;
      vertices[offset + 2] = u0;
      vertices[offset + 3] = v0;
      vertices[offset + 4] = u1;
      vertices[offset + 5] = v0;
      vertices[offset + 6] = u1;
      vertices[offset + 7] = v0;
      vertices[offset + 8] = u0;
      vertices[offset + 9] = v1;
      vertices[offset + 10] = u0;
      vertices[offset + 11] = v1;
      vertices[offset + 12] = u1;
      vertices[offset + 13] = v0;
      vertices[offset + 14] = u1;
      vertices[offset + 15] = v0;
      vertices[offset + 16] = u1;
      vertices[offset + 17] = v1;
      vertices[offset + 18] = u1;
      vertices[offset + 19] = v1;
      vertices[offset + 20] = u0;
      vertices[offset + 21] = v1;
      vertices[offset + 22] = u0;
      vertices[offset + 23] = v1;
      offset += 24;
    }
  }
  return vertices;
}

export function tileFrequencyRange(
  tile: Pick<SpectrogramMatrix, "frequencies" | "sampleRate">,
): { min: number; max: number } {
  return {
    min: tile.frequencies[0] ?? 0,
    max:
      tile.frequencies[tile.frequencies.length - 1] ??
      Math.max(1, tile.sampleRate / 2),
  };
}

export function tileTimeRange(
  tile: Pick<
    SpectrogramMatrix,
    "times" | "sampleRate" | "timeStart" | "timeEnd" | "frameCount"
  >,
): { startTime: number; endTime: number } {
  const hopDuration =
    tile.times.length > 1
      ? (tile.times[tile.times.length - 1]! - tile.times[0]!) /
        Math.max(1, tile.frameCount - 1)
      : tile.sampleRate > 0
        ? (tile.timeEnd - tile.timeStart) / tile.frameCount
        : 0;
  const startTime = tile.times.length > 0 ? tile.times[0]! : tile.timeStart;
  return { startTime, endTime: startTime + tile.frameCount * hopDuration };
}

export interface TerrainOptions {
  /**
   * Peak vertical elevation multiplier.
   * @default 0.55
   */
  heightScale?: number | undefined;

  /**
   * Peak contrast gamma curve exponent.
   * @default 1.0
   */
  heightGamma?: number | undefined;

  /**
   * Grid mesh resolution [columns, rows] or single number.
   * @default 64
   */
  meshResolution?: number | [number, number] | undefined;

  /**
   * Camera field of view in degrees.
   * @default 70
   */
  fov?: number | undefined;

  /**
   * Camera tilt angle in degrees (0 = top-down 2D view, 45 = isometric, 80 = horizon view).
   * @default 0
   */
  cameraPitch?: number | undefined;

  /**
   * Camera horizontal azimuth rotation angle in degrees.
   * @default 0
   */
  cameraYaw?: number | undefined;

  /**
   * Camera distance from the terrain center.
   * @default 1.5
   */
  cameraDistance?: number | undefined;

  /**
   * Camera vertical height / altitude override above terrain.
   * Defaults to distance * cos(pitch).
   */
  cameraHeight?: number | undefined;

  /**
   * Explicit 3D camera eye position [x, y, z] (overrides pitch/yaw/distance).
   */
  cameraEye?: [number, number, number] | undefined;

  /**
   * Explicit 3D camera target look-at point [x, y, z].
   * @default [0, 0, 0]
   */
  cameraTarget?: [number, number, number] | undefined;

  /**
   * Explicit 3D camera up vector [x, y, z].
   */
  cameraUp?: [number, number, number] | undefined;

  /**
   * Base ambient fill light [0, 1].
   * @default 0.75
   */
  ambientLight?: number | undefined;

  /**
   * Directional slope shading strength [0, 1].
   * @default 0.25
   */
  diffuseLight?: number | undefined;

  /**
   * Direction vector of the light source [x, y, z].
   * @default [0.15, -0.35, 0.85]
   */
  lightDirection?: [number, number, number] | undefined;

  /**
   * 5-tap neighbor blur weight for smoothing vertex heights [0, 1].
   * @default 0.6
   */
  smoothing?: number | undefined;
}

export function computeTerrainCamera(options: TerrainOptions): {
  eye: Vec3;
  target: Vec3;
  up: Vec3;
} {
  const target: Vec3 = options.cameraTarget ?? [0, 0, 0];

  if (options.cameraEye) {
    return {
      eye: options.cameraEye,
      target,
      up: options.cameraUp ?? [0, 0, 1],
    };
  }

  const pitchDeg = options.cameraPitch ?? 0;
  const yawDeg = options.cameraYaw ?? 0;
  const distance = options.cameraDistance ?? 1.5;
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const yawRad = (yawDeg * Math.PI) / 180;

  const sinP = Math.sin(pitchRad);
  const cosP = Math.cos(pitchRad);
  const sinY = Math.sin(yawRad);
  const cosY = Math.cos(yawRad);

  const height =
    options.cameraHeight !== undefined ? options.cameraHeight : distance * cosP;
  const dXy = distance * sinP;

  const eye: Vec3 = [
    target[0] + dXy * sinY || 0,
    target[1] - dXy * cosY || 0,
    target[2] + height || 0,
  ];

  const up: Vec3 = options.cameraUp ?? [
    -cosP * sinY || 0,
    cosP * cosY || 0,
    sinP || 0,
  ];

  return { eye, target, up };
}

function terrainViewProjection(
  aspect: number,
  fovDegrees: number,
  eye: Vec3,
  target: Vec3,
  up: Vec3,
): Float32Array {
  const fovRad = (fovDegrees * Math.PI) / 180;
  return multiplyMat4(
    perspective(fovRad, aspect, 0.1, 100),
    lookAt(eye, target, up),
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
uniform float u_heightGamma;
uniform float u_smoothing;
uniform float u_aspect;
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
  float neighbors = (h1 + h2 + h3 + h4) * 0.25;
  float heightValue = mix(h0, neighbors, clamp(u_smoothing, 0.0, 1.0));
  v_height = heightValue;
  float tileTime = mix(u_tileTimeRange.x, u_tileTimeRange.y, a_tileUv.x);
  float viewportX = (tileTime - u_terrainTimeRange.x) / max(0.000001, u_terrainTimeRange.y - u_terrainTimeRange.x);
  float liftedHeight = pow(clamp(heightValue, 0.0, 1.0), u_heightGamma) * (u_terrainHeight * 0.5);
  // Ground plane lies in X-Y: time spans along X (scaled by aspect to fill canvas),
  // frequency spans along Y (low frequencies at foreground -Y, high frequencies at background +Y),
  // and audio energy / amplitude lifts vertically along the Z axis.
  vec3 worldPosition = vec3(
    (viewportX * 2.0 - 1.0) * (u_aspect * 1.05),
    (a_tileUv.y - 0.5) * 1.9,
    liftedHeight
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
uniform float u_ambientLight;
uniform float u_diffuseLight;
uniform vec3 u_lightDirection;

void main() {
  vec2 stepSize = 2.0 / max(vec2(1.0), u_tileSize - 1.0);
  float left = texture(u_tile, clamp(v_tileUv - vec2(stepSize.x, 0.0), 0.0, 1.0)).r;
  float right = texture(u_tile, clamp(v_tileUv + vec2(stepSize.x, 0.0), 0.0, 1.0)).r;
  float low = texture(u_tile, clamp(v_tileUv - vec2(0.0, stepSize.y), 0.0, 1.0)).r;
  float high = texture(u_tile, clamp(v_tileUv + vec2(0.0, stepSize.y), 0.0, 1.0)).r;
  vec3 normal = normalize(vec3((left - right) * 1.0, (low - high) * 1.0, 1.2));
  vec3 localLight = normalize(u_lightDirection);
  float light = clamp(dot(normal, localLight), 0.0, 1.0);
  vec3 baseColor = texture(u_colormap, vec2(clamp(v_height, 0.0, 1.0), 0.5)).rgb;
  vec3 color = baseColor * (u_ambientLight + light * u_diffuseLight);
  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

export class TerrainSpectrogramProgram extends WebGL2TileProgramBase {
  private readonly vertexCount: number;
  private options: TerrainOptions;

  constructor(gl: WebGL2RenderingContext, options: TerrainOptions = {}) {
    super(
      gl,
      WEBGL2_TERRAIN_VERTEX_SHADER,
      WEBGL2_TERRAIN_FRAGMENT_SHADER,
      "terrain",
      false,
    );
    this.options = options;

    const res = options.meshResolution ?? 64;
    const gridX = Array.isArray(res) ? res[0] : res;
    const gridY = Array.isArray(res) ? res[1] : res;
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

  setOptions(options: TerrainOptions): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): TerrainOptions {
    return { ...this.options };
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
    const fov = this.options.fov ?? 70;
    const heightScale = this.options.heightScale ?? 0.55;
    const heightGamma = this.options.heightGamma ?? 1.0;
    const smoothing = this.options.smoothing ?? 0.6;
    const ambientLight = this.options.ambientLight ?? 0.75;
    const diffuseLight = this.options.diffuseLight ?? 0.25;
    const lightDir = this.options.lightDirection ?? [0.15, -0.35, 0.85];

    const { eye, target, up } = computeTerrainCamera(this.options);

    this.shader.uniform1f("u_aspect", aspect);
    this.shader.uniformMat4(
      "u_viewProjection",
      terrainViewProjection(aspect, fov, eye, target, up),
    );
    this.shader.uniform3f("u_cameraPosition", eye[0], eye[1], eye[2]);
    this.shader.uniform1f("u_terrainHeight", heightScale);
    this.shader.uniform1f("u_heightGamma", heightGamma);
    this.shader.uniform1f("u_smoothing", smoothing);
    this.shader.uniform1f("u_ambientLight", ambientLight);
    this.shader.uniform1f("u_diffuseLight", diffuseLight);
    this.shader.uniform3f(
      "u_lightDirection",
      lightDir[0],
      lightDir[1],
      lightDir[2],
    );

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

/**
 * Registers the Terrain 3D WebGL2 shader program under the given name.
 * @param name Program name identifier (default: "terrain").
 * @param defaultOptions Default options applied when instantiating.
 */
export function registerTerrainProgram(
  name = "terrain",
  defaultOptions?: TerrainOptions,
): void {
  registerSpectrogramProgram(name, (gl, options) => {
    return new TerrainSpectrogramProgram(gl, {
      ...defaultOptions,
      ...(options as TerrainOptions),
    });
  });
}
