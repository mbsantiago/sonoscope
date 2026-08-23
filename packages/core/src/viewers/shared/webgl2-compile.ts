type WebGL2ErrorStyle = "spectrogram" | "waveform";

export function numberedSource(source: string): string {
  return source
    .split("\n")
    .map((line, index) => `${String(index + 1).padStart(3, " ")}: ${line}`)
    .join("\n");
}

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  style: WebGL2ErrorStyle,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error(
      style === "spectrogram"
        ? "Unable to create WebGL2 shader"
        : "Failed to create WebGL shader object",
    );
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;

  const info = gl.getShaderInfoLog(shader);
  gl.deleteShader(shader);
  if (style === "waveform") {
    throw new Error(
      `WebGL shader compile failed: ${info || "Unknown shader compilation error"}`,
    );
  }

  const kind =
    type === gl.VERTEX_SHADER
      ? "vertex"
      : type === gl.FRAGMENT_SHADER
        ? "fragment"
        : "unknown";
  throw new Error(
    `Unable to compile WebGL2 ${kind} shader: ${info?.trim() || "unknown shader error"}\n${numberedSource(source)}`,
  );
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  style: WebGL2ErrorStyle,
): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource, style);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, style);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error(
      style === "spectrogram"
        ? "Unable to create WebGL2 program"
        : "Failed to create WebGL program object",
    );
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;

  const info = gl.getProgramInfoLog(program);
  gl.deleteProgram(program);
  throw new Error(
    style === "spectrogram"
      ? `Unable to link WebGL2 program: ${info ?? "unknown program error"}`
      : `WebGL program link failed: ${info || "Unknown program link error"}`,
  );
}
