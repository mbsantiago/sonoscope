import type { SpectrogramMatrix } from "../types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pickNearestBin, pickNearestFrame } from "../spectrogram-sampling";
import { CanvasSpectrogramRenderer } from "./canvas";

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as Partial<typeof globalThis>).devicePixelRatio;
});

function canvas(
  width: number,
  height: number,
  context: object,
): HTMLCanvasElement {
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

function constantMatrix(
  timeStart: number,
  timeEnd: number,
  magnitude: number,
): SpectrogramMatrix {
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

describe("renderer helpers", () => {
  it("picks nearest frame and bin indexes", () => {
    expect(pickNearestFrame(Float32Array.from([0, 0.5, 1]), 0.6)).toBe(1);
    expect(pickNearestBin(Float32Array.from([100, 200, 300]), 260)).toBe(2);
  });

  it("renders the spectrogram raster to canvas dimensions without mutating canvas size", () => {
    const context = {
      clearRect: vi.fn(),
      createImageData: vi.fn((w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
        colorSpace: "srgb" as const,
      })),
      putImageData: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
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
      viewport: {
        startTime: 0,
        endTime: 10,
        minFrequency: 0,
        maxFrequency: 100,
      },
      frequencyScale: "linear",
      valueScale: { mode: "magnitude", min: 0, max: 1, gamma: 1, clamp: true },
      colorMap: "gray",
      tiles: [matrix],
      playheadTime: 5,
    });

    expect(target.width).toBe(150);
    expect(target.height).toBe(80);
    expect(context.createImageData).toHaveBeenCalledWith(150, 80);
  });

  it("reuses the image buffer for repeated paints at the same size", () => {
    const context = {
      clearRect: vi.fn(),
      createImageData: vi.fn((w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      })),
      putImageData: vi.fn(),
    };
    const renderer = new CanvasSpectrogramRenderer();
    const input = {
      canvas: canvas(32, 16, context),
      viewport: {
        startTime: 0,
        endTime: 1,
        minFrequency: 0,
        maxFrequency: 100,
      },
      frequencyScale: "linear" as const,
      valueScale: {
        mode: "magnitude" as const,
        min: 0,
        max: 1,
        gamma: 1,
        clamp: true,
      },
      colorMap: "gray" as const,
      tiles: [matrix],
    };

    renderer.render(input);
    renderer.render(input);

    expect(context.createImageData).toHaveBeenCalledTimes(1);
  });

  it("renders adjacent tile boundaries independent of tile order", () => {
    function renderData(tiles: SpectrogramMatrix[]): number[] {
      let data: Uint8ClampedArray | undefined;
      const context = {
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        createImageData: vi.fn((w: number, h: number) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4),
          colorSpace: "srgb" as const,
        })),
        putImageData: vi.fn((image: ImageData) => {
          data = new Uint8ClampedArray(image.data);
        }),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
      };

      new CanvasSpectrogramRenderer().render({
        canvas: canvas(10, 1, context),
        viewport: {
          startTime: 0,
          endTime: 3,
          minFrequency: 0,
          maxFrequency: 1,
        },
        frequencyScale: "linear",
        valueScale: {
          mode: "magnitude",
          min: 0,
          max: 1,
          gamma: 1,
          clamp: true,
        },
        colorMap: "gray",
        tiles,
      });

      return Array.from(data!);
    }

    const dark = constantMatrix(0, 1, 0);
    const bright = constantMatrix(1, 2, 1);

    expect(renderData([dark, bright])).toEqual(renderData([bright, dark]));
  });

  it("draws placeholders for missing tile ranges", () => {
    let data: Uint8ClampedArray | undefined;
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      createImageData: vi.fn((w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
        colorSpace: "srgb" as const,
      })),
      putImageData: vi.fn((image: ImageData) => {
        data = new Uint8ClampedArray(image.data);
      }),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };

    new CanvasSpectrogramRenderer().render({
      canvas: canvas(100, 20, context),
      viewport: {
        startTime: 0,
        endTime: 10,
        minFrequency: 0,
        maxFrequency: 100,
      },
      frequencyScale: "linear",
      valueScale: { mode: "magnitude", min: 0, max: 1, gamma: 1, clamp: true },
      colorMap: "gray",
      tiles: [constantMatrix(0, 2, 1)],
      placeholders: [{ timeStart: 2, timeEnd: 4 }],
    });

    expect(data).toBeDefined();
    const placeholderPixel = (0 * 100 + 24) * 4;
    const tilePixel = (0 * 100 + 0) * 4;
    expect(
      Array.from(data!.slice(placeholderPixel, placeholderPixel + 4)),
    ).toEqual([71, 85, 105, 255]);
    expect(data?.[tilePixel + 3]).toBe(255);
  });
});
