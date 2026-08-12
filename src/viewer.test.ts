import { describe, expect, it, vi } from 'vitest';
import { SpectrogramViewer } from './viewer';
import type { AudioSource } from './types';

function canvas(): HTMLCanvasElement {
  return {
    width: 100,
    height: 100,
    getBoundingClientRect: () => ({ width: 100, height: 100 }),
    getContext: () => ({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    }),
  } as unknown as HTMLCanvasElement;
}

function sizedCanvas(cssWidth: number, cssHeight: number, backingWidth = cssWidth, backingHeight = cssHeight): HTMLCanvasElement {
  return {
    width: backingWidth,
    height: backingHeight,
    getBoundingClientRect: () => ({ width: cssWidth, height: cssHeight }),
    getContext: () => ({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    }),
  } as unknown as HTMLCanvasElement;
}

const source: AudioSource = {
  id: 'test',
  sampleRate: 1024,
  duration: 1,
  channelCount: 1,
  read: () => Float32Array.from({ length: 1024 }, (_, i) => Math.sin(2 * Math.PI * 128 * (i / 1024))),
};

describe('SpectrogramViewer', () => {
  it('renders and emits progress', async () => {
    const viewer = await SpectrogramViewer.create({ canvas: canvas(), source, viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 512 } });
    const progress: number[] = [];
    viewer.on('renderprogress', (event) => progress.push(event.progress));
    await viewer.render();
    expect(progress.at(-1)).toBe(1);
  });

  it('queries a spectrum at a time point', async () => {
    const viewer = await SpectrogramViewer.create({ canvas: canvas(), source, viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 512 } });
    const spectrum = await viewer.querySpectrum({ time: 0.25, channel: 0 });
    expect(spectrum.values.frequency.length).toBeGreaterThan(0);
    expect(spectrum.values.magnitude?.length).toBe(spectrum.values.frequency.length);
  });

  it('converts queryCanvasPoint from CSS pixels, not high-DPR backing pixels', async () => {
    const viewer = await SpectrogramViewer.create({
      canvas: sizedCanvas(250, 100, 500, 200),
      source,
      viewport: { startTime: 7.5, endTime: 9, minFrequency: 0, maxFrequency: 500 },
    });
    const queryPoint = vi.spyOn(viewer, 'queryPoint').mockResolvedValue({ time: 8.25, frequency: 250, frameIndex: 0, binIndex: 0, channel: 0 });

    await viewer.queryCanvasPoint({ x: 125, y: 50, channel: 0 });

    expect(queryPoint).toHaveBeenCalledWith({ time: 8.25, frequency: 250, channel: 0 });
  });

  it('preserves viewport when non-viewport config changes', async () => {
    const viewer = await SpectrogramViewer.create({ canvas: canvas(), source, viewport: { startTime: 0.1, endTime: 0.5, minFrequency: 100, maxFrequency: 400 } });
    const viewport = { ...viewer.getViewport() };

    viewer.setConfig({ colorMap: 'magma' });

    expect(viewer.getViewport()).toEqual(viewport);
  });

  it('preserves viewport when STFT config changes', async () => {
    const viewer = await SpectrogramViewer.create({ canvas: canvas(), source, viewport: { startTime: 0.1, endTime: 0.5, minFrequency: 100, maxFrequency: 400 } });
    const viewport = { ...viewer.getViewport() };

    viewer.setConfig({ stft: { windowSize: 512, fftSize: 512, hopSize: 128, window: 'hann' } });

    expect(viewer.getViewport()).toEqual(viewport);
    expect(viewer.getConfig().stft.windowSize).toBe(512);
    expect(viewer.getConfig().stft.fftSize).toBe(512);
  });

  it('preserves viewport bounds when setConfig receives a partial viewport', async () => {
    const viewer = await SpectrogramViewer.create({ canvas: canvas(), source, viewport: { startTime: 0.1, endTime: 0.5, minFrequency: 100, maxFrequency: 400 } });

    viewer.setConfig({ stft: { windowSize: 512, fftSize: 512, hopSize: 128, window: 'hann' }, viewport: { frequencyScale: 'mel' } });

    expect(viewer.getViewport()).toEqual({ startTime: 0.1, endTime: 0.5, minFrequency: 100, maxFrequency: 400, frequencyScale: 'mel' });
  });
});
