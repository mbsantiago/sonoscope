import type { WaveformRenderer, WaveformRendererMode } from "../types";
import { BarsWaveformRenderer } from "./bars";
import { CanvasWaveformRenderer } from "./canvas";
import { WebGL2WaveformRenderer } from "./webgl2";

export function createWaveformRenderer(
  mode?: WaveformRendererMode | undefined,
): WaveformRenderer {
  if (!mode || mode === "canvas2d") {
    return new CanvasWaveformRenderer();
  }

  if (typeof mode === "object") {
    if (
      "render" in mode &&
      typeof (mode as WaveformRenderer).render === "function"
    ) {
      return mode as WaveformRenderer;
    }

    if ("type" in mode) {
      if (mode.type === "canvas2d") {
        return new CanvasWaveformRenderer();
      }

      if (mode.type === "webgl2") {
        return new WebGL2WaveformRenderer();
      }

      if (mode.type === "bars" || mode.type === "segmented-bars") {
        const { type: _type, ...options } = mode;
        return new BarsWaveformRenderer(options);
      }
    }
  }

  if (mode === "webgl2") {
    return new WebGL2WaveformRenderer();
  }

  if (mode === "bars" || mode === "segmented-bars") {
    return new BarsWaveformRenderer();
  }

  return new CanvasWaveformRenderer();
}
