import { describe, expect, it } from 'vitest';
import { CanvasSpectrogramRenderer, type RenderInput } from './canvas';
import { WEBGL2_FRAGMENT_SHADER, WEBGL2_TERRAIN_FRAGMENT_SHADER, WEBGL2_TERRAIN_VERTEX_SHADER, WEBGL2_VERTEX_SHADER, WebGL2SpectrogramRenderer } from './webgl2';
import type { SpectrogramMatrix } from '../types';
import { SpectrogramViewer } from '../viewer';

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
    expect(compileShader(gl, gl.VERTEX_SHADER, WEBGL2_TERRAIN_VERTEX_SHADER)).toBeUndefined();
    expect(compileShader(gl, gl.FRAGMENT_SHADER, WEBGL2_TERRAIN_FRAGMENT_SHADER)).toBeUndefined();
    expect(WebGL2SpectrogramRenderer.diagnose(canvas)).toBeUndefined();
  });

  it('renders visible 3d terrain pixels when the hidden superpower is enabled', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', { value: () => ({ width: 48, height: 32 }) });
    const gl = canvas.getContext('webgl2');
    if (!gl) return;
    const renderer = new WebGL2SpectrogramRenderer(gl);

    renderer.render({
      canvas,
      viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 100, frequencyScale: 'linear' },
      valueScale: { mode: 'magnitude', min: 0, max: 1, gamma: 1, clamp: true },
      colorMap: 'gray',
      tiles: [brightBandTile()],
      secretSpectrogram3d: true,
    });

    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    expect(pixels.some((value) => value > 64)).toBe(true);
    renderer.destroy();
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

  it('does not stretch the lowest frequency bin up the viewport', () => {
    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'getBoundingClientRect', { value: () => ({ width: 16, height: 16 }) });
    const gl = canvas.getContext('webgl2');
    if (!gl) return;
    const renderer = new WebGL2SpectrogramRenderer(gl);

    const input: RenderInput = {
      canvas,
      viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 100, frequencyScale: 'linear' },
      valueScale: { mode: 'magnitude', min: 0, max: 1, gamma: 1, clamp: true },
      colorMap: 'gray',
      tiles: [singleBrightBinTile(0)],
    };

    renderer.render(input);

    const webglPixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, webglPixels);
    renderer.destroy();

    const canvas2d = document.createElement('canvas');
    Object.defineProperty(canvas2d, 'getBoundingClientRect', { value: () => ({ width: 16, height: 16 }) });
    const context = canvas2d.getContext('2d');
    if (!context) return;
    new CanvasSpectrogramRenderer().render({ ...input, canvas: canvas2d });
    const canvasPixels = context.getImageData(0, 0, canvas2d.width, canvas2d.height).data;

    const webglRow = Math.floor(canvas.height * 0.5);
    const canvasRow = canvas2d.height - 1 - webglRow;
    expect(rowBrightness(webglPixels, canvas.width, webglRow)).toBeLessThanOrEqual(rowBrightness(canvasPixels, canvas2d.width, canvasRow) + 2);
  });

  it('renders log and mel frequency scales with WebGL2', () => {
    for (const frequencyScale of ['log', 'mel'] as const) {
      const canvas = document.createElement('canvas');
      Object.defineProperty(canvas, 'getBoundingClientRect', { value: () => ({ width: 16, height: 16 }) });
      const gl = canvas.getContext('webgl2');
      if (!gl) return;
      const renderer = new WebGL2SpectrogramRenderer(gl);

      renderer.render({
        canvas,
        viewport: { startTime: 0, endTime: 1, minFrequency: frequencyScale === 'log' ? 1 : 0, maxFrequency: 100, frequencyScale },
        valueScale: { mode: 'magnitude', min: 0, max: 1, gamma: 1, clamp: true },
        colorMap: 'gray',
        tiles: [brightBandTile()],
      });

      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      expect(pixels.some((value) => value > 64)).toBe(true);
      renderer.destroy();
    }
  });

  it('matches Canvas frequency warping for log and mel scales', () => {
    for (const frequencyScale of ['log', 'mel'] as const) {
      const canvas = document.createElement('canvas');
      Object.defineProperty(canvas, 'getBoundingClientRect', { value: () => ({ width: 32, height: 32 }) });
      const gl = canvas.getContext('webgl2');
      if (!gl) return;
      const renderer = new WebGL2SpectrogramRenderer(gl);
      const input: RenderInput = {
        canvas,
        viewport: { startTime: 0, endTime: 1, minFrequency: frequencyScale === 'log' ? 1 : 0, maxFrequency: 100, frequencyScale },
        valueScale: { mode: 'magnitude', min: 0, max: 1, gamma: 1, clamp: true },
        colorMap: 'gray',
        tiles: [brightBandTile()],
      };

      renderer.render(input);
      const webglPixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, webglPixels);
      renderer.destroy();

      const canvas2d = document.createElement('canvas');
      Object.defineProperty(canvas2d, 'getBoundingClientRect', { value: () => ({ width: 32, height: 32 }) });
      const context = canvas2d.getContext('2d');
      if (!context) return;
      new CanvasSpectrogramRenderer().render({ ...input, canvas: canvas2d });
      const canvasPixels = context.getImageData(0, 0, canvas2d.width, canvas2d.height).data;

      expect(meanRgbDifference(webglPixels, canvasPixels, canvas.width, canvas.height)).toBeLessThan(12);
    }
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

function singleBrightBinTile(brightBin: number): SpectrogramMatrix {
  const frameCount = 4;
  const binCount = 4;
  const magnitude = new Float32Array(frameCount * binCount);
  for (let frame = 0; frame < frameCount; frame++) magnitude[frame * binCount + brightBin] = 1;
  return {
    channel: 0,
    timeStart: 0,
    timeEnd: 1,
    frameStart: 0,
    frameCount,
    binCount,
    sampleRate: 200,
    times: Float32Array.from({ length: frameCount }, (_, index) => index / (frameCount - 1)),
    frequencies: Float32Array.from([0, 25, 50, 75]),
    magnitude,
  };
}

function rowBrightness(pixels: Uint8Array | Uint8ClampedArray, width: number, yFromBottom: number): number {
  let total = 0;
  for (let x = 0; x < width; x++) total += pixels[(yFromBottom * width + x) * 4]!;
  return total / width;
}

function meanRgbDifference(webglPixels: Uint8Array, canvasPixels: Uint8ClampedArray, width: number, height: number): number {
  let total = 0;
  let count = 0;
  for (let yFromBottom = 0; yFromBottom < height; yFromBottom++) {
    const canvasY = height - 1 - yFromBottom;
    for (let x = 0; x < width; x++) {
      const webglIndex = (yFromBottom * width + x) * 4;
      const canvasIndex = (canvasY * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        total += Math.abs(webglPixels[webglIndex + channel]! - canvasPixels[canvasIndex + channel]!);
        count += 1;
      }
    }
  }
  return total / count;
}
