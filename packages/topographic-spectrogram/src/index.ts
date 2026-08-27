import {
  NormalSpectrogramProgram,
  type RenderInput,
  registerSpectrogramProgram,
  WEBGL2_FRAGMENT_UNIFORMS,
  WEBGL2_OVERLAY_CHECK,
  WEBGL2_SCALE_HELPERS,
} from "@sonoscope/core";

export interface TopographicOptions {
  /**
   * Energy spacing between adjacent elevation contour lines in normalized [0, 1] range.
   * @default 0.15
   */
  contourInterval?: number | undefined;

  /**
   * Line thickness in screen-space pixels.
   * @default 1.0
   */
  contourLineWidth?: number | undefined;

  /**
   * Opacity of the contour lines [0, 1].
   * @default 0.9
   */
  contourLineOpacity?: number | undefined;

  /**
   * Minimum energy floor threshold below which contours are clipped to background.
   * @default 0.14
   */
  minEnergyThreshold?: number | undefined;

  /**
   * Gaussian pre-filter radius (in texels) to eliminate noise speckles [0, 2].
   * @default 1.0
   */
  smoothingRadius?: number | undefined;

  /**
   * Soft fade-in transition width above minEnergyThreshold.
   * @default 0.15
   */
  noiseFadeWidth?: number | undefined;

  /**
   * Antialiasing edge feathering width in pixels.
   * @default 0.75
   */
  lineFeather?: number | undefined;

  /**
   * Spatial derivative threshold for speckle culling.
   * @default 1.8
   */
  speckleFilter?: number | undefined;

  /**
   * Interval multiplier for thicker index contours (0 = disabled).
   * @default 0
   */
  majorIntervalMultiplier?: number | undefined;

  /**
   * Line width for major index contours in pixels.
   * @default 2.0
   */
  majorLineWidth?: number | undefined;
}

export const WEBGL2_TOPOGRAPHIC_FRAGMENT_SHADER = `#version 300 es
precision highp float;

out vec4 outColor;

${WEBGL2_FRAGMENT_UNIFORMS}

uniform float u_contourInterval;
uniform float u_contourLineWidth;
uniform float u_contourLineOpacity;
uniform float u_minEnergyThreshold;
uniform float u_smoothingRadius;
uniform float u_noiseFadeWidth;
uniform float u_lineFeather;
uniform float u_speckleFilter;
uniform float u_majorIntervalMultiplier;
uniform float u_majorLineWidth;

${WEBGL2_SCALE_HELPERS}

// Samples spectrogram tile data at arbitrary screen-space coordinates
float sampleSpectrogram(vec2 screenCoord) {
  float globalX = screenCoord.x / max(1.0, u_canvasSize.x);
  float canvasY = 1.0 - screenCoord.y / max(1.0, u_canvasSize.y);

  float time = mix(u_viewport.x, u_viewport.y, globalX);
  if (time < u_tileTimeRange.x || time > u_tileTimeRange.y) {
    return 0.0;
  }

  float minScale = hzToScale(u_viewport.z, u_frequencyScale);
  float maxScale = hzToScale(u_viewport.w, u_frequencyScale);
  float frequency = scaleToHz(mix(maxScale, minScale, canvasY), u_frequencyScale);

  if (frequency < u_tileFrequencyRange.x || frequency > u_tileFrequencyRange.y) {
    return 0.0;
  }

  float hopDuration = (u_tileTimeRange.y - u_tileTimeRange.x) / max(1.0, u_tileSize.x);
  float framePosition = clamp(
    (time - u_tileTimeRange.x) / max(0.000001, hopDuration),
    0.0,
    max(0.0, u_tileSize.x - 1.0)
  );
  float binPosition = clamp(
    (frequency - u_tileFrequencyRange.x) / max(0.000001, u_tileFrequencyRange.y - u_tileFrequencyRange.x) * max(1.0, u_tileSize.y - 1.0),
    0.0,
    max(0.0, u_tileSize.y - 1.0)
  );

  // Convert to continuous UV coordinates and sample with hardware bilinear filter
  vec2 uv = vec2(
    (framePosition + 0.5) / max(1.0, u_tileSize.x),
    (binPosition + 0.5) / max(1.0, u_tileSize.y)
  );
  vec2 texel = (1.0 / max(vec2(1.0), u_tileSize)) * u_smoothingRadius;

  // 9-tap Gaussian blur to eliminate noise floor speckles
  float c = texture(u_tile, uv).r;
  float l = texture(u_tile, clamp(uv - vec2(texel.x, 0.0), 0.0, 1.0)).r * 0.12;
  float r = texture(u_tile, clamp(uv + vec2(texel.x, 0.0), 0.0, 1.0)).r * 0.12;
  float d = texture(u_tile, clamp(uv - vec2(0.0, texel.y), 0.0, 1.0)).r * 0.12;
  float u = texture(u_tile, clamp(uv + vec2(0.0, texel.y), 0.0, 1.0)).r * 0.12;
  float tl = texture(u_tile, clamp(uv + vec2(-texel.x, texel.y), 0.0, 1.0)).r * 0.07;
  float tr = texture(u_tile, clamp(uv + vec2(texel.x, texel.y), 0.0, 1.0)).r * 0.07;
  float bl = texture(u_tile, clamp(uv + vec2(-texel.x, -texel.y), 0.0, 1.0)).r * 0.07;
  float br = texture(u_tile, clamp(uv + vec2(texel.x, -texel.y), 0.0, 1.0)).r * 0.07;

  return c * 0.24 + (l + r + d + u) + (tl + tr + bl + br);
}

void main() {
  ${WEBGL2_OVERLAY_CHECK}

  // Viewport time boundary clipping
  float globalX = gl_FragCoord.x / max(1.0, u_canvasSize.x);
  float time = mix(u_viewport.x, u_viewport.y, globalX);
  if (time < u_tileTimeRange.x || time > u_tileTimeRange.y) {
    discard;
  }

  vec4 backgroundColor = texture(u_colormap, vec2(0.0, 0.5));

  float raw = sampleSpectrogram(gl_FragCoord.xy);
  if (raw < u_minEnergyThreshold) {
    outColor = backgroundColor;
    return;
  }

  // Smooth fade-in near noise threshold to prevent broken jagged ring edges
  float noiseFade = u_noiseFadeWidth > 0.0001
    ? smoothstep(u_minEnergyThreshold, u_minEnergyThreshold + u_noiseFadeWidth, raw)
    : 1.0;

  // Normalized distance in screen-space pixel units
  float level = raw / max(0.0001, u_contourInterval);

  float dist = abs(fract(level - 0.5) - 0.5);
  float delta = fwidth(level);

  // Cull extreme spatial gradient spikes (speckle noise / sub-pixel islands)
  if (delta > u_speckleFilter) {
    outColor = backgroundColor;
    return;
  }

  float pixelDist = dist / max(0.0001, delta);
  
  // Calculate effective line width (supporting major index contours)
  float effectiveWidth = u_contourLineWidth;
  if (u_majorIntervalMultiplier > 1.0) {
    float nearestLevel = floor(level + 0.5);
    if (abs(mod(nearestLevel, u_majorIntervalMultiplier)) < 0.1) {
      effectiveWidth = u_majorLineWidth;
    }
  }

  float halfWidth = max(0.5, effectiveWidth * 0.5);
  float feather = max(0.01, u_lineFeather);
  float contourMask = 1.0 - smoothstep(halfWidth - feather, halfWidth + feather, pixelDist);

  if (contourMask <= 0.0) {
    outColor = backgroundColor;
    return;
  }

  // Color lines according to their quantized contour ring level
  float contourLevel = floor(level + 0.5) * u_contourInterval;
  vec4 lineColor = texture(u_colormap, vec2(clamp(contourLevel, 0.0, 1.0), 0.5));

  float alpha = contourMask * u_contourLineOpacity * noiseFade;
  outColor = mix(backgroundColor, lineColor, alpha);
}`;

export class TopographicSpectrogramProgram extends NormalSpectrogramProgram {
  override readonly name = "topographic";
  private options: TopographicOptions;

  constructor(gl: WebGL2RenderingContext, options: TopographicOptions = {}) {
    super(gl, WEBGL2_TOPOGRAPHIC_FRAGMENT_SHADER);
    this.options = options;
  }

  setOptions(options: TopographicOptions): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): TopographicOptions {
    return { ...this.options };
  }

  protected override setCustomUniforms(_input: RenderInput): void {
    const contourInterval = this.options.contourInterval ?? 0.15;
    const contourLineWidth = this.options.contourLineWidth ?? 1.0;
    const contourLineOpacity = this.options.contourLineOpacity ?? 0.9;
    const minThreshold = this.options.minEnergyThreshold ?? 0.14;
    const smoothingRadius = this.options.smoothingRadius ?? 1.0;
    const noiseFadeWidth = this.options.noiseFadeWidth ?? 0.15;
    const lineFeather = this.options.lineFeather ?? 0.75;
    const speckleFilter = this.options.speckleFilter ?? 1.8;
    const majorIntervalMultiplier = this.options.majorIntervalMultiplier ?? 0;
    const majorLineWidth = this.options.majorLineWidth ?? 2.0;

    this.shader.uniform1f("u_contourInterval", contourInterval);
    this.shader.uniform1f("u_contourLineWidth", contourLineWidth);
    this.shader.uniform1f("u_contourLineOpacity", contourLineOpacity);
    this.shader.uniform1f("u_minEnergyThreshold", minThreshold);
    this.shader.uniform1f("u_smoothingRadius", smoothingRadius);
    this.shader.uniform1f("u_noiseFadeWidth", noiseFadeWidth);
    this.shader.uniform1f("u_lineFeather", lineFeather);
    this.shader.uniform1f("u_speckleFilter", speckleFilter);
    this.shader.uniform1f("u_majorIntervalMultiplier", majorIntervalMultiplier);
    this.shader.uniform1f("u_majorLineWidth", majorLineWidth);
  }
}

/**
 * Registers the Topographic WebGL2 shader program under the given name.
 * @param name Program name identifier (default: "topographic").
 * @param defaultOptions Default options applied when instantiating.
 */
export function registerTopographicProgram(
  name = "topographic",
  defaultOptions?: TopographicOptions,
): void {
  registerSpectrogramProgram(name, (gl, options) => {
    return new TopographicSpectrogramProgram(gl, {
      ...defaultOptions,
      ...(options as TopographicOptions),
    });
  });
}
