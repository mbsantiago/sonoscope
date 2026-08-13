import { NormalSpectrogramProgram } from './webgl2-normal-program';

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

float luma(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

float dither8x8(vec2 position, float brightness) {
  ivec2 p = ivec2(mod(position, 8.0));
  int index = p.x + p.y * 8;
  float limit = 0.0;
  if (index == 0) limit = 0.015625;
  if (index == 1) limit = 0.515625;
  if (index == 2) limit = 0.140625;
  if (index == 3) limit = 0.640625;
  if (index == 4) limit = 0.046875;
  if (index == 5) limit = 0.546875;
  if (index == 6) limit = 0.171875;
  if (index == 7) limit = 0.671875;
  if (index == 8) limit = 0.765625;
  if (index == 9) limit = 0.265625;
  if (index == 10) limit = 0.890625;
  if (index == 11) limit = 0.390625;
  if (index == 12) limit = 0.796875;
  if (index == 13) limit = 0.296875;
  if (index == 14) limit = 0.921875;
  if (index == 15) limit = 0.421875;
  if (index == 16) limit = 0.203125;
  if (index == 17) limit = 0.703125;
  if (index == 18) limit = 0.078125;
  if (index == 19) limit = 0.578125;
  if (index == 20) limit = 0.234375;
  if (index == 21) limit = 0.734375;
  if (index == 22) limit = 0.109375;
  if (index == 23) limit = 0.609375;
  if (index == 24) limit = 0.953125;
  if (index == 25) limit = 0.453125;
  if (index == 26) limit = 0.828125;
  if (index == 27) limit = 0.328125;
  if (index == 28) limit = 0.984375;
  if (index == 29) limit = 0.484375;
  if (index == 30) limit = 0.859375;
  if (index == 31) limit = 0.359375;
  if (index == 32) limit = 0.0625;
  if (index == 33) limit = 0.5625;
  if (index == 34) limit = 0.1875;
  if (index == 35) limit = 0.6875;
  if (index == 36) limit = 0.03125;
  if (index == 37) limit = 0.53125;
  if (index == 38) limit = 0.15625;
  if (index == 39) limit = 0.65625;
  if (index == 40) limit = 0.8125;
  if (index == 41) limit = 0.3125;
  if (index == 42) limit = 0.9375;
  if (index == 43) limit = 0.4375;
  if (index == 44) limit = 0.78125;
  if (index == 45) limit = 0.28125;
  if (index == 46) limit = 0.90625;
  if (index == 47) limit = 0.40625;
  if (index == 48) limit = 0.25;
  if (index == 49) limit = 0.75;
  if (index == 50) limit = 0.125;
  if (index == 51) limit = 0.625;
  if (index == 52) limit = 0.21875;
  if (index == 53) limit = 0.71875;
  if (index == 54) limit = 0.09375;
  if (index == 55) limit = 0.59375;
  if (index == 56) limit = 1.0;
  if (index == 57) limit = 0.5;
  if (index == 58) limit = 0.875;
  if (index == 59) limit = 0.375;
  if (index == 60) limit = 0.96875;
  if (index == 61) limit = 0.46875;
  if (index == 62) limit = 0.84375;
  if (index == 63) limit = 0.34375;
  return brightness < limit ? 0.0 : 1.0;
}

vec3 dither8x8(vec2 position, vec3 color) {
  return color * dither8x8(position, luma(color));
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

  float globalX = gl_FragCoord.x / max(1.0, u_canvasSize.x);
  float canvasY = 1.0 - gl_FragCoord.y / max(1.0, u_canvasSize.y);
  float time = mix(u_viewport.x, u_viewport.y, globalX);
  if (time < u_tileTimeRange.x || time > u_tileTimeRange.y) discard;
  float minScale = hzToScale(u_viewport.z, u_frequencyScale);
  float maxScale = hzToScale(u_viewport.w, u_frequencyScale);
  float frequency = scaleToHz(mix(maxScale, minScale, canvasY), u_frequencyScale);
  float frequencyStep = (u_tileFrequencyRange.y - u_tileFrequencyRange.x) / max(1.0, u_tileSize.y - 1.0);
  if (frequency > u_tileFrequencyRange.x && frequency <= u_tileFrequencyRange.x + frequencyStep * 0.5 + 0.000001) {
    outColor = texture(u_colormap, vec2(0.0, 0.5));
    return;
  }
  float framePosition = clamp((time - u_tileTimeRange.x) / max(0.000001, u_tileTimeRange.y - u_tileTimeRange.x) * max(1.0, u_tileSize.x - 1.0), 0.0, max(0.0, u_tileSize.x - 1.0));
  float binPosition = clamp((frequency - u_tileFrequencyRange.x) / max(0.000001, u_tileFrequencyRange.y - u_tileFrequencyRange.x) * max(1.0, u_tileSize.y - 1.0), 0.0, max(0.0, u_tileSize.y - 1.0));
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
  float normalized = mix(mix(low0, low1, frameFraction), mix(high0, high1, frameFraction), binFraction);
  vec4 color = texture(u_colormap, vec2(clamp(normalized, 0.0, 1.0), 0.5));
  outColor = vec4(dither8x8(gl_FragCoord.xy, color.rgb), color.a);
}`;

export class DitherSpectrogramProgram extends NormalSpectrogramProgram {
  constructor(gl: WebGL2RenderingContext) {
    super(gl, WEBGL2_DITHER_FRAGMENT_SHADER);
  }
}
