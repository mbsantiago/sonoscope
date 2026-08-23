import type { WebGLRendererProgramName } from "../types";
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
