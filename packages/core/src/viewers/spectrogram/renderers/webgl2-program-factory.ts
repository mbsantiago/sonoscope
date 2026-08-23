import type { RendererMode, WebGLRendererProgramName } from "../types";
import type { WebGL2RenderProgram } from "./webgl2-program";
import { isUsableWebGL2Context } from "../../shared/webgl2-compile";
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

/**
 * Resolves a renderer mode into a program spec: either an explicit program
 * instance or the name of a built-in program to construct.
 */
export function programSpecForMode(mode: RendererMode): {
  program?: WebGL2RenderProgram;
  name?: WebGLRendererProgramName;
} {
  if (typeof mode === "object" && mode !== null && "program" in mode) {
    if (typeof mode.program === "object") return { program: mode.program };
    if (mode.program !== undefined) return { name: mode.program };
  }
  return { name: resolveProgramName(mode) };
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

  const spec = programSpecForMode(mode);
  if (spec.program) return spec.program;
  return createSpectrogramProgram(gl, spec.name ?? "normal");
}

function resolveProgramName(mode: RendererMode): WebGLRendererProgramName {
  if (mode === "halftone" || mode === "terrain" || mode === "normal") {
    return mode;
  }
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
