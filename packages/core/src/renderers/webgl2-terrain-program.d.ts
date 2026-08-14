/**
 * Hidden terrain spectrogram program.
 *
 * Visual treatment inspired by Chrome Music Lab's 3D sonogram shaders:
 * https://github.com/googlecreativelab/chrome-music-lab/tree/master/spectrogram/src/bin/shaders
 * Chrome Music Lab is Copyright 2016 Google Inc. and licensed under Apache-2.0.
 * This shader is an original WebGL2 implementation adapted to espectro's tile texture layout.
 */
import type { RenderInput } from "./canvas";
import {
  type WebGL2Frame,
  type WebGL2RenderProgram,
  type WebGL2RenderResources,
  WebGL2ShaderProgram,
} from "./webgl2-program";
export declare const WEBGL2_TERRAIN_VERTEX_SHADER =
  "#version 300 es\nprecision highp float;\n\nin vec2 a_position;\nin vec2 a_tileUv;\nout float v_viewportX;\nout vec2 v_tileUv;\nout float v_height;\n\nuniform sampler2D u_tile;\nuniform vec2 u_tileTimeRange;\nuniform vec2 u_terrainTimeRange;\nuniform vec2 u_tileFrequencyRange;\nuniform vec2 u_canvasSize;\nuniform vec4 u_viewport;\nuniform float u_frequencyScale;\nuniform float u_terrainHeight;\nuniform float u_terrainPlayhead;\n\nfloat hzToMel(float hz) { return 1127.01048 * log(1.0 + hz / 700.0); }\nfloat melToHz(float mel) { return 700.0 * (pow(10.0, mel / 2595.0) - 1.0); }\nfloat hzToScale(float hz, float scale) {\n  if (scale == 1.0) return log(max(1.0, hz)) / log(10.0);\n  if (scale == 2.0) return hzToMel(hz);\n  return hz;\n}\nfloat scaleToHz(float value, float scale) {\n  if (scale == 1.0) return pow(10.0, value);\n  if (scale == 2.0) return melToHz(value);\n  return value;\n}\n\nvoid main() {\n  float minScale = hzToScale(u_viewport.z, u_frequencyScale);\n  float maxScale = hzToScale(u_viewport.w, u_frequencyScale);\n  float frequency = scaleToHz(mix(minScale, maxScale, a_tileUv.y), u_frequencyScale);\n  float frequencyUv = clamp((frequency - u_tileFrequencyRange.x) / max(0.000001, u_tileFrequencyRange.y - u_tileFrequencyRange.x), 0.0, 1.0);\n  v_tileUv = vec2(a_tileUv.x, frequencyUv);\n  float heightValue = texture(u_tile, v_tileUv).r;\n  v_height = heightValue;\n  float tileTime = mix(u_tileTimeRange.x, u_tileTimeRange.y, a_tileUv.x);\n  float viewportX = clamp((tileTime - u_terrainTimeRange.x) / max(0.000001, u_terrainTimeRange.y - u_terrainTimeRange.x), 0.0, 1.0);\n  v_viewportX = viewportX;\n  vec2 terrain = vec2(viewportX * 2.0 - 1.0, a_tileUv.y * 2.0 - 1.0);\n  float liftedHeight = pow(heightValue, 0.72) * u_terrainHeight;\n  float viewX = terrain.x * 0.96;\n  float playheadLift = u_terrainPlayhead == 1.0 ? 0.012 : 0.0;\n  float viewY = terrain.y * 0.76 + liftedHeight * 0.42 + playheadLift;\n  gl_Position = vec4(viewX, viewY - 0.01, -heightValue * 0.03 - playheadLift, 1.0);\n}";
export declare const WEBGL2_TERRAIN_FRAGMENT_SHADER =
  "#version 300 es\nprecision highp float;\n\nin float v_viewportX;\nin vec2 v_tileUv;\nin float v_height;\nout vec4 outColor;\n\nuniform sampler2D u_tile;\nuniform sampler2D u_colormap;\nuniform vec2 u_tileSize;\nuniform float u_terrainPlayhead;\n\nvoid main() {\n  vec2 stepSize = 1.0 / max(vec2(1.0), u_tileSize - 1.0);\n  float left = texture(u_tile, clamp(v_tileUv - vec2(stepSize.x, 0.0), 0.0, 1.0)).r;\n  float right = texture(u_tile, clamp(v_tileUv + vec2(stepSize.x, 0.0), 0.0, 1.0)).r;\n  float low = texture(u_tile, clamp(v_tileUv - vec2(0.0, stepSize.y), 0.0, 1.0)).r;\n  float high = texture(u_tile, clamp(v_tileUv + vec2(0.0, stepSize.y), 0.0, 1.0)).r;\n  vec3 normal = normalize(vec3((left - right) * 1.8, (low - high) * 1.8, 0.6));\n  vec3 localLight = normalize(vec3(-0.35, -0.55, 0.9));\n  float light = clamp(dot(normal, localLight), 0.0, 1.0);\n  float contour = smoothstep(0.015, 0.0, abs(fract(v_height * 18.0) - 0.5));\n  float ridge = smoothstep(0.965, 1.0, fract(v_tileUv.y * u_tileSize.y));\n  float edgeFade = smoothstep(0.0, 0.16, v_viewportX) * smoothstep(1.0, 0.84, v_viewportX);\n  if (u_terrainPlayhead == 1.0) {\n    outColor = vec4(vec3(1.0), 0.98);\n    return;\n  }\n  vec3 baseColor = texture(u_colormap, vec2(clamp(v_height, 0.0, 1.0), 0.5)).rgb;\n  vec3 color = baseColor * (0.48 + light * 0.5) + vec3(contour * 0.18 + ridge * 0.1);\n  outColor = vec4(clamp(color * mix(0.18, 1.0, edgeFade), 0.0, 1.0), 1.0);\n}";
export declare class TerrainSpectrogramProgram implements WebGL2RenderProgram {
  private readonly gl;
  readonly shader: WebGL2ShaderProgram;
  private readonly terrainBuffer;
  constructor(gl: WebGL2RenderingContext);
  paint(
    input: RenderInput,
    frame: WebGL2Frame,
    resources: WebGL2RenderResources,
  ): void;
  delete(): void;
  private bindAttributes;
  private drawTile;
  private drawPlayhead;
  private drawPlayheadForTile;
}
//# sourceMappingURL=webgl2-terrain-program.d.ts.map
