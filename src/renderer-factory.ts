import {
  CanvasSpectrogramRenderer,
  type SpectrogramRenderer,
} from "./renderers/canvas";
import { WebGL2SpectrogramRenderer } from "./renderers/webgl2";
import type { RendererMode } from "./types";

export function createSpectrogramRenderer(
  canvas: HTMLCanvasElement,
  mode: RendererMode,
): SpectrogramRenderer {
  const webglMode = typeof mode === "object" && mode.type === "webgl";
  if (mode === "canvas2d") return new CanvasSpectrogramRenderer();
  try {
    const renderer = WebGL2SpectrogramRenderer.create(
      canvas,
      webglMode && typeof mode.program === "object" ? mode.program : undefined,
    );
    if (!renderer) {
      if (mode === "webgl" || mode === "webgl2" || webglMode)
        throw new Error(
          `WebGL renderer requested but WebGL2 is unavailable: ${WebGL2SpectrogramRenderer.diagnose(canvas) ?? "unknown reason"}`,
        );
      return new CanvasSpectrogramRenderer();
    }
    return renderer;
  } catch (error) {
    if (mode === "webgl" || mode === "webgl2" || webglMode) throw error;
    return new CanvasSpectrogramRenderer();
  }
}
