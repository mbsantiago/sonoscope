import type { RenderInput } from "./canvas";
import { NormalSpectrogramProgram } from "./webgl2-normal-program";

export const WEBGL2_DITHER_FRAGMENT_SHADER = `#version 300 es
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

uniform float u_dotFrequency;
uniform float u_minEnergyThreshold;
uniform float u_energyGamma;

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
    max(0.0, u_tileSize.x - 1.0)
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

// 5-tap area integration over the cell bounds
float sampleCellArea(vec2 cellIndex, float cellSize, mat2 invRot) {
  vec2 c0 = (cellIndex + vec2(0.50, 0.50)) * cellSize;
  vec2 c1 = (cellIndex + vec2(0.25, 0.25)) * cellSize;
  vec2 c2 = (cellIndex + vec2(0.75, 0.25)) * cellSize;
  vec2 c3 = (cellIndex + vec2(0.25, 0.75)) * cellSize;
  vec2 c4 = (cellIndex + vec2(0.75, 0.75)) * cellSize;

  float v0 = sampleSpectrogram(invRot * c0);
  float v1 = sampleSpectrogram(invRot * c1);
  float v2 = sampleSpectrogram(invRot * c2);
  float v3 = sampleSpectrogram(invRot * c3);
  float v4 = sampleSpectrogram(invRot * c4);

  return v0 * 0.36 + (v1 + v2 + v3 + v4) * 0.16;
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

  // Viewport time boundary clipping
  float globalX = gl_FragCoord.x / max(1.0, u_canvasSize.x);
  float time = mix(u_viewport.x, u_viewport.y, globalX);
  if (time < u_tileTimeRange.x || time > u_tileTimeRange.y) {
    discard;
  }

  float dotFrequency = u_dotFrequency > 0.0 ? u_dotFrequency : 0.16;
  float minEnergyThreshold = u_minEnergyThreshold >= 0.0 ? u_minEnergyThreshold : 0.05;
  float energyGamma = u_energyGamma > 0.0 ? u_energyGamma : 2.8;

  // Halftone grid configuration
  float cellSize = 1.0 / dotFrequency;
  const float cosA = 0.70710678;
  const float sinA = 0.70710678;
  mat2 rot = mat2(cosA, -sinA, sinA, cosA);
  mat2 invRot = mat2(cosA, sinA, -sinA, cosA);

  vec2 rotatedCoord = rot * gl_FragCoord.xy * dotFrequency;
  vec2 cellIndex = floor(rotatedCoord);
  vec2 cellLocal = fract(rotatedCoord) - vec2(0.5);

  // Area-averaged cell energy
  float rawIntensity = sampleCellArea(cellIndex, cellSize, invRot);
  
  // Continuous normalized intensity without early returns
  float normIntensity = clamp((rawIntensity - minEnergyThreshold) / max(0.0001, 1.0 - minEnergyThreshold), 0.0, 1.0);
  float shapedArea = pow(normIntensity, energyGamma);
  float targetRadius = 0.7071 * sqrt(shapedArea);

  // Colors
  vec4 backgroundColor = texture(u_colormap, vec2(0.0, 0.5));
  vec4 dotColor = texture(u_colormap, vec2(rawIntensity, 0.5));

  // Constant analytical anti-aliasing width (1 pixel in cell-space)
  float aa = dotFrequency * 0.75;
  float dist = length(cellLocal);

  // Edge antialiasing: smooth falloff at the perimeter of the circle
  float edgeMask = 1.0 - smoothstep(targetRadius - aa, targetRadius + aa, dist);
  
  // Fade factor: smoothly vanishes tiny dots whose radius is smaller than the AA boundary
  float radiusFade = smoothstep(0.0, aa * 1.5, targetRadius);
  
  float dotMask = edgeMask * radiusFade;

  outColor = mix(backgroundColor, dotColor, dotMask);
}`;

export class DitherSpectrogramProgram extends NormalSpectrogramProgram {
  constructor(gl: WebGL2RenderingContext) {
    super(gl, WEBGL2_DITHER_FRAGMENT_SHADER);
  }

  protected override setCustomUniforms(input: RenderInput): void {
    const dotFrequency = input.dither?.dotFrequency ?? 0.16;
    const minEnergyThreshold = input.dither?.minEnergyThreshold ?? 0.05;
    const energyGamma = input.dither?.energyGamma ?? 2.8;

    this.shader.uniform1f("u_dotFrequency", dotFrequency);
    this.shader.uniform1f("u_minEnergyThreshold", minEnergyThreshold);
    this.shader.uniform1f("u_energyGamma", energyGamma);
  }
}
