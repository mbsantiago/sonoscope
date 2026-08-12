import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerformanceProfiler } from './performance';
import { CanvasSpectrogramRenderer, pickNearestBin, pickNearestFrame } from './renderer';
import type { SpectrogramMatrix } from './types';

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as Partial<typeof globalThis>).devicePixelRatio;
});

function canvas(width: number, height: number, context: object): HTMLCanvasElement {
  return {
    width,
    height,
    getBoundingClientRect: () => ({ width, height }),
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
}

const matrix: SpectrogramMatrix = {
  channel: 0,
  timeStart: 0,
  timeEnd: 10,
  frameStart: 0,
  frameCount: 2,
  binCount: 2,
  sampleRate: 10,
  times: Float32Array.from([0, 10]),
  frequencies: Float32Array.from([0, 100]),
  magnitude: Float32Array.from([0, 1, 0.5, 0.25]),
};

function constantMatrix(timeStart: number, timeEnd: number, magnitude: number): SpectrogramMatrix {
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
    magnitude: Float32Array.from([magnitude]),
  };
}

describe('renderer helpers', () => {
  it('picks nearest frame and bin indexes', () => {
    expect(pickNearestFrame(Float32Array.from([0, 0.5, 1]), 0.6)).toBe(1);
    expect(pickNearestBin(Float32Array.from([100, 200, 300]), 260)).toBe(2);
  });

  it('renders the spectrogram raster in device pixels on high-DPR canvases', () => {
    globalThis.devicePixelRatio = 2;
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      createImageData: vi.fn((w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4), colorSpace: 'srgb' as const })),
      putImageData: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };
    const target = canvas(150, 80, context);

    new CanvasSpectrogramRenderer().render({
      canvas: target,
      viewport: { startTime: 0, endTime: 10, minFrequency: 0, maxFrequency: 100, frequencyScale: 'linear' },
      valueScale: { mode: 'magnitude', min: 0, max: 1, gamma: 1, clamp: true },
      colorMap: 'gray',
      tiles: [matrix],
      playheadTime: 5,
    });

    expect(target.width).toBe(300);
    expect(target.height).toBe(160);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.createImageData).toHaveBeenCalledWith(300, 160);
    expect(context.moveTo).toHaveBeenCalledWith(75, 0);
    expect(context.lineTo).toHaveBeenCalledWith(75, 80);
  });

  it('records paint timing when a profiler is provided', () => {
    let clock = 0;
    const profiler = new PerformanceProfiler(() => clock);
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(() => {
        clock += 1;
      }),
      createImageData: vi.fn((w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4), colorSpace: 'srgb' as const })),
      putImageData: vi.fn(() => {
        clock += 2;
      }),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };

    new CanvasSpectrogramRenderer().render({
      canvas: canvas(10, 10, context),
      viewport: { startTime: 0, endTime: 10, minFrequency: 0, maxFrequency: 100, frequencyScale: 'linear' },
      valueScale: { mode: 'magnitude', min: 0, max: 1, gamma: 1, clamp: true },
      colorMap: 'gray',
      tiles: [matrix],
      profile: profiler,
    });

    expect(profiler.measures().map((measure) => measure.name)).toContain('renderer.paint');
  });

  it('reuses high-DPR base frames only when CSS and device dimensions still match', () => {
    globalThis.devicePixelRatio = 1.5;
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      createImageData: vi.fn((w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4), colorSpace: 'srgb' as const })),
      putImageData: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };
    const target = canvas(101, 53, context);
    const renderer = new CanvasSpectrogramRenderer();
    const viewport = { startTime: 4, endTime: 8, minFrequency: 0, maxFrequency: 100, frequencyScale: 'linear' as const };

    renderer.render({ canvas: target, viewport, valueScale: { mode: 'magnitude', min: 0, max: 1, gamma: 1, clamp: true }, colorMap: 'gray', tiles: [matrix] });
    const rendered = renderer.renderPlayhead({ canvas: target, viewport, playheadTime: 5 });

    expect(rendered).toBe(true);
    expect(context.createImageData).toHaveBeenCalledWith(152, 80);
    expect(context.moveTo).toHaveBeenCalledWith(25.25, 0);
  });

  it('renders adjacent tile boundaries independent of tile order', () => {
    function renderData(tiles: SpectrogramMatrix[]): number[] {
      let data: Uint8ClampedArray | undefined;
      const context = {
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        createImageData: vi.fn((w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4), colorSpace: 'srgb' as const })),
        putImageData: vi.fn((image: ImageData) => {
          data = new Uint8ClampedArray(image.data);
        }),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
      };

      new CanvasSpectrogramRenderer().render({
        canvas: canvas(10, 1, context),
        viewport: { startTime: 0, endTime: 3, minFrequency: 0, maxFrequency: 1, frequencyScale: 'linear' },
        valueScale: { mode: 'magnitude', min: 0, max: 1, gamma: 1, clamp: true },
        colorMap: 'gray',
        tiles,
      });

      return Array.from(data!);
    }

    const dark = constantMatrix(0, 1, 0);
    const bright = constantMatrix(1, 2, 1);

    expect(renderData([dark, bright])).toEqual(renderData([bright, dark]));
  });
});
