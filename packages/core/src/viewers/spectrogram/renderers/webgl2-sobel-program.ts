import { NormalSpectrogramProgram } from "./webgl2-normal-program";
import {
  WEBGL2_FRAGMENT_UNIFORMS,
  WEBGL2_OVERLAY_CHECK,
  WEBGL2_SCALE_HELPERS,
} from "./webgl2-program";

export const WEBGL2_SOBEL_FRAGMENT_SHADER = `#version 300 es
precision highp float;

out vec4 outColor;

${WEBGL2_FRAGMENT_UNIFORMS}

${WEBGL2_SCALE_HELPERS}

float sampleTile(vec2 texelPosition) {
  ivec2 texel = ivec2(clamp(texelPosition, vec2(0.0), max(vec2(0.0), u_tileSize - 1.0)));
  return texelFetch(u_tile, texel, 0).r;
}

void main() {
  ${WEBGL2_OVERLAY_CHECK}
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
  float hopDuration = (u_tileTimeRange.y - u_tileTimeRange.x) / max(1.0, u_tileSize.x);
  float framePosition = clamp((time - u_tileTimeRange.x) / max(0.000001, hopDuration), 0.0, max(0.0, u_tileSize.x - 1.0));
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
