import type { WaveformRenderer, WaveformRendererMode } from "../types";
import {
  getRegisteredWaveformRenderer,
  hasRegisteredWaveformRenderer,
} from "../../../plugins/renderer-registry";
import { BarsWaveformRenderer } from "./bars";
import { CanvasWaveformRenderer } from "./canvas";
import { WebGL2WaveformRenderer } from "./webgl2";

export function createWaveformRenderer(
  mode?:
    | WaveformRendererMode
    | WaveformRenderer
    | string
    | ((canvas: HTMLCanvasElement) => WaveformRenderer)
    | undefined,
  canvas?: HTMLCanvasElement,
): WaveformRenderer {
  if (typeof mode === "function") {
    return mode(canvas ?? ({} as HTMLCanvasElement));
  }

  if (typeof mode === "string" && hasRegisteredWaveformRenderer(mode)) {
    return getRegisteredWaveformRenderer(mode)!(
      canvas ?? ({} as HTMLCanvasElement),
    );
  }

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

    if (
      "type" in mode &&
      typeof mode.type === "string" &&
      hasRegisteredWaveformRenderer(mode.type)
    ) {
      return getRegisteredWaveformRenderer(mode.type)!(
        canvas ?? ({} as HTMLCanvasElement),
        mode as Record<string, unknown>,
      );
    }

    if ("type" in mode) {
      if (mode.type === "canvas2d") {
        return new CanvasWaveformRenderer();
      }

      if (mode.type === "webgl2") {
        return new WebGL2WaveformRenderer();
      }

      if (mode.type === "bars") {
        const { type: _type, ...options } = mode;
        return new BarsWaveformRenderer(options);
      }
    }
  }

  if (mode === "webgl2") {
    return new WebGL2WaveformRenderer();
  }

  if (mode === "bars") {
    return new BarsWaveformRenderer();
  }

  return new CanvasWaveformRenderer();
}
