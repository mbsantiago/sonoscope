import {
  NormalSpectrogramProgram,
  type RenderInput,
  registerSpectrogramProgram,
  WEBGL2_FRAGMENT_UNIFORMS,
  WEBGL2_OVERLAY_CHECK,
  WEBGL2_SCALE_HELPERS,
} from "@sonoscope/core";

export interface HalftoneOptions {
  /**
   * Spatial frequency of the halftone dot matrix (dots per CSS pixel).
   * @default 0.24
   */
  dotFrequency?: number | undefined;

  /**
   * Dot grid orientation angle in degrees.
   * @default 45
   */
  dotAngle?: number | undefined;

  /**
   * Energy floor below which no dots are rendered.
   * @default 0
   */
  minEnergyThreshold?: number | undefined;

  /**
   * Gamma exponent applied to the energy to shape dot size falloff.
   * @default 1.4
   */
  energyGamma?: number | undefined;

  /**
   * Maximum dot radius relative to cell size [0.1, 1.0].
   * @default 0.7071
   */
  maxDotRadius?: number | undefined;

  /**
   * Anti-aliasing edge softness multiplier.
   * @default 0.75
   */
  dotSoftness?: number | undefined;

  /**
   * Background opacity [0, 1].
   * @default 1.0
   */
  backgroundOpacity?: number | undefined;
}

export const WEBGL2_HALFTONE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

out vec4 outColor;

${WEBGL2_FRAGMENT_UNIFORMS}

uniform float u_dotFrequency;
uniform vec2 u_dotRotCosSin;
uniform float u_minEnergyThreshold;
uniform float u_energyGamma;
uniform float u_maxDotRadius;
uniform float u_dotSoftness;
uniform float u_backgroundOpacity;

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

  return mix(mix(low0, low1, frameFraction), mix(high0, high1, frameFraction), binFraction);
}

// 5-tap area integration over the cell bounds.
// Cells are in content-space; timeOffset converts them back to screen-space for sampling.
float sampleCellArea(vec2 cellIndex, float cellSize, mat2 invRot, float timeOffset) {
  vec2 c0 = (cellIndex + vec2(0.50, 0.50)) * cellSize;
  vec2 c1 = (cellIndex + vec2(0.25, 0.25)) * cellSize;
  vec2 c2 = (cellIndex + vec2(0.75, 0.25)) * cellSize;
  vec2 c3 = (cellIndex + vec2(0.25, 0.75)) * cellSize;
  vec2 c4 = (cellIndex + vec2(0.75, 0.75)) * cellSize;

  float v0 = sampleSpectrogram(invRot * c0 - vec2(timeOffset, 0.0));
  float v1 = sampleSpectrogram(invRot * c1 - vec2(timeOffset, 0.0));
  float v2 = sampleSpectrogram(invRot * c2 - vec2(timeOffset, 0.0));
  float v3 = sampleSpectrogram(invRot * c3 - vec2(timeOffset, 0.0));
  float v4 = sampleSpectrogram(invRot * c4 - vec2(timeOffset, 0.0));

  return v0 * 0.36 + (v1 + v2 + v3 + v4) * 0.16;
}

void main() {
  ${WEBGL2_OVERLAY_CHECK}
  // Viewport time boundary clipping
  float globalX = gl_FragCoord.x / max(1.0, u_canvasSize.x);
  float time = mix(u_viewport.x, u_viewport.y, globalX);
  if (time < u_tileTimeRange.x || time > u_tileTimeRange.y) {
    discard;
  }

  // Anchor the dot grid to absolute time so dots move with the spectrogram during panning.
  // timeOffset is the x-pixel shift that aligns screen-space x=0 with absolute time=0.
  float timeSpan = max(0.000001, u_viewport.y - u_viewport.x);
  float timeOffset = u_viewport.x / timeSpan * u_canvasSize.x;
  vec2 contentCoord = vec2(gl_FragCoord.x + timeOffset, gl_FragCoord.y);

  float cellSize = 1.0 / u_dotFrequency;
  float cosA = u_dotRotCosSin.x;
  float sinA = u_dotRotCosSin.y;
  mat2 rot = mat2(cosA, -sinA, sinA, cosA);
  mat2 invRot = mat2(cosA, sinA, -sinA, cosA);

  vec2 rotatedCoord = rot * contentCoord * u_dotFrequency;
  vec2 cellIndex = floor(rotatedCoord);
  vec2 cellLocal = fract(rotatedCoord) - vec2(0.5);

  // Area-averaged cell energy
  float rawIntensity = sampleCellArea(cellIndex, cellSize, invRot, timeOffset);
  
  // Continuous normalized intensity
  float normIntensity = clamp((rawIntensity - u_minEnergyThreshold) / max(0.0001, 1.0 - u_minEnergyThreshold), 0.0, 1.0);
  float shapedArea = pow(normIntensity, u_energyGamma);
  float targetRadius = u_maxDotRadius * sqrt(shapedArea);

  // Colors
  vec4 backgroundColor = vec4(texture(u_colormap, vec2(0.0, 0.5)).rgb, u_backgroundOpacity);
  vec4 dotColor = texture(u_colormap, vec2(rawIntensity, 0.5));

  // Anti-aliasing width
  float aa = u_dotFrequency * u_dotSoftness;
  float dist = length(cellLocal);

  // Edge antialiasing: smooth falloff at the perimeter of the circle
  float edgeMask = 1.0 - smoothstep(targetRadius - aa, targetRadius + aa, dist);
  
  // Fade factor: smoothly vanishes tiny dots whose radius is smaller than the AA boundary
  float radiusFade = smoothstep(0.0, aa * 1.5, targetRadius);
  
  float dotMask = edgeMask * radiusFade;

  outColor = mix(backgroundColor, dotColor, dotMask);
}`;

export class HalftoneSpectrogramProgram extends NormalSpectrogramProgram {
  override readonly name = "halftone";
  private options: HalftoneOptions;

  constructor(gl: WebGL2RenderingContext, options: HalftoneOptions = {}) {
    super(gl, WEBGL2_HALFTONE_FRAGMENT_SHADER);
    this.options = options;
  }

  setOptions(options: HalftoneOptions): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): HalftoneOptions {
    return { ...this.options };
  }

  protected override setCustomUniforms(_input: RenderInput): void {
    const dotFrequency = this.options.dotFrequency ?? 0.24;
    const dotAngle = this.options.dotAngle ?? 45;
    const minEnergyThreshold = this.options.minEnergyThreshold ?? 0;
    const energyGamma = this.options.energyGamma ?? 1.4;
    const maxDotRadius = this.options.maxDotRadius ?? Math.SQRT1_2;
    const dotSoftness = this.options.dotSoftness ?? 0.75;
    const backgroundOpacity = this.options.backgroundOpacity ?? 1.0;

    const angleRad = (dotAngle * Math.PI) / 180;
    this.shader.uniform1f("u_dotFrequency", dotFrequency);
    this.shader.uniform2f(
      "u_dotRotCosSin",
      Math.cos(angleRad),
      Math.sin(angleRad),
    );
    this.shader.uniform1f("u_minEnergyThreshold", minEnergyThreshold);
    this.shader.uniform1f("u_energyGamma", energyGamma);
    this.shader.uniform1f("u_maxDotRadius", maxDotRadius);
    this.shader.uniform1f("u_dotSoftness", dotSoftness);
    this.shader.uniform1f("u_backgroundOpacity", backgroundOpacity);
  }
}

/**
 * Registers the Halftone WebGL2 shader program under the given name.
 * @param name Program name identifier (default: "halftone").
 * @param defaultOptions Default options applied when instantiating.
 */
export function registerHalftoneProgram(
  name = "halftone",
  defaultOptions?: HalftoneOptions,
): void {
  registerSpectrogramProgram(name, (gl, options) => {
    return new HalftoneSpectrogramProgram(gl, {
      ...defaultOptions,
      ...(options as HalftoneOptions),
    });
  });
}
