import { describe, expect, it } from 'vitest';
import { WEBGL2_FRAGMENT_SHADER, WEBGL2_VERTEX_SHADER } from './webgl2-renderer';

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
  });
});
