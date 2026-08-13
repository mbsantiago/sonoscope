import { describe, expect, it, vi } from 'vitest';
import { CanvasSpectrogramRenderer } from './renderer';
import { createSpectrogramRenderer } from './renderer-factory';

function canvas(context: unknown = null): HTMLCanvasElement {
  return { getContext: vi.fn(() => context) } as unknown as HTMLCanvasElement;
}

function webgl2(): WebGL2RenderingContext {
  const shader = {} as WebGLShader;
  const program = {} as WebGLProgram;
  const buffer = {} as WebGLBuffer;
  const texture = {} as WebGLTexture;
  const uniform = {} as WebGLUniformLocation;
  return {
    ARRAY_BUFFER: 0x8892,
    COMPILE_STATUS: 0x8b81,
    FRAGMENT_SHADER: 0x8b30,
    LINK_STATUS: 0x8b82,
    STATIC_DRAW: 0x88e4,
    VERTEX_SHADER: 0x8b31,
    createShader: vi.fn(() => shader),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => program),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(),
    deleteProgram: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => uniform),
    createBuffer: vi.fn(() => buffer),
    createTexture: vi.fn(() => texture),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    texImage2D: vi.fn(),
    getExtension: vi.fn(),
  } as unknown as WebGL2RenderingContext;
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

  it('creates webgl2 renderer when webgl2 is available', () => {
    const gl = webgl2();
    const renderer = createSpectrogramRenderer(canvas(gl), 'webgl2');

    expect(renderer.kind).toBe('webgl2');
  });
});
