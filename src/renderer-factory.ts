import { CanvasSpectrogramRenderer, type SpectrogramRenderer } from './renderer';
import type { RendererMode } from './types';
import { WebGL2SpectrogramRenderer } from './webgl2-renderer';

export function createSpectrogramRenderer(canvas: HTMLCanvasElement, mode: RendererMode): SpectrogramRenderer {
  if (mode === 'canvas2d') return new CanvasSpectrogramRenderer();
  try {
    const renderer = WebGL2SpectrogramRenderer.create(canvas);
    if (!renderer) {
      if (mode === 'webgl2') throw new Error('WebGL2 renderer requested but WebGL2 is unavailable');
      return new CanvasSpectrogramRenderer();
    }
    return renderer;
  } catch (error) {
    if (mode === 'webgl2') throw error;
    return new CanvasSpectrogramRenderer();
  }
}
