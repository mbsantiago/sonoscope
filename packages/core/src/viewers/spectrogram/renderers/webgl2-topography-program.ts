import type { RenderInput } from "./canvas";
import { NormalSpectrogramProgram } from "./webgl2-normal-program";
import {
  WEBGL2_FRAGMENT_UNIFORMS,
  WEBGL2_OVERLAY_CHECK,
  WEBGL2_SCALE_HELPERS,
} from "./webgl2-program";

export const WEBGL2_TOPOGRAPHIC_FRAGMENT_SHADER = `#version 300 es
precision highp float;

out vec4 outColor;

${WEBGL2_FRAGMENT_UNIFORMS}

uniform float u_contourInterval;
uniform float u_contourLineWidth;
uniform float u_contourLineOpacity;
uniform float u_minEnergyThreshold;

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
    max(0.0, u_tileSize.x - 1.0)
  );

  // Convert to continuous UV coordinates and sample with hardware bilinear filter
  vec2 uv = vec2(
    (framePosition + 0.5) / max(1.0, u_tileSize.x),
    (binPosition + 0.5) / max(1.0, u_tileSize.y)
  );
  vec2 texel = 2.0 / max(vec2(1.0), u_tileSize);

  // 9-tap Gaussian blur over a 2-texel radius to eliminate noise floor speckles
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

  float raw = sampleSpectrogram(gl_FragCoord.xy);
  if (raw < u_minEnergyThreshold) {
    discard;
  }

  // Smooth fade-in near noise threshold to prevent broken jagged ring edges
  float noiseFade = smoothstep(u_minEnergyThreshold, u_minEnergyThreshold + 0.08, raw);

  // Normalized distance in screen-space pixel units
  float level = raw / max(0.0001, u_contourInterval);

  float dist = abs(fract(level - 0.5) - 0.5);
  float delta = fwidth(level);

  // Cull extreme spatial gradient spikes (speckle noise / sub-pixel islands)
  if (delta > 1.8) {
    discard;
  }

  float pixelDist = dist / max(0.0001, delta);
  float halfWidth = max(0.5, u_contourLineWidth * 0.5);
  float contourMask = 1.0 - smoothstep(halfWidth - 0.75, halfWidth + 0.75, pixelDist);

  if (contourMask <= 0.0) {
    discard;
  }

  // Color lines according to their quantized contour ring level
  float contourLevel = floor(level + 0.5) * u_contourInterval;
  vec4 lineColor = texture(u_colormap, vec2(clamp(contourLevel, 0.0, 1.0), 0.5));

  outColor = vec4(lineColor.rgb, contourMask * u_contourLineOpacity * noiseFade);
}`;

export class TopographicSpectrogramProgram extends NormalSpectrogramProgram {
  override readonly name = "topographic";

  constructor(gl: WebGL2RenderingContext) {
    super(gl, WEBGL2_TOPOGRAPHIC_FRAGMENT_SHADER);
  }

  protected override setCustomUniforms(input: RenderInput): void {
    const contourInterval = input.topographic?.contourInterval ?? 0.15;
    const contourLineWidth = input.topographic?.contourLineWidth ?? 1.0;
    const contourLineOpacity = input.topographic?.contourLineOpacity ?? 0.9;
    const minThreshold = input.topographic?.minEnergyThreshold ?? 0.14;

    this.shader.uniform1f("u_contourInterval", contourInterval);
    this.shader.uniform1f("u_contourLineWidth", contourLineWidth);
    this.shader.uniform1f("u_contourLineOpacity", contourLineOpacity);
    this.shader.uniform1f("u_minEnergyThreshold", minThreshold);
  }
}
