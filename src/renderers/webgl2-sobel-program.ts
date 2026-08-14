import { NormalSpectrogramProgram } from "./webgl2-normal-program";

export const WEBGL2_SOBEL_FRAGMENT_SHADER = `#version 300 es
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

float sampleTile(vec2 texelPosition) {
  ivec2 texel = ivec2(clamp(texelPosition, vec2(0.0), max(vec2(0.0), u_tileSize - 1.0)));
  return texelFetch(u_tile, texel, 0).r;
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
  vec2 p = vec2(framePosition, binPosition);

  float topLeft = sampleTile(p + vec2(-1.0, 1.0));
  float top = sampleTile(p + vec2(0.0, 1.0));
  float topRight = sampleTile(p + vec2(1.0, 1.0));
  float left = sampleTile(p + vec2(-1.0, 0.0));
  float right = sampleTile(p + vec2(1.0, 0.0));
  float bottomLeft = sampleTile(p + vec2(-1.0, -1.0));
  float bottom = sampleTile(p + vec2(0.0, -1.0));
  float bottomRight = sampleTile(p + vec2(1.0, -1.0));
  float gx = -topLeft - 2.0 * left - bottomLeft + topRight + 2.0 * right + bottomRight;
  float gy = topLeft + 2.0 * top + topRight - bottomLeft - 2.0 * bottom - bottomRight;
  float edge = clamp(length(vec2(gx, gy)) * 0.7, 0.0, 1.0);
  outColor = texture(u_colormap, vec2(edge, 0.5));
}`;

export class SobelSpectrogramProgram extends NormalSpectrogramProgram {
	constructor(gl: WebGL2RenderingContext) {
		super(gl, WEBGL2_SOBEL_FRAGMENT_SHADER);
	}
}
