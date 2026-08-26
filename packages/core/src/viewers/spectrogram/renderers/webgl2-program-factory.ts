import type { RendererMode, WebGLRendererProgramName } from "../types";
import type { WebGL2RenderProgram } from "./webgl2-program";
import {
  getRegisteredSpectrogramProgram,
  hasRegisteredSpectrogramProgram,
} from "../../../plugins/program-registry";
import { isUsableWebGL2Context } from "../../shared/webgl2-compile";
import { NormalSpectrogramProgram } from "./webgl2-normal-program";

export function createSpectrogramProgram(
  gl: WebGL2RenderingContext,
  mode: WebGLRendererProgramName | RendererMode | string,
): WebGL2RenderProgram {
  if (typeof mode === "object" && mode !== null && "program" in mode) {
    if (typeof mode.program === "object" && mode.program !== null) {
      return mode.program as WebGL2RenderProgram;
    }
  }
  const spec =
    typeof mode === "string" ? { name: mode } : programSpecForMode(mode);
  const name = spec.name ?? "normal";
  const options = typeof mode === "object" && mode !== null ? mode : {};

  const customFactory = getRegisteredSpectrogramProgram(name);
  if (customFactory) {
    return customFactory(gl, options as Record<string, unknown>);
  }

  return new NormalSpectrogramProgram(gl);
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
    if (typeof mode.program === "object" && mode.program !== null) {
      return { program: mode.program as WebGL2RenderProgram };
    }
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
    if (mode === "normal" || hasRegisteredSpectrogramProgram(mode)) {
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
        hasRegisteredSpectrogramProgram(mode.type)
      ) {
        return mode.type;
      }
    }
  }
  return "normal";
}
