import { describe, expect, it, vi } from 'vitest';
import { CanvasSpectrogramRenderer } from './renderer';
import { createSpectrogramRenderer } from './renderer-factory';

function canvas(context: unknown = null): HTMLCanvasElement {
  return { getContext: vi.fn(() => context) } as unknown as HTMLCanvasElement;
}

describe('createSpectrogramRenderer', () => {
  it('creates canvas renderer when requested', () => {
    expect(createSpectrogramRenderer(canvas(), 'canvas2d')).toBeInstanceOf(CanvasSpectrogramRenderer);
  });

  it('falls back to canvas renderer in auto mode when webgl2 is unavailable', () => {
    expect(createSpectrogramRenderer(canvas(null), 'auto')).toBeInstanceOf(CanvasSpectrogramRenderer);
  });

  it('throws when webgl2 is requested but unavailable', () => {
    expect(() => createSpectrogramRenderer(canvas(null), 'webgl2')).toThrow(/WebGL2/);
  });
});
