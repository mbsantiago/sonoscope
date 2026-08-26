import type { RendererMode } from "../types";
import { CanvasSpectrogramRenderer, type SpectrogramRenderer } from "./canvas";
import { WebGL2SpectrogramRenderer } from "./webgl2";
import { createShaderProgram } from "./webgl2-program-factory";

function isCanvasMode(mode: RendererMode): boolean {
  return (
    mode === "canvas2d" ||
    (typeof mode === "object" && mode !== null && mode.type === "canvas2d")
  );
}

function isWebGLStrict(mode: RendererMode): boolean {
  if (isCanvasMode(mode)) return false;
  if (
    mode === "auto" ||
    (typeof mode === "object" && mode !== null && mode.type === "auto")
  ) {
    return false;
  }
  return true;
}

export function createSpectrogramRenderer(
  canvas: HTMLCanvasElement,
  mode: RendererMode,
): SpectrogramRenderer {
  if (isCanvasMode(mode)) return new CanvasSpectrogramRenderer();

  const strict = isWebGLStrict(mode);

  try {
    const program = createShaderProgram(canvas, mode);
    if (!program) {
      if (strict) {
        throw unavailableError(canvas);
      }
      return new CanvasSpectrogramRenderer();
    }

    const renderer = WebGL2SpectrogramRenderer.create(canvas, program);
    if (!renderer) {
      if (strict) {
        throw unavailableError(canvas);
      }
      return new CanvasSpectrogramRenderer();
    }
    return renderer;
  } catch (error) {
    if (strict) throw error;
    return new CanvasSpectrogramRenderer();
  }
}

function unavailableError(canvas: HTMLCanvasElement): Error {
  return new Error(
    `WebGL renderer requested but WebGL2 is unavailable: ${WebGL2SpectrogramRenderer.diagnose(canvas) ?? "unknown reason"}`,
  );
}
