import { describe, expect, it, vi } from 'vitest';
import { DecodedAudioSource } from './source';
import { SpectrogramViewer } from './viewer';
import type { SpectrogramComputeBackend } from './backend';
import type { AudioSource, SpectrogramMatrix } from './types';

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

const highRateSource: AudioSource = {
  ...source,
  id: 'high-rate',
  sampleRate: 192_000,
};

function matrix(timeStart: number, timeEnd: number): SpectrogramMatrix {
  return {
    channel: 0,
    timeStart,
    timeEnd,
    frameStart: 0,
    frameCount: 1,
    binCount: 1,
    sampleRate: 10,
    times: Float32Array.from([timeStart]),
    frequencies: Float32Array.from([0]),
    magnitude: Float32Array.from([1]),
  };
}

describe('SpectrogramViewer', () => {
  it('defaults audio-only viewport max frequency to decoded source Nyquist', async () => {
    const fromUrl = vi.spyOn(DecodedAudioSource, 'fromUrl').mockResolvedValue(highRateSource as DecodedAudioSource);
    const audio = { src: 'test.wav', currentSrc: '', duration: 1, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as HTMLAudioElement;

    const viewer = await SpectrogramViewer.create({ canvas: canvas(), audio });

    expect(fromUrl).toHaveBeenCalledWith('test.wav');
    expect(viewer.getConfig().source).toBe(highRateSource);
    expect(viewer.getViewport().maxFrequency).toBe(96_000);
    fromUrl.mockRestore();
  });

  it('allows audio-only min frequency above fallback Nyquist when decoded source supports it', async () => {
    const fromUrl = vi.spyOn(DecodedAudioSource, 'fromUrl').mockResolvedValue(highRateSource as DecodedAudioSource);
    const audio = { src: 'test.wav', currentSrc: '', duration: 1, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as HTMLAudioElement;

    const viewer = await SpectrogramViewer.create({ canvas: canvas(), audio, viewport: { minFrequency: 30_000 } });

    expect(viewer.getViewport().minFrequency).toBe(30_000);
    expect(viewer.getViewport().maxFrequency).toBe(96_000);
    fromUrl.mockRestore();
  });

  it('preserves explicit audio-only viewport max frequency after decoding', async () => {
    const fromUrl = vi.spyOn(DecodedAudioSource, 'fromUrl').mockResolvedValue(highRateSource as DecodedAudioSource);
    const audio = { src: 'test.wav', currentSrc: '', duration: 1, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as HTMLAudioElement;

    const viewer = await SpectrogramViewer.create({ canvas: canvas(), audio, viewport: { maxFrequency: 24_000 } });

    expect(viewer.getViewport().maxFrequency).toBe(24_000);
    fromUrl.mockRestore();
  });

  it('renders and emits progress', async () => {
    const viewer = await SpectrogramViewer.create({ canvas: canvas(), source, viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 512 } });
    const progress: number[] = [];
    viewer.on('renderprogress', (event) => progress.push(event.progress));
    await viewer.render();
    expect(progress.at(-1)).toBe(1);
  });

  it('emits renderprofile measures for a render request', async () => {
    const viewer = await SpectrogramViewer.create({ canvas: canvas(), source, viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 512 } });
    const profiles: Array<{ requestId: string; generation: number; names: string[] }> = [];
    viewer.on('renderprofile', (event) => profiles.push({ requestId: event.requestId, generation: event.generation, names: event.measures.map((measure) => measure.name) }));

    await viewer.render();

    expect(profiles).toHaveLength(1);
    expect(profiles[0]!.generation).toBeGreaterThan(0);
    expect(profiles[0]!.names).toContain('render.total');
    expect(profiles[0]!.names).toContain('renderer.paint');
  });

  it('does not let an older render complete after a newer viewport render', async () => {
    let resolveFirst: ((value: SpectrogramMatrix) => void) | undefined;
    const backend: SpectrogramComputeBackend = {
      computeTile: (request) => {
        if (request.timeStart === 0) return new Promise((resolve) => { resolveFirst = resolve; });
        return Promise.resolve(matrix(request.timeStart, request.timeEnd));
      },
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: { ...source, duration: 10 },
      cache: { tileDurationSeconds: 1 },
      viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 512 },
      backend,
    });
    const completed: string[] = [];
    viewer.on('rendercomplete', (event) => completed.push(event.requestId));

    const first = viewer.render();
    viewer.setViewport({ startTime: 1, endTime: 2 });
    await viewer.render();
    resolveFirst!(matrix(0, 1));
    await first;

    expect(completed).toEqual(['render-2']);
  });

  it('starts visible tile requests concurrently', async () => {
    let running = 0;
    let maxRunning = 0;
    const backend: SpectrogramComputeBackend = {
      computeTile: async (request) => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await Promise.resolve();
        running -= 1;
        return matrix(request.timeStart, request.timeEnd);
      },
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: { ...source, duration: 4 },
      cache: { tileDurationSeconds: 1 },
      viewport: { startTime: 0, endTime: 4, minFrequency: 0, maxFrequency: 512 },
      backend,
    });

    await viewer.render();

    expect(maxRunning).toBeGreaterThan(1);
  });

  it('batches same-tick partial paints into a single render', async () => {
    const backend: SpectrogramComputeBackend = {
      computeTile: async (request) => {
        await Promise.resolve();
        return matrix(request.timeStart, request.timeEnd);
      },
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: { ...source, duration: 4 },
      cache: { tileDurationSeconds: 1 },
      viewport: { startTime: 0, endTime: 4, minFrequency: 0, maxFrequency: 512 },
      backend,
    });
    const renderer = (viewer as unknown as { renderer: { render: (input: unknown) => void } }).renderer;
    const render = vi.spyOn(renderer, 'render');

    await viewer.render();

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('prefetches bounded tiles around the viewport after rendering visible tiles', async () => {
    const requested: Array<[number, number]> = [];
    const backend: SpectrogramComputeBackend = {
      computeTile: (request) => {
        requested.push([request.timeStart, request.timeEnd]);
        return Promise.resolve(matrix(request.timeStart, request.timeEnd));
      },
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: { ...source, duration: 10 },
      cache: { tileDurationSeconds: 1, maxCachedTiles: 6, prefetchTiles: 2 },
      viewport: { startTime: 3, endTime: 5, minFrequency: 0, maxFrequency: 512 },
      backend,
    });

    await viewer.render();
    await Promise.resolve();

    expect(requested).toContainEqual([3, 4]);
    expect(requested).toContainEqual([4, 5]);
    expect(requested).toContainEqual([2, 3]);
    expect(requested).toContainEqual([5, 6]);
    expect(requested).toHaveLength(4);
  });

  it('starts prefetching surrounding tiles during the first visible render', async () => {
    const requested: Array<[number, number]> = [];
    const backend: SpectrogramComputeBackend = {
      computeTile: (request) => {
        requested.push([request.timeStart, request.timeEnd]);
        return new Promise(() => undefined);
      },
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: { ...source, duration: 10 },
      cache: { tileDurationSeconds: 1, maxCachedTiles: 6, prefetchTiles: 2 },
      viewport: { startTime: 3, endTime: 5, minFrequency: 0, maxFrequency: 512 },
      backend,
    });

    void viewer.render();
    await Promise.resolve();

    expect(requested).toContainEqual([3, 4]);
    expect(requested).toContainEqual([4, 5]);
    expect(requested).toContainEqual([2, 3]);
    expect(requested).toContainEqual([5, 6]);
  });

  it('does not prefetch when cached and pending tiles reach maxCachedTiles', async () => {
    let release: (() => void) | undefined;
    const requested: Array<[number, number]> = [];
    const backend: SpectrogramComputeBackend = {
      computeTile: (request) => {
        requested.push([request.timeStart, request.timeEnd]);
        if (request.timeStart >= 2) return new Promise((resolve) => { release = () => resolve(matrix(request.timeStart, request.timeEnd)); });
        return Promise.resolve(matrix(request.timeStart, request.timeEnd));
      },
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: { ...source, duration: 10 },
      cache: { tileDurationSeconds: 1, maxCachedTiles: 2, prefetchTiles: 4 },
      viewport: { startTime: 0, endTime: 2, minFrequency: 0, maxFrequency: 512 },
      backend,
    });

    await viewer.render();
    await Promise.resolve();

    expect(requested).toEqual([[0, 1], [1, 2]]);
    release?.();
  });

  it('reports computed, computing, and uncomputed tile states', async () => {
    let release: (() => void) | undefined;
    const backend: SpectrogramComputeBackend = {
      computeTile: (request) => {
        if (request.timeStart === 0) return new Promise((resolve) => { release = () => resolve(matrix(request.timeStart, request.timeEnd)); });
        return Promise.resolve(matrix(request.timeStart, request.timeEnd));
      },
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: { ...source, duration: 3 },
      cache: { tileDurationSeconds: 1, maxCachedTiles: 4, prefetchTiles: 0 },
      viewport: { startTime: 0, endTime: 1, minFrequency: 0, maxFrequency: 512 },
      backend,
    });

    expect(viewer.getTileStates().map((tile) => tile.state)).toEqual(['uncomputed', 'uncomputed', 'uncomputed']);

    const render = viewer.render();
    await Promise.resolve();
    expect(viewer.getTileStates().map((tile) => tile.state)).toEqual(['computing', 'uncomputed', 'uncomputed']);

    release!();
    await render;
    expect(viewer.getTileStates().map((tile) => tile.state)).toEqual(['computed', 'uncomputed', 'uncomputed']);
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
