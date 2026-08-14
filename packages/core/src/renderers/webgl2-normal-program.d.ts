import type { RenderInput } from "./canvas";
import {
  type WebGL2Frame,
  type WebGL2RenderProgram,
  type WebGL2RenderResources,
  WebGL2ShaderProgram,
} from "./webgl2-program";
export declare const WEBGL2_VERTEX_SHADER =
  "#version 300 es\nin vec2 a_position;\nin vec2 a_tileUv;\nout vec2 v_globalUv;\nout vec2 v_tileUv;\nvoid main() {\n  v_globalUv = a_position * 0.5 + 0.5;\n  v_tileUv = a_tileUv;\n  gl_Position = vec4(a_position, 0.0, 1.0);\n}";
export declare const WEBGL2_FRAGMENT_SHADER =
  "#version 300 es\nprecision highp float;\n\nin vec2 v_globalUv;\nin vec2 v_tileUv;\nout vec4 outColor;\n\nuniform sampler2D u_tile;\nuniform sampler2D u_colormap;\nuniform vec4 u_viewport;\nuniform vec2 u_tileTimeRange;\nuniform vec2 u_tileFrequencyRange;\nuniform vec2 u_tileSize;\nuniform vec2 u_canvasSize;\nuniform vec4 u_valueScale;\nuniform float u_frequencyScale;\nuniform float u_overlayMode;\n\nfloat hzToMel(float hz) { return 1127.01048 * log(1.0 + hz / 700.0); }\nfloat melToHz(float mel) { return 700.0 * (pow(10.0, mel / 2595.0) - 1.0); }\nfloat hzToScale(float hz, float scale) {\n  if (scale == 1.0) return log(max(1.0, hz)) / log(10.0);\n  if (scale == 2.0) return hzToMel(hz);\n  return hz;\n}\nfloat scaleToHz(float value, float scale) {\n  if (scale == 1.0) return pow(10.0, value);\n  if (scale == 2.0) return melToHz(value);\n  return value;\n}\n\nvoid main() {\n  if (u_overlayMode == 1.0) {\n    float hatch = step(0.84, fract((gl_FragCoord.x + gl_FragCoord.y) / 12.0));\n    outColor = mix(vec4(0.059, 0.09, 0.165, 1.0), vec4(0.278, 0.333, 0.412, 1.0), hatch);\n    return;\n  }\n\n  if (u_overlayMode == 2.0) {\n    outColor = vec4(1.0, 1.0, 1.0, 0.9);\n    return;\n  }\n\n  float globalX = gl_FragCoord.x / max(1.0, u_canvasSize.x);\n  float canvasY = 1.0 - gl_FragCoord.y / max(1.0, u_canvasSize.y);\n  float time = mix(u_viewport.x, u_viewport.y, globalX);\n  if (time < u_tileTimeRange.x || time > u_tileTimeRange.y) discard;\n  float minScale = hzToScale(u_viewport.z, u_frequencyScale);\n  float maxScale = hzToScale(u_viewport.w, u_frequencyScale);\n  float frequency = scaleToHz(mix(maxScale, minScale, canvasY), u_frequencyScale);\n  float frequencyStep = (u_tileFrequencyRange.y - u_tileFrequencyRange.x) / max(1.0, u_tileSize.y - 1.0);\n  if (frequency > u_tileFrequencyRange.x && frequency <= u_tileFrequencyRange.x + frequencyStep * 0.5 + 0.000001) {\n    outColor = texture(u_colormap, vec2(0.0, 0.5));\n    return;\n  }\n  float framePosition = clamp((time - u_tileTimeRange.x) / max(0.000001, u_tileTimeRange.y - u_tileTimeRange.x) * max(1.0, u_tileSize.x - 1.0), 0.0, max(0.0, u_tileSize.x - 1.0));\n  float binPosition = clamp((frequency - u_tileFrequencyRange.x) / max(0.000001, u_tileFrequencyRange.y - u_tileFrequencyRange.x) * max(1.0, u_tileSize.y - 1.0), 0.0, max(0.0, u_tileSize.y - 1.0));\n  int frame0 = int(floor(framePosition));\n  int frame1 = int(ceil(framePosition));\n  int bin0 = int(floor(binPosition));\n  int bin1 = int(ceil(binPosition));\n  float frameFraction = fract(framePosition);\n  float binFraction = fract(binPosition);\n  float low0 = texelFetch(u_tile, ivec2(frame0, bin0), 0).r;\n  float low1 = texelFetch(u_tile, ivec2(frame1, bin0), 0).r;\n  float high0 = texelFetch(u_tile, ivec2(frame0, bin1), 0).r;\n  float high1 = texelFetch(u_tile, ivec2(frame1, bin1), 0).r;\n  float normalized = mix(mix(low0, low1, frameFraction), mix(high0, high1, frameFraction), binFraction);\n  outColor = texture(u_colormap, vec2(clamp(normalized, 0.0, 1.0), 0.5));\n}";
export declare class NormalSpectrogramProgram implements WebGL2RenderProgram {
  private readonly gl;
  readonly shader: WebGL2ShaderProgram;
  private readonly quadBuffer;
  constructor(gl: WebGL2RenderingContext, fragmentShader?: string);
  paint(
    input: RenderInput,
    frame: WebGL2Frame,
    resources: WebGL2RenderResources,
  ): void;
  delete(): void;
  private bindAttributes;
  private drawTile;
  private drawPlaceholder;
  private drawPlayhead;
  private setFullViewportQuad;
  private setLineQuad;
}
//# sourceMappingURL=webgl2-normal-program.d.ts.map
