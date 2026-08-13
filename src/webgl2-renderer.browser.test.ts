import { describe, expect, it } from 'vitest';
import { WEBGL2_FRAGMENT_SHADER, WEBGL2_VERTEX_SHADER, WebGL2SpectrogramRenderer } from './webgl2-renderer';
import type { SpectrogramMatrix } from './types';
import { SpectrogramViewer } from './viewer';

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
    const tile = brightBandTile();

    renderer.render({
      canvas,
      viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 100, frequencyScale: 'linear' },
      valueScale: { mode: 'magnitude', min: 0, max: 1, gamma: 1, clamp: true },
      colorMap: 'gray',
      tiles: [tile],
    });

    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    expect(pixels.some((value) => value > 64)).toBe(true);
    renderer.destroy();
  });

  it('uses webgl2 for fromUrl auto rendering after decode', async () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', { value: () => ({ width: 32, height: 16 }) });
    if (!canvas.getContext('webgl2')) return;

    const previousFetch = globalThis.fetch;
    const previousAudioContext = globalThis.AudioContext;
    globalThis.fetch = async () => new Response(new ArrayBuffer(8));
    globalThis.AudioContext = class {
      decodeAudioData() {
        return Promise.resolve({ sampleRate: 1_000, duration: 1, numberOfChannels: 1, getChannelData: () => new Float32Array(1_000) });
      }
      close() {
        return Promise.resolve();
      }
    } as unknown as typeof AudioContext;
    try {
      const audio = document.createElement('audio');
      const viewer = await SpectrogramViewer.fromUrl({
        audio,
        canvas,
        url: '/test.wav',
        backend: { computeTile: async (request) => brightBandTile(request.timeStart, request.timeEnd) },
      });

      expect(viewer.getConfig().renderer).toBe('auto');
      expect(viewer.getRendererKind()).toBe('webgl2');
      viewer.destroy();
    } finally {
      globalThis.fetch = previousFetch;
      globalThis.AudioContext = previousAudioContext;
    }
  });
});

function brightBandTile(timeStart = 0, timeEnd = 1): SpectrogramMatrix {
  const frameCount = 8;
  const binCount = 8;
  const magnitude = new Float32Array(frameCount * binCount);
  for (let frame = 0; frame < frameCount; frame++) {
    for (let bin = 0; bin < binCount; bin++) {
      magnitude[frame * binCount + bin] = bin >= 3 && bin <= 5 ? 1 : 0;
    }
  }
  return {
      channel: 0,
      timeStart,
      timeEnd,
      frameStart: 0,
      frameCount,
      binCount,
      sampleRate: 10,
      times: Float32Array.from({ length: frameCount }, (_, index) => timeStart + (index / (frameCount - 1)) * (timeEnd - timeStart)),
      frequencies: Float32Array.from({ length: binCount }, (_, index) => (index / (binCount - 1)) * 100),
      magnitude,
    };
}
