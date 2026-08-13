import { CanvasSpectrogramRenderer, type SpectrogramRenderer } from './renderer';
import type { RendererMode } from './types';

export function createSpectrogramRenderer(canvas: HTMLCanvasElement, mode: RendererMode): SpectrogramRenderer {
  if (mode === 'canvas2d') return new CanvasSpectrogramRenderer();
  const context = canvas.getContext('webgl2');
  if (!context) {
    if (mode === 'webgl2') throw new Error('WebGL2 renderer requested but WebGL2 is unavailable');
    return new CanvasSpectrogramRenderer();
  }
  return new CanvasSpectrogramRenderer();
}
