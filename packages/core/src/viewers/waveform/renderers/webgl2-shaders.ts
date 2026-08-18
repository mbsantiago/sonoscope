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

export function compileWaveformShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Failed to create WebGL shader object");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info =
      gl.getShaderInfoLog(shader) || "Unknown shader compilation error";
    gl.deleteShader(shader);
    throw new Error(`WebGL shader compile failed: ${info}`);
  }

  return shader;
}

export function createWaveformProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
): WebGLProgram {
  const vs = compileWaveformShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileWaveformShader(gl, gl.FRAGMENT_SHADER, fsSource);

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error("Failed to create WebGL program object");
  }

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || "Unknown program link error";
    gl.deleteProgram(program);
    throw new Error(`WebGL program link failed: ${info}`);
  }

  return program;
}
