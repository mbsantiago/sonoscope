import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpectrogramComputeBackend } from "./backends/backend";
import * as sourceModule from "./sources/source";
import type { AudioSource, SpectrogramMatrix } from "./types";
import { SpectrogramViewer } from "./viewer";

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as Partial<typeof globalThis>).fetch;
  delete (globalThis as Partial<typeof globalThis>).AudioContext;
});

function canvas(): HTMLCanvasElement {
  return {
    width: 100,
    height: 100,
    getBoundingClientRect: () => ({ width: 100, height: 100 }),
    getContext: () => ({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      }),
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

function sizedCanvas(
  cssWidth: number,
  cssHeight: number,
  backingWidth = cssWidth,
  backingHeight = cssHeight,
): HTMLCanvasElement {
  return {
    width: backingWidth,
    height: backingHeight,
    getBoundingClientRect: () => ({ width: cssWidth, height: cssHeight }),
    getContext: () => ({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      }),
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
  id: "test",
  sampleRate: 1024,
  duration: 1,
  channelCount: 1,
  read: () =>
    Float32Array.from({ length: 1024 }, (_, i) =>
      Math.sin(2 * Math.PI * 128 * (i / 1024)),
    ),
};

const highRateSource: AudioSource = {
  ...source,
  id: "high-rate",
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

describe("SpectrogramViewer", () => {
  it("defaults audio-only viewport max frequency to decoded source Nyquist", async () => {
    const fromUrl = vi
      .spyOn(sourceModule, "createAudioSourceFromUrl")
      .mockResolvedValue(highRateSource);
    const audio = {
      src: "test.wav",
      currentSrc: "",
      duration: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    const viewer = await SpectrogramViewer.create({ canvas: canvas(), audio });

    expect(fromUrl).toHaveBeenCalledWith("test.wav");
    expect(viewer.getConfig().source).toBe(highRateSource);
    expect(viewer.getViewport().maxFrequency).toBe(96_000);
    fromUrl.mockRestore();
  });

  it("does not claim a 2d canvas context while audio-only sources decode", async () => {
    let release: (() => void) | undefined;
    const fromUrl = vi
      .spyOn(sourceModule, "createAudioSourceFromUrl")
      .mockReturnValue(
        new Promise((resolve) => {
          release = () => resolve(highRateSource);
        }),
      );
    const renderLoading = vi.spyOn(SpectrogramViewer, "renderLoading");
    const audio = {
      src: "test.wav",
      currentSrc: "",
      duration: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    const created = SpectrogramViewer.create({ canvas: canvas(), audio });
    await Promise.resolve();

    expect(renderLoading).not.toHaveBeenCalled();
    release?.();
    await created;
    fromUrl.mockRestore();
    renderLoading.mockRestore();
  });

  it("creates a worker-backed viewer from a URL with decoded viewport defaults", async () => {
    const renderLoading = vi.spyOn(SpectrogramViewer, "renderLoading");
    const audio = {
      src: "",
      currentSrc: "",
      duration: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(Uint8Array.from([1, 2, 3, 4]));
            controller.close();
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      }) as typeof fetch;
    globalThis.AudioContext = vi.fn(function AudioContext(this: {
      decodeAudioData: () => Promise<AudioBuffer>;
    }) {
      this.decodeAudioData = () =>
        Promise.resolve(highRateSource as unknown as AudioBuffer);
    }) as unknown as typeof AudioContext;
    const backend: SpectrogramComputeBackend = {
      computeTile: (request) =>
        Promise.resolve(matrix(request.timeStart, request.timeEnd)),
    };

    const viewer = await SpectrogramViewer.fromUrl({
      canvas: canvas(),
      audio,
      url: "test.wav",
      backend,
    });

    expect(audio.src).toBe("test.wav");
    expect(renderLoading).not.toHaveBeenCalled();
    expect(viewer.getRendererKind()).toBe("canvas2d");
    expect(viewer.getViewport()).toMatchObject({
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 96_000,
    });
    renderLoading.mockRestore();
  });

  it("creates viewer from a URL without an audio element", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(Uint8Array.from([1, 2, 3, 4]));
            controller.close();
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      }) as typeof fetch;
    globalThis.AudioContext = vi.fn(function AudioContext(this: {
      decodeAudioData: () => Promise<AudioBuffer>;
    }) {
      this.decodeAudioData = () =>
        Promise.resolve(highRateSource as unknown as AudioBuffer);
    }) as unknown as typeof AudioContext;

    const viewer = await SpectrogramViewer.fromUrl({
      canvas: canvas(),
      url: "test.wav",
    });

    expect(viewer.getSource()).toBeDefined();
    expect(viewer.getAudio()).toBeUndefined();
    expect(viewer.getConfig().source).toBeDefined();
    expect("audio" in viewer.getConfig()).toBe(false);
  });

  it("creates viewer from an audio element using fromAudio", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(Uint8Array.from([1, 2, 3, 4]));
            controller.close();
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      }) as typeof fetch;
    globalThis.AudioContext = vi.fn(function AudioContext(this: {
      decodeAudioData: () => Promise<AudioBuffer>;
    }) {
      this.decodeAudioData = () =>
        Promise.resolve(highRateSource as unknown as AudioBuffer);
    }) as unknown as typeof AudioContext;

    const audio = {
      src: "audio-elem.wav",
      currentSrc: "",
      duration: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    const viewer = await SpectrogramViewer.fromAudio({
      canvas: canvas(),
      audio,
    });

    expect(viewer.getAudio()).toBe(audio);
    expect(viewer.getSource()).toBeDefined();
  });

  it("creates viewer from an AudioSource using fromSource", async () => {
    const viewer = await SpectrogramViewer.fromSource({
      canvas: canvas(),
      source,
    });

    expect(viewer.getSource()).toBe(source);
    expect(viewer.getAudio()).toBeUndefined();
  });

  it("attaches and detaches companion audio element dynamically", async () => {
    const viewer = await SpectrogramViewer.fromSource({
      canvas: canvas(),
      source,
    });
    expect(viewer.getAudio()).toBeUndefined();

    const audio = {
      src: "sync.wav",
      currentSrc: "",
      duration: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    viewer.attachAudio(audio);
    expect(viewer.getAudio()).toBe(audio);
    expect(audio.addEventListener).toHaveBeenCalled();

    viewer.detachAudio();
    expect(viewer.getAudio()).toBeUndefined();
    expect(audio.removeEventListener).toHaveBeenCalled();
  });

  it("sets a new source on an existing viewer and resets source state", async () => {
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source,
      startTime: 0.2,
      endTime: 0.5,
      minFrequency: 100,
      maxFrequency: 400,
    });
    const nextSource = {
      ...source,
      id: "next",
      sampleRate: 2_000,
      duration: 20,
    };

    viewer.setSource(nextSource);

    expect(viewer.getConfig().source).toBe(nextSource);
    expect(viewer.getViewport()).toMatchObject({
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 1_000,
    });
    expect(
      viewer.getTileStates().every((tile) => tile.state === "uncomputed"),
    ).toBe(true);
  });

  it("exposes source and duration convenience accessors", async () => {
    const viewer = await SpectrogramViewer.create({ canvas: canvas(), source });

    expect(viewer.getSource()).toBe(source);
    expect(viewer.getDuration()).toBe(source.duration);
  });

  it("updates viewport and schedules a render", async () => {
    const viewer = await SpectrogramViewer.create({ canvas: canvas(), source });
    const requestRender = vi.spyOn(viewer, "requestRender");

    viewer.updateViewport({ startTime: 0.1, endTime: 0.6 });

    expect(viewer.getViewport()).toMatchObject({
      startTime: 0.1,
      endTime: 0.6,
    });
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it("updates config and schedules a render", async () => {
    const viewer = await SpectrogramViewer.create({ canvas: canvas(), source });
    const requestRender = vi.spyOn(viewer, "requestRender");

    viewer.updateConfig({ colorMap: "magma" });

    expect(viewer.getConfig().colorMap).toBe("magma");
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it("zooms time around an anchor and schedules a render", async () => {
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source,
      startTime: 0,
      endTime: 1,
    });
    const requestRender = vi.spyOn(viewer, "requestRender");

    viewer.zoomTime(0.5, 0.25);

    expect(viewer.getViewport()).toMatchObject({
      startTime: 0.125,
      endTime: 0.625,
    });
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it("does not schedule a render when time zoom is already clamped", async () => {
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source,
      startTime: 0,
      endTime: 1,
      maxViewportDuration: 1,
    });
    const requestRender = vi.spyOn(viewer, "requestRender");

    viewer.zoomTime(2, 0.25);

    expect(viewer.getViewport()).toMatchObject({ startTime: 0, endTime: 1 });
    expect(requestRender).not.toHaveBeenCalled();
  });

  it("loads a new source URL into an existing viewer", async () => {
    const audio = {
      src: "old.wav",
      currentSrc: "",
      duration: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      audio,
      source,
    });
    const renderLoading = vi.spyOn(SpectrogramViewer, "renderLoading");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(Uint8Array.from([1, 2, 3, 4]));
            controller.close();
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      }) as typeof fetch;
    globalThis.AudioContext = vi.fn(function AudioContext(this: {
      decodeAudioData: () => Promise<AudioBuffer>;
    }) {
      this.decodeAudioData = () =>
        Promise.resolve(highRateSource as unknown as AudioBuffer);
    }) as unknown as typeof AudioContext;

    await viewer.setSourceUrl("next.wav");

    expect(audio.src).toBe("next.wav");
    expect(renderLoading).not.toHaveBeenCalled();
    expect(viewer.getConfig().source?.sampleRate).toBe(192_000);
    renderLoading.mockRestore();
  });

  it("allows audio-only min frequency above fallback Nyquist when decoded source supports it", async () => {
    const fromUrl = vi
      .spyOn(sourceModule, "createAudioSourceFromUrl")
      .mockResolvedValue(highRateSource);
    const audio = {
      src: "test.wav",
      currentSrc: "",
      duration: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      audio,
      minFrequency: 30_000,
    });

    expect(viewer.getViewport().minFrequency).toBe(30_000);
    expect(viewer.getViewport().maxFrequency).toBe(96_000);
    fromUrl.mockRestore();
  });

  it("preserves explicit audio-only viewport max frequency after decoding", async () => {
    const fromUrl = vi
      .spyOn(sourceModule, "createAudioSourceFromUrl")
      .mockResolvedValue(highRateSource);
    const audio = {
      src: "test.wav",
      currentSrc: "",
      duration: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      audio,
      maxFrequency: 24_000,
    });

    expect(viewer.getViewport().maxFrequency).toBe(24_000);
    fromUrl.mockRestore();
  });

  it("creates with auto renderer when webgl2 is unavailable", async () => {
    const target = canvas();
    const viewer = await SpectrogramViewer.create({
      canvas: target,
      source,
      renderer: "auto",
    });

    expect(viewer.getConfig().renderer).toBe("auto");
  });

  it("renders and emits progress", async () => {
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
    });
    const progress: number[] = [];
    viewer.on("renderprogress", (event) => progress.push(event.progress));
    await viewer.render();
    expect(progress.at(-1)).toBe(1);
  });

  it("renders only the selected channel for stereo sources", async () => {
    const requested: number[] = [];
    const backend: SpectrogramComputeBackend = {
      computeTile: (request) => {
        requested.push(request.channel);
        return Promise.resolve({
          ...matrix(request.timeStart, request.timeEnd),
          channel: request.channel,
        });
      },
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: { ...source, channelCount: 2, duration: 2 },
      channel: 1,
      tileDuration: 1,
      maxCachedTiles: 8,
      prefetchTiles: 0,
      startTime: 0,
      endTime: 2,
      minFrequency: 0,
      maxFrequency: 512,
      backend,
    });

    await viewer.render();

    expect(requested).toEqual([1, 1]);
    expect(viewer.getTileStates().map((tile) => tile.channel)).toEqual([1, 1]);
  });

  it("emits renderprofile measures for a render request", async () => {
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
    });
    const profiles: Array<{
      requestId: string;
      generation: number;
      names: string[];
    }> = [];
    viewer.on("renderprofile", (event) =>
      profiles.push({
        requestId: event.requestId,
        generation: event.generation,
        names: event.measures.map((measure) => measure.name),
      }),
    );

    await viewer.render();

    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.generation).toBeGreaterThan(0);
    expect(profiles[0]?.names).toContain("render.total");
    expect(profiles[0]?.names).toContain("renderer.paint");
    expect(profiles[0]?.names).toContain("render.paint.count");
  });

  it("does not let an older render complete after a newer viewport render", async () => {
    let resolveFirst: ((value: SpectrogramMatrix) => void) | undefined;
    const backend: SpectrogramComputeBackend = {
      computeTile: (request) => {
        if (request.timeStart === 0)
          return new Promise((resolve) => {
            resolveFirst = resolve;
          });
        return Promise.resolve(matrix(request.timeStart, request.timeEnd));
      },
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: { ...source, duration: 10 },
      tileDuration: 1,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
      backend,
    });
    const completed: string[] = [];
    viewer.on("rendercomplete", (event) => completed.push(event.requestId));

    const first = viewer.render();
    viewer.setViewport({ startTime: 1, endTime: 2 });
    await viewer.render();
    resolveFirst?.(matrix(0, 1));
    await first;

    expect(completed).toEqual(["render-2"]);
  });

  it("starts visible tile requests concurrently", async () => {
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
      tileDuration: 1,
      startTime: 0,
      endTime: 4,
      minFrequency: 0,
      maxFrequency: 512,
      backend,
    });

    await viewer.render();

    expect(maxRunning).toBeGreaterThan(1);
  });

  it("paints placeholders while visible tiles are still loading", async () => {
    let releaseSecond: (() => void) | undefined;
    const backend: SpectrogramComputeBackend = {
      computeTile: async (request) => {
        if (request.timeStart === 1)
          await new Promise<void>((resolve) => {
            releaseSecond = resolve;
          });
        await Promise.resolve();
        return matrix(request.timeStart, request.timeEnd);
      },
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: { ...source, duration: 2 },
      tileDuration: 1,
      startTime: 0,
      endTime: 2,
      minFrequency: 0,
      maxFrequency: 512,
      backend,
    });
    const renderer = (
      viewer as unknown as { renderer: { render: (input: unknown) => void } }
    ).renderer;
    const render = vi.spyOn(renderer, "render");

    const rendered = viewer.render();
    await Promise.resolve();
    releaseSecond?.();
    await rendered;

    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[0]?.[0]).toMatchObject({
      placeholders: expect.any(Array),
    });
    expect(
      // biome-ignore lint/correctness/noUnsafeOptionalChaining: false positive
      (render.mock.calls[0]?.[0] as { placeholders: unknown[] }).placeholders
        .length,
    ).toBeGreaterThan(0);
    expect(render.mock.calls[1]?.[0]).toMatchObject({ placeholders: [] });
  });

  it("shows a loading overlay while visible tiles are computing", async () => {
    const backend: SpectrogramComputeBackend = {
      computeTile: () => new Promise(() => undefined),
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: { ...source, duration: 1 },
      tileDuration: 1,
      prefetchTiles: 0,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
      backend,
    });
    const renderer = (
      viewer as unknown as {
        renderer: { renderLoading: (input: unknown) => void };
      }
    ).renderer;
    const renderLoading = vi.spyOn(renderer, "renderLoading");

    void viewer.render();
    await Promise.resolve();

    expect(renderLoading).toHaveBeenCalledTimes(1);
  });

  it("prefetches bounded tiles around the viewport after rendering visible tiles", async () => {
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
      tileDuration: 1,
      maxCachedTiles: 6,
      prefetchTiles: 2,
      startTime: 3,
      endTime: 5,
      minFrequency: 0,
      maxFrequency: 512,
      backend,
    });

    await viewer.render();
    await Promise.resolve();

    expect(requested).toContainEqual([3, 4]);
    expect(requested).toContainEqual([4, 5]);
    expect(requested).toContainEqual([5, 6]);
    expect(requested).toContainEqual([6, 7]);
    expect(requested).toContainEqual([2, 3]);
    expect(requested).toContainEqual([1, 2]);
    expect(requested.slice(2, 6)).toEqual([
      [5, 6],
      [6, 7],
      [2, 3],
      [1, 2],
    ]);
  });

  it("starts prefetching surrounding tiles after visible render completes", async () => {
    const requested: Array<[number, number]> = [];
    let release: (() => void) | undefined;
    const backend: SpectrogramComputeBackend = {
      computeTile: (request) => {
        requested.push([request.timeStart, request.timeEnd]);
        if (request.timeStart === 3)
          return Promise.resolve(matrix(request.timeStart, request.timeEnd));
        if (request.timeStart === 4)
          return new Promise((resolve) => {
            release = () => resolve(matrix(request.timeStart, request.timeEnd));
          });
        return Promise.resolve(matrix(request.timeStart, request.timeEnd));
      },
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: { ...source, duration: 10 },
      tileDuration: 1,
      maxCachedTiles: 6,
      prefetchTiles: 2,
      startTime: 3,
      endTime: 5,
      minFrequency: 0,
      maxFrequency: 512,
      backend,
    });

    const render = viewer.render();
    await Promise.resolve();

    expect(requested).toContainEqual([3, 4]);
    expect(requested).toContainEqual([4, 5]);
    expect(requested).not.toContainEqual([2, 3]);
    expect(requested).not.toContainEqual([5, 6]);

    release?.();
    await render;

    expect(requested).toContainEqual([5, 6]);
    expect(requested).toContainEqual([6, 7]);
    expect(requested).toContainEqual([2, 3]);
    expect(requested).toContainEqual([1, 2]);
    expect(requested.slice(2, 6)).toEqual([
      [5, 6],
      [6, 7],
      [2, 3],
      [1, 2],
    ]);
  });

  it("prefetches around the viewport even when the cache is full", async () => {
    let release: (() => void) | undefined;
    const requested: Array<[number, number]> = [];
    const backend: SpectrogramComputeBackend = {
      computeTile: (request) => {
        requested.push([request.timeStart, request.timeEnd]);
        if (request.timeStart >= 2)
          return new Promise((resolve) => {
            release = () => resolve(matrix(request.timeStart, request.timeEnd));
          });
        return Promise.resolve(matrix(request.timeStart, request.timeEnd));
      },
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: { ...source, duration: 10 },
      tileDuration: 1,
      maxCachedTiles: 2,
      prefetchTiles: 4,
      startTime: 0,
      endTime: 2,
      minFrequency: 0,
      maxFrequency: 512,
      backend,
    });

    await viewer.render();
    await Promise.resolve();

    expect(requested.slice(0, 2)).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(viewer.getConfig().maxCachedTiles).toBeGreaterThan(2);
    expect(requested).toContainEqual([2, 3]);
    expect(requested).toContainEqual([3, 4]);
    release?.();
  });

  it("reports computed, computing, and uncomputed tile states", async () => {
    let release: (() => void) | undefined;
    const backend: SpectrogramComputeBackend = {
      computeTile: (request) => {
        if (request.timeStart === 0)
          return new Promise((resolve) => {
            release = () => resolve(matrix(request.timeStart, request.timeEnd));
          });
        return Promise.resolve(matrix(request.timeStart, request.timeEnd));
      },
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: { ...source, duration: 3 },
      tileDuration: 1,
      maxCachedTiles: 4,
      prefetchTiles: 0,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
      backend,
    });

    expect(viewer.getTileStates().map((tile) => tile.state)).toEqual([
      "uncomputed",
      "uncomputed",
      "uncomputed",
    ]);

    const render = viewer.render();
    await Promise.resolve();
    expect(viewer.getTileStates().map((tile) => tile.state)).toEqual([
      "computing",
      "uncomputed",
      "uncomputed",
    ]);

    release?.();
    await render;
    expect(viewer.getTileStates().map((tile) => tile.state)).toEqual([
      "computed",
      "uncomputed",
      "uncomputed",
    ]);
  });

  it("reports current and peak cache memory usage", async () => {
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: { ...source, duration: 10 },
      prefetchTiles: 0,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
      backend: {
        computeTile: (request) =>
          Promise.resolve(matrix(request.timeStart, request.timeEnd)),
      },
    });

    await viewer.render();

    expect(viewer.getCacheStats()).toMatchObject({ tiles: 1, peakTiles: 1 });
    expect(viewer.getCacheStats().bytes).toBeGreaterThan(0);
    expect(viewer.getCacheStats().peakBytes).toBeGreaterThanOrEqual(
      viewer.getCacheStats().bytes,
    );
  });

  it("rerenders when a streaming source reports a visible range is available", async () => {
    let rangeHandler:
      | ((range: { startTime: number; endTime: number }) => void)
      | undefined;
    const streamingSource: AudioSource = {
      ...source,
      duration: 2,
      onRangeAvailable: (handler) => {
        rangeHandler = handler;
        return () => {
          rangeHandler = undefined;
        };
      },
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: streamingSource,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
    });
    const render = vi.spyOn(viewer, "render").mockResolvedValue(undefined);

    rangeHandler?.({ startTime: 0.25, endTime: 0.5 });
    await Promise.resolve();

    expect(render).toHaveBeenCalledTimes(1);
  });

  it("does not rerender for streaming ranges outside the viewport", async () => {
    let rangeHandler:
      | ((range: { startTime: number; endTime: number }) => void)
      | undefined;
    const streamingSource: AudioSource = {
      ...source,
      duration: 4,
      onRangeAvailable: (handler) => {
        rangeHandler = handler;
        return () => {
          rangeHandler = undefined;
        };
      },
    };
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: streamingSource,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
    });
    const render = vi.spyOn(viewer, "render").mockResolvedValue(undefined);

    rangeHandler?.({ startTime: 2, endTime: 3 });
    await Promise.resolve();

    expect(render).not.toHaveBeenCalled();
  });

  it("queries a spectrum at a time point", async () => {
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
    });
    const spectrum = await viewer.querySpectrum({ time: 0.25, channel: 0 });
    expect(spectrum.values.frequency.length).toBeGreaterThan(0);
    expect(spectrum.values.magnitude?.length).toBe(
      spectrum.values.frequency.length,
    );
  });

  it("converts queryCanvasPoint from CSS pixels, not high-DPR backing pixels", async () => {
    const viewer = await SpectrogramViewer.create({
      canvas: sizedCanvas(250, 100, 500, 200),
      source: { ...source, duration: 10 },
      startTime: 7.5,
      endTime: 9,
      minFrequency: 0,
      maxFrequency: 500,
      maxViewportDuration: 10,
    });
    const queryPoint = vi.spyOn(viewer, "queryPoint").mockResolvedValue({
      time: 8.25,
      frequency: 250,
      frameIndex: 0,
      binIndex: 0,
      channel: 0,
    });

    await viewer.queryCanvasPoint({ x: 125, y: 50, channel: 0 });

    expect(queryPoint).toHaveBeenCalledWith({
      time: 8.25,
      frequency: 250,
      channel: 0,
    });
  });

  it("preserves viewport when non-viewport config changes", async () => {
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source,
      startTime: 0.1,
      endTime: 0.5,
      minFrequency: 100,
      maxFrequency: 400,
    });
    const viewport = { ...viewer.getViewport() };

    viewer.setConfig({ colorMap: "magma" });

    expect(viewer.getViewport()).toEqual(viewport);
  });

  it("preserves viewport when STFT config changes", async () => {
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source,
      startTime: 0.1,
      endTime: 0.5,
      minFrequency: 100,
      maxFrequency: 400,
    });
    const viewport = { ...viewer.getViewport() };

    viewer.setConfig({
      windowSize: 512,
      fftSize: 512,
      hopSize: 128,
      window: "hann",
    });

    expect(viewer.getViewport()).toEqual(viewport);
    expect(viewer.getConfig().windowSize).toBe(512);
    expect(viewer.getConfig().fftSize).toBe(512);
  });

  it("preserves cached tiles when render-only config changes", async () => {
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
    });
    await viewer.render();
    const before = viewer.getCacheStats().tiles;

    viewer.setConfig({
      colorMap: "magma",
      valueMode: "db",
      minValue: -80,
      maxValue: -5,
    });

    expect(before).toBeGreaterThan(0);
    expect(viewer.getCacheStats().tiles).toBe(before);
  });

  it("preserves cached tiles when only viewport changes", async () => {
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
    });
    await viewer.render();
    const before = viewer.getCacheStats().tiles;

    viewer.setViewport({
      startTime: 0.05,
      endTime: 0.95,
      frequencyScale: "mel",
    });

    expect(before).toBeGreaterThan(0);
    expect(viewer.getCacheStats().tiles).toBe(before);
  });

  it("clears cached tiles when tile-generating config changes", async () => {
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
    });
    await viewer.render();
    expect(viewer.getCacheStats().tiles).toBeGreaterThan(0);

    viewer.setConfig({
      windowSize: 512,
      fftSize: 512,
      hopSize: 128,
      window: "hann",
    });

    expect(viewer.getCacheStats().tiles).toBe(0);
  });

  it("preserves viewport bounds when setConfig receives a partial viewport", async () => {
    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source,
      startTime: 0.1,
      endTime: 0.5,
      minFrequency: 100,
      maxFrequency: 400,
    });

    viewer.setConfig({
      windowSize: 512,
      fftSize: 512,
      hopSize: 128,
      window: "hann",
      frequencyScale: "mel",
    });

    expect(viewer.getViewport()).toEqual({
      startTime: 0.1,
      endTime: 0.5,
      minFrequency: 100,
      maxFrequency: 400,
      frequencyScale: "mel",
    });
  });

  it("retains cached tiles across multiple sources in LRU cache", async () => {
    const sourceA: AudioSource = {
      id: "source-a",
      sampleRate: 1000,
      duration: 10,
      channelCount: 1,
      read: () => new Float32Array(1000),
    };
    const sourceB: AudioSource = {
      id: "source-b",
      sampleRate: 1000,
      duration: 10,
      channelCount: 1,
      read: () => new Float32Array(1000),
    };

    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: sourceA,
      startTime: 0,
      endTime: 2,
      minFrequency: 0,
      maxFrequency: 500,
    });

    await viewer.render();
    const cachedForA = viewer.getCacheStats().tiles;
    expect(cachedForA).toBeGreaterThan(0);

    viewer.setSource(sourceB);
    await viewer.render();
    expect(viewer.getCacheStats().tiles).toBeGreaterThan(cachedForA);

    // Switch back to source A
    viewer.setSource(sourceA);
    expect(viewer.getCacheStats().tiles).toBeGreaterThan(cachedForA);
  });

  it("reuses cached AudioSource on repeated setSourceUrl without refetching", async () => {
    const fromUrlSpy = vi
      .spyOn(sourceModule, "createAudioSourceFromUrl")
      .mockResolvedValue(source);

    const viewer = await SpectrogramViewer.fromUrl({
      canvas: canvas(),
      url: "cached-track.wav",
    });

    expect(fromUrlSpy).toHaveBeenCalledTimes(1);

    await viewer.setSourceUrl("cached-track.wav");
    expect(fromUrlSpy).toHaveBeenCalledTimes(1);
  });

  it("dynamically adjusts tile duration for ultra-high sample rate sources", async () => {
    const ultraHighRateSource: AudioSource = {
      id: "bat-ultrasonic-500k",
      sampleRate: 500_000,
      duration: 5,
      channelCount: 1,
      read: () => new Float32Array(500_000),
    };

    const viewer = await SpectrogramViewer.create({
      canvas: canvas(),
      source: ultraHighRateSource,
      hopSize: 128,
      tileDuration: 5,
      startTime: 0,
      endTime: 5,
    });

    await viewer.render();

    // 5s of 500kHz at hop 128 is ~19531 frames; with max 2048 frames/tile, it should be divided into ~10 tiles
    const stats = viewer.getCacheStats();
    expect(stats.tiles).toBeGreaterThanOrEqual(9);
  });
});
