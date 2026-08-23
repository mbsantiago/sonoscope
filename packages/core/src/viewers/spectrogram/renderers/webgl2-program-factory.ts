import type { RendererMode, WebGLRendererProgramName } from "../types";
import type { WebGL2RenderProgram } from "./webgl2-program";
import { HalftoneSpectrogramProgram } from "./webgl2-halftone-program";
import { NormalSpectrogramProgram } from "./webgl2-normal-program";
import { TerrainSpectrogramProgram } from "./webgl2-terrain-program";

export function createSpectrogramProgram(
  gl: WebGL2RenderingContext,
  name: WebGLRendererProgramName,
): WebGL2RenderProgram {
  switch (name) {
    case "halftone":
      return new HalftoneSpectrogramProgram(gl);
    case "terrain":
      return new TerrainSpectrogramProgram(gl);
    case "normal":
      return new NormalSpectrogramProgram(gl);
  }
}

export function isUsableWebGL2Context(
  context: WebGL2RenderingContext,
): boolean {
  return (
    typeof context.createShader === "function" &&
    typeof context.createProgram === "function" &&
    typeof context.texImage2D === "function"
  );
}

/**
 * Resolves a renderer mode into a concrete shader program for the given
 * canvas. Returns undefined when the canvas has no usable WebGL2 context.
 */
export function createShaderProgram(
  canvas: HTMLCanvasElement,
  mode: RendererMode,
): WebGL2RenderProgram | undefined {
  const gl = canvas.getContext("webgl2");
  if (!gl || !isUsableWebGL2Context(gl)) return undefined;

  if (typeof mode === "object" && mode !== null && "program" in mode) {
    const program = mode.program;
    if (typeof program === "object") return program;
    if (program !== undefined) return createSpectrogramProgram(gl, program);
  }

  const name = resolveProgramName(mode);
  return createSpectrogramProgram(gl, name);
}

function resolveProgramName(mode: RendererMode): WebGLRendererProgramName {
  if (
    typeof mode === "object" &&
    mode !== null &&
    "type" in mode &&
    (mode.type === "normal" ||
      mode.type === "halftone" ||
      mode.type === "terrain")
  ) {
    return mode.type;
  }
  return "normal";
}
