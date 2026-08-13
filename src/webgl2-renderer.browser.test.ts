import { describe, expect, it } from 'vitest';
import { WEBGL2_FRAGMENT_SHADER, WEBGL2_VERTEX_SHADER, WebGL2SpectrogramRenderer } from './webgl2-renderer';
import type { SpectrogramMatrix } from './types';

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): string | undefined {
  const shader = gl.createShader(type);
  if (!shader) return 'Unable to create shader';
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean;
  const log = gl.getShaderInfoLog(shader)?.trim();
  gl.deleteShader(shader);
  return ok ? undefined : log || 'unknown shader error';
}

describe('WebGL2 shaders', () => {
  it('compile in a real browser WebGL2 context', () => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return;

    expect(compileShader(gl, gl.VERTEX_SHADER, WEBGL2_VERTEX_SHADER)).toBeUndefined();
    expect(compileShader(gl, gl.FRAGMENT_SHADER, WEBGL2_FRAGMENT_SHADER)).toBeUndefined();
    expect(WebGL2SpectrogramRenderer.diagnose(canvas)).toBeUndefined();
  });

  it('renders visible spectrogram pixels', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', { value: () => ({ width: 32, height: 16 }) });
    const gl = canvas.getContext('webgl2');
    if (!gl) return;
    const renderer = new WebGL2SpectrogramRenderer(gl);
    const tile: SpectrogramMatrix = {
      channel: 0,
      timeStart: 0,
      timeEnd: 1,
      frameStart: 0,
      frameCount: 2,
      binCount: 2,
      sampleRate: 10,
      times: Float32Array.from([0, 1]),
      frequencies: Float32Array.from([0, 100]),
      magnitude: Float32Array.from([0, 1, 1, 0]),
    };

    renderer.render({
      canvas,
      viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 100, frequencyScale: 'linear' },
      valueScale: { mode: 'magnitude', min: 0, max: 1, gamma: 1, clamp: true },
      colorMap: 'gray',
      tiles: [tile],
    });

    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    expect(pixels.some((value) => value > 0)).toBe(true);
    renderer.destroy();
  });
});
