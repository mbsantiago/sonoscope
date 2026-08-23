import { createProgram } from "../../shared/webgl2-compile";

export const WEBGL2_WAVEFORM_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in float a_xNormalized;

uniform vec2 u_resolution;
uniform float u_amplitudeScale;

out float v_xNormalized;
out vec2 v_position;

void main() {
  v_xNormalized = a_xNormalized;
  v_position = a_position;

  // Map 0..width and 0..height to clip space -1.0 to 1.0 (Y-flipped for Canvas orientation)
  vec2 zeroToOne = a_position / u_resolution;
  vec2 zeroToTwo = zeroToOne * 2.0;
  vec2 clipSpace = zeroToTwo - 1.0;

  gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
}
`;

export const WEBGL2_WAVEFORM_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in float v_xNormalized;
in vec2 v_position;

uniform vec4 u_color;

out vec4 fragColor;

void main() {
  fragColor = u_color;
}
`;

export function createWaveformProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
): WebGLProgram {
  return createProgram(gl, vsSource, fsSource, "waveform");
}
