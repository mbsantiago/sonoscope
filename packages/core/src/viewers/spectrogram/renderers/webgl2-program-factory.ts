import type {
  HalftoneOptions,
  RendererMode,
  TopographicOptions,
  WebGLRendererProgramName,
} from "../types";
import type { WebGL2RenderProgram } from "./webgl2-program";
import {
  getRegisteredSpectrogramProgram,
  hasRegisteredSpectrogramProgram,
} from "../../../plugins/program-registry";
import { isUsableWebGL2Context } from "../../shared/webgl2-compile";
import { HalftoneSpectrogramProgram } from "./webgl2-halftone-program";
import { NormalSpectrogramProgram } from "./webgl2-normal-program";
import { TerrainSpectrogramProgram } from "./webgl2-terrain-program";
import { TopographicSpectrogramProgram } from "./webgl2-topography-program";

export function createSpectrogramProgram(
  gl: WebGL2RenderingContext,
  mode: WebGLRendererProgramName | RendererMode | string,
): WebGL2RenderProgram {
  if (typeof mode === "object" && mode !== null && "program" in mode) {
    if (typeof mode.program === "object") return mode.program;
  }
  const spec =
    typeof mode === "string" ? { name: mode } : programSpecForMode(mode);
  const name = spec.name ?? "normal";
  const options = typeof mode === "object" && mode !== null ? mode : {};

  const customFactory = getRegisteredSpectrogramProgram(name);
  if (customFactory) {
    return customFactory(gl, options as Record<string, unknown>);
  }

  switch (name) {
    case "halftone":
      return new HalftoneSpectrogramProgram(gl, options as HalftoneOptions);
    case "terrain":
      return new TerrainSpectrogramProgram(gl);
    case "normal":
      return new NormalSpectrogramProgram(gl);
    case "topographic":
      return new TopographicSpectrogramProgram(
        gl,
        options as TopographicOptions,
      );
    default:
      return new NormalSpectrogramProgram(gl);
  }
}

/**
 * Resolves a renderer mode into a program spec: either an explicit program
 * instance or the name of a built-in program to construct.
 */
export function programSpecForMode(mode: RendererMode | string): {
  program?: WebGL2RenderProgram;
  name?: WebGLRendererProgramName | string;
} {
  if (typeof mode === "object" && mode !== null && "program" in mode) {
    if (typeof mode.program === "object") return { program: mode.program };
    if (typeof mode.program === "string")
      return { name: resolveProgramName(mode.program) };
  }
  return { name: resolveProgramName(mode) };
}

/**
 * Resolves a renderer mode into a concrete shader program for the given
 * canvas. Returns undefined when the canvas has no usable WebGL2 context.
 */
export function createShaderProgram(
  canvas: HTMLCanvasElement,
  mode: RendererMode | string,
): WebGL2RenderProgram | undefined {
  const gl = canvas.getContext("webgl2");
  if (!gl || !isUsableWebGL2Context(gl)) return undefined;

  const spec = programSpecForMode(mode);
  if (spec.program) return spec.program;
  return createSpectrogramProgram(
    gl,
    typeof mode === "object" ? mode : (spec.name ?? "normal"),
  );
}

function resolveProgramName(
  mode: RendererMode | string,
): WebGLRendererProgramName | string {
  if (typeof mode === "string") {
    if (
      mode === "halftone" ||
      mode === "terrain" ||
      mode === "normal" ||
      mode === "topographic" ||
      hasRegisteredSpectrogramProgram(mode)
    ) {
      return mode;
    }
  }
  if (typeof mode === "object" && mode !== null) {
    if ("program" in mode && typeof mode.program === "string") {
      return resolveProgramName(mode.program);
    }
    if ("type" in mode && typeof mode.type === "string") {
      if (
        mode.type === "normal" ||
        mode.type === "halftone" ||
        mode.type === "terrain" ||
        mode.type === "topographic" ||
        hasRegisteredSpectrogramProgram(mode.type)
      ) {
        return mode.type;
      }
    }
  }
  return "normal";
}
