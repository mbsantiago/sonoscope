import type {
  AudioSource,
  ISonoscope,
  IViewportController,
  ViewportControllerOptions,
} from "../../types";
import type {
  ComputeTileRequest,
  SpectrogramComputeBackend,
} from "./backends/backend";
import type { SpectrogramMatrix, SpectrogramOptions } from "./types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sonoscope } from "../../sonoscope";
import * as sourceModule from "../../sources/source";
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

const mockAudioBuffer = {
  sampleRate: 192_000,
  duration: 1,
  numberOfChannels: 1,
  length: 192_000,
  getChannelData: () => new Float32Array(192_000).fill(0.1),
} as unknown as AudioBuffer;

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

function createViewer(
  options: {
    canvas?: HTMLCanvasElement;
    source?: AudioSource;
    audio?: HTMLAudioElement;
    scope?: ISonoscope;
    viewport?: IViewportController;
  } & Partial<SpectrogramOptions> &
    Pick<
      ViewportControllerOptions,
      | "startTime"
      | "endTime"
      | "minFrequency"
      | "maxFrequency"
      | "minDuration"
      | "maxDuration"
    > = {},
): SpectrogramViewer & { scope: ISonoscope } {
  const c = options.canvas ?? canvas();
  const src = options.source ?? source;
  const sc =
    options.scope ??
    (options.audio
      ? new Sonoscope({
          source: src,
          audio: options.audio,
          startTime: options.startTime,
          endTime: options.endTime,
          minFrequency: options.minFrequency,
          maxFrequency: options.maxFrequency,
          minDuration: options.minDuration,
          maxDuration: options.maxDuration,
        })
      : new Sonoscope({
          source: src,
          startTime: options.startTime,
          endTime: options.endTime,
          minFrequency: options.minFrequency,
          maxFrequency: options.maxFrequency,
          minDuration: options.minDuration,
          maxDuration: options.maxDuration,
        }));
  const {
    canvas: _c,
    source: _src,
    audio: _aud,
    startTime: _st,
    endTime: _et,
    minFrequency: _minFrequency,
    maxFrequency: _maxFrequency,
    minDuration: _minDuration,
    maxDuration: _maxDuration,
    scope: _sc,
    viewport: _vp,
    ...specOptions
  } = options;
  const viewer = new SpectrogramViewer(
    c,
    options.viewport ?? sc.viewport,
    options.source ?? sc.source,
    specOptions,
  ) as SpectrogramViewer & { scope: ISonoscope };
  viewer.scope = sc;
  return viewer;
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

    const scope = await Sonoscope.fromAudio(audio);
    const viewer = new SpectrogramViewer(
      canvas(),
      scope.viewport,
      scope.source,
    );

    expect(fromUrl).toHaveBeenCalledWith("test.wav");
    expect(scope.source).toBe(highRateSource);
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
    const audio = {
      src: "test.wav",
      currentSrc: "",
      duration: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    const scopePromise = Sonoscope.fromAudio(audio);
    await Promise.resolve();

    release?.();
    const scope = await scopePromise;
    const viewer = new SpectrogramViewer(
      canvas(),
      scope.viewport,
      scope.source,
    );
    expect(viewer.getSource()).toBe(highRateSource);
    expect(viewer.getViewportController()).toBe(scope.viewport);
    fromUrl.mockRestore();
  });

  it("creates a worker-backed viewer from a URL with decoded viewport defaults", async () => {
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
      this.decodeAudioData = () => Promise.resolve(mockAudioBuffer);
    }) as unknown as typeof AudioContext;
    const backend: SpectrogramComputeBackend = {
      computeTile: (request) =>
        Promise.resolve(matrix(request.timeStart, request.timeEnd)),
    };

    const scope = await Sonoscope.fromUrl("test.wav", { audio });
    const viewer = new SpectrogramViewer(
      canvas(),
      scope.viewport,
      scope.source,
      {
        backend,
      },
    );

    expect(audio.src).toBe("test.wav");
    expect(viewer.getRendererKind()).toBe("canvas2d");
    expect(viewer.getViewport()).toMatchObject({
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 96_000,
    });
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
      this.decodeAudioData = () => Promise.resolve(mockAudioBuffer);
    }) as unknown as typeof AudioContext;

    const scope = await Sonoscope.fromUrl("test.wav");
    const viewer = new SpectrogramViewer(
      canvas(),
      scope.viewport,
      scope.source,
    );

    expect(scope.source).toBeDefined();
    expect(scope.getAudio()).toBeUndefined();
    expect(viewer.getCanvas()).toBeDefined();
    expect("source" in viewer.getConfig()).toBe(false);
    expect("canvas" in viewer.getConfig()).toBe(false);
    expect("audio" in viewer.getConfig()).toBe(false);
  });

  it("creates viewer from an audio element", async () => {
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
      this.decodeAudioData = () => Promise.resolve(mockAudioBuffer);
    }) as unknown as typeof AudioContext;

    const audio = {
      src: "audio-elem.wav",
      currentSrc: "",
      duration: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    const scope = await Sonoscope.fromAudio(audio);
    const viewer = new SpectrogramViewer(
      canvas(),
      scope.viewport,
      scope.source,
    );

    expect(viewer.getSource()).toBeDefined();
    expect(scope.getAudio()).toBe(audio);
    expect(scope.source).toBeDefined();
  });

  it("creates viewer from an AudioSource", async () => {
    const scope = Sonoscope.fromSource(source);
    const viewer = new SpectrogramViewer(
      canvas(),
      scope.viewport,
      scope.source,
    );

    expect(viewer.getSource()).toBe(source);
    expect(scope.source).toBe(source);
    expect(scope.getAudio()).toBeUndefined();
  });

  it("attaches and detaches companion audio element dynamically on Sonoscope", async () => {
    const scope = Sonoscope.fromSource(source);
    const viewer = new SpectrogramViewer(
      canvas(),
      scope.viewport,
      scope.source,
    );
    expect(scope.getAudio()).toBeUndefined();

    const audio = {
      src: "sync.wav",
      currentSrc: "",
      duration: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;

    scope.attachAudio(audio);
    expect(scope.getAudio()).toBe(audio);
    expect(audio.addEventListener).toHaveBeenCalled();

    scope.detachAudio();
    expect(scope.getAudio()).toBeUndefined();
    expect(audio.removeEventListener).toHaveBeenCalled();
    viewer.destroy();
    scope.destroy();
  });

  it("sets a new source on an existing scope and resets viewer source state", async () => {
    const scope = new Sonoscope({
      source,
      startTime: 0.2,
      endTime: 0.5,
      minFrequency: 100,
      maxFrequency: 400,
    });
    const viewer = new SpectrogramViewer(
      canvas(),
      scope.viewport,
      scope.source,
    );
    const nextSource = {
      ...source,
      id: "next",
      sampleRate: 2_000,
      duration: 20,
    };

    scope.setSource(nextSource);

    expect(scope.source).toBe(nextSource);
    expect(viewer.getViewport()).toMatchObject({
      startTime: 0.2,
      endTime: 0.5,
      minFrequency: 0,
      maxFrequency: 1000,
    });
    expect(
      viewer.getTileStates().every((tile) => tile.state === "uncomputed"),
    ).toBe(true);
  });

  it("exposes Nyquist convenience accessor", async () => {
    const scope = new Sonoscope({ source });
    const viewer = new SpectrogramViewer(
      canvas(),
      scope.viewport,
      scope.source,
    );

    expect(viewer.getNyquist()).toBe(source.sampleRate / 2);
  });

  it("updates viewport when scope updates and schedules a render", async () => {
    const viewer = createViewer({ canvas: canvas(), source });
    const requestRender = vi.spyOn(viewer, "requestRender");

    viewer.scope.setViewport({ startTime: 0.1, endTime: 0.6 });

    expect(viewer.getViewport()).toMatchObject({
      startTime: 0.1,
      endTime: 0.6,
    });
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it("updates config and schedules a render", async () => {
    const viewer = createViewer({ canvas: canvas(), source });
    const requestRender = vi.spyOn(viewer, "requestRender");

    viewer.updateConfig({ colorMap: "magma" });

    expect(viewer.getConfig().colorMap).toBe("magma");
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it("zooms time around an anchor and schedules a render", async () => {
    const viewer = createViewer({
      canvas: canvas(),
      source,
      startTime: 0,
      endTime: 1,
    });
    const requestRender = vi.spyOn(viewer, "requestRender");

    viewer.scope.zoom(0.5, 0.25);

    expect(viewer.getViewport()).toMatchObject({
      startTime: 0.125,
      endTime: 0.625,
    });
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it("does not schedule a render when time zoom is already clamped", async () => {
    const scope = new Sonoscope({
      source,
      startTime: 0,
      endTime: 1,
      maxDuration: 1,
    });
    const viewer = new SpectrogramViewer(
      canvas(),
      scope.viewport,
      scope.source,
    );
    const requestRender = vi.spyOn(viewer, "requestRender");

    scope.zoom(2, 0.25);

    expect(viewer.getViewport()).toMatchObject({ startTime: 0, endTime: 1 });
    expect(requestRender).not.toHaveBeenCalled();
  });

  it("zooms frequency around an anchor and schedules a render", async () => {
    const viewer = createViewer({
      canvas: canvas(),
      source,
      minFrequency: 0,
      maxFrequency: 400,
    });
    const requestRender = vi.spyOn(viewer, "requestRender");

    viewer.scope.zoomFreq(0.5, 200);

    expect(viewer.getViewport()).toMatchObject({
      minFrequency: 100,
      maxFrequency: 300,
    });
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it("zooms both time and frequency with a uniform factor", async () => {
    const viewer = createViewer({
      canvas: canvas(),
      source,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 400,
    });
    const requestRender = vi.spyOn(viewer, "requestRender");

    viewer.scope.zoomBoth(0.5, { time: 0.5, frequency: 200 });

    expect(viewer.getViewport()).toMatchObject({
      startTime: 0.25,
      endTime: 0.75,
      minFrequency: 100,
      maxFrequency: 300,
    });
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it("zooms both time and frequency with separate factors", async () => {
    const viewer = createViewer({
      canvas: canvas(),
      source,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 400,
    });

    viewer.scope.zoomBoth(
      { time: 0.5, frequency: 0.25 },
      { time: 0.5, frequency: 200 },
    );

    expect(viewer.getViewport()).toMatchObject({
      startTime: 0.25,
      endTime: 0.75,
      minFrequency: 150,
      maxFrequency: 250,
    });
  });

  it("loads a new source into an existing Sonoscope and updates viewer", async () => {
    const audio = {
      src: "old.wav",
      currentSrc: "",
      duration: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;
    const scope = new Sonoscope({ audio, source });
    const viewer = new SpectrogramViewer(
      canvas(),
      scope.viewport,
      scope.source,
    );
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
      this.decodeAudioData = () => Promise.resolve(mockAudioBuffer);
    }) as unknown as typeof AudioContext;

    const nextSource = await sourceModule.createAudioSourceFromUrl("next.wav");
    scope.setSource(nextSource);

    expect(scope.source.sampleRate).toBe(192_000);
    viewer.destroy();
    scope.destroy();
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

    const scope = await Sonoscope.fromAudio(audio, { minFrequency: 30_000 });
    const viewer = new SpectrogramViewer(
      canvas(),
      scope.viewport,
      scope.source,
    );

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

    const scope = await Sonoscope.fromAudio(audio, { maxFrequency: 24_000 });
    const viewer = new SpectrogramViewer(
      canvas(),
      scope.viewport,
      scope.source,
    );

    expect(viewer.getViewport().maxFrequency).toBe(24_000);
    fromUrl.mockRestore();
  });

  it("creates with auto renderer when webgl2 is unavailable", async () => {
    const target = canvas();
    const viewer = createViewer({
      canvas: target,
      source,
      renderer: "auto",
    });

    expect(viewer.getConfig().renderer).toBe("auto");
  });

  it("renders and emits progress", async () => {
    const viewer = createViewer({
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
    const viewer = createViewer({
      canvas: canvas(),
      source: { ...source, channelCount: 2, duration: 2 },
      channel: 1,
      tileMaxCells: 2048,
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

  it("emits renderstart, tileload, and rendercomplete with durationMs", async () => {
    const viewer = createViewer({
      canvas: canvas(),
      source,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
      autoRender: false,
    });
    const completeEvents: Array<{
      requestId: string;
      durationMs: number;
      renderedTiles: number;
    }> = [];
    const tileEvents: Array<{
      tileId: string;
      cacheHit: boolean;
      durationMs?: number;
    }> = [];

    viewer.on("rendercomplete", (event) => completeEvents.push(event));
    viewer.on("tileload", (event) => tileEvents.push(event));

    await viewer.render();

    expect(completeEvents).toHaveLength(1);
    expect(typeof completeEvents[0]?.durationMs).toBe("number");
    expect(completeEvents[0]?.durationMs).toBeGreaterThanOrEqual(0);
    expect(tileEvents.length).toBeGreaterThan(0);
    expect(tileEvents[0]?.cacheHit).toBe(false);

    // Second render should be cache hits
    tileEvents.length = 0;
    await viewer.render();
    expect(tileEvents.length).toBeGreaterThan(0);
    expect(tileEvents.every((t) => t.cacheHit)).toBe(true);
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
    const viewer = createViewer({
      canvas: canvas(),
      source: { ...source, duration: 10 },
      tileMaxCells: 2048,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
      backend,
      autoRender: false,
    });
    const completed: string[] = [];
    viewer.on("rendercomplete", (event) => completed.push(event.requestId));

    const first = viewer.render();
    viewer.scope.setViewport({ startTime: 2, endTime: 3 });
    await viewer.render();
    resolveFirst?.(matrix(0, 1));
    await first;

    expect(completed).not.toContain("render_1");
    expect(completed.length).toBeGreaterThan(0);
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
    const viewer = createViewer({
      canvas: canvas(),
      source: { ...source, duration: 4 },
      tileMaxCells: 2048,
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
    const viewer = createViewer({
      canvas: canvas(),
      source: { ...source, duration: 2 },
      tileMaxCells: 2048,
      prefetchTiles: 0,
      startTime: 0,
      endTime: 2,
      minFrequency: 0,
      maxFrequency: 512,
      backend,
      autoRender: false,
    });
    const renderer = (
      viewer as unknown as { renderer: { render: (input: unknown) => void } }
    ).renderer;
    const render = vi.spyOn(renderer, "render");

    const rendered = viewer.render();
    await Promise.resolve();
    releaseSecond?.();
    await rendered;

    expect(render).toHaveBeenCalledTimes(4);
    expect(render.mock.calls[0]?.[0]).toMatchObject({
      placeholders: expect.any(Array),
    });
    expect(
      // biome-ignore lint/correctness/noUnsafeOptionalChaining: false positive
      (render.mock.calls[0]?.[0] as { placeholders: unknown[] }).placeholders
        .length,
    ).toBeGreaterThan(0);
    expect(render.mock.calls[render.mock.calls.length - 1]?.[0]).toMatchObject({
      placeholders: [],
    });
  });

  it("sets rendering state and emits renderstart when starting a render", async () => {
    const backend: SpectrogramComputeBackend = {
      computeTile: () => new Promise(() => undefined),
    };
    const viewer = createViewer({
      canvas: canvas(),
      source: { ...source, duration: 1 },
      tileMaxCells: 2048,
      prefetchTiles: 0,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
      backend,
      autoRender: false,
    });
    const starts: string[] = [];
    viewer.on("renderstart", (e) => starts.push(e.requestId));

    void viewer.render();
    await Promise.resolve();

    expect(starts).toHaveLength(1);
    expect(viewer.getStatus().state).toBe("rendering");
  });

  it("prefetches bounded tiles around the viewport after rendering visible tiles", async () => {
    const requested: Array<[number, number]> = [];
    const backend: SpectrogramComputeBackend = {
      computeTile: (request) => {
        requested.push([request.timeStart, request.timeEnd]);
        return Promise.resolve(matrix(request.timeStart, request.timeEnd));
      },
    };
    const viewer = createViewer({
      canvas: canvas(),
      source: { ...source, duration: 10 },
      tileMaxCells: 2048,
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

    expect(requested).toContainEqual([2, 3.75]);
    expect(requested).toContainEqual([3, 4.75]);
    expect(requested).toContainEqual([4, 5.75]);
    expect(requested).toContainEqual([5, 6.75]);
    expect(requested).toContainEqual([1, 2.75]);
    expect(requested.slice(0, 3)).toEqual([
      [2, 3.75],
      [3, 4.75],
      [4, 5.75],
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
    const viewer = createViewer({
      canvas: canvas(),
      source: { ...source, duration: 10 },
      tileMaxCells: 2048,
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

    expect(requested).toContainEqual([2, 3.75]);
    expect(requested).toContainEqual([3, 4.75]);
    expect(requested).toContainEqual([4, 5.75]);
    expect(requested).not.toContainEqual([5, 6.75]);

    release?.();
    await render;

    expect(requested).toContainEqual([5, 6.75]);
    expect(requested).toContainEqual([1, 2.75]);
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
    const viewer = createViewer({
      canvas: canvas(),
      source: { ...source, duration: 10 },
      tileMaxCells: 2048,
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
      [0, 1.75],
      [1, 2.75],
    ]);
    expect(viewer.getConfig().maxCachedTiles).toBe(2);
    expect(requested).toContainEqual([2, 3.75]);
    expect(requested).toContainEqual([3, 4.75]);
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
    const viewer = createViewer({
      canvas: canvas(),
      source: { ...source, duration: 3 },
      tileMaxCells: 2048,
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
    const viewer = createViewer({
      canvas: canvas(),
      source: { ...source, duration: 10 },
      prefetchTiles: 0,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
      backend: {
        computeTile: (request: ComputeTileRequest) =>
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
    const viewer = createViewer({
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
    const viewer = createViewer({
      canvas: canvas(),
      source: streamingSource,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
      autoRender: false,
    });
    const render = vi.spyOn(viewer, "render").mockResolvedValue(undefined);

    rangeHandler?.({ startTime: 2, endTime: 3 });
    await Promise.resolve();

    expect(render).not.toHaveBeenCalled();
  });

  it("queries a spectrum at a time point", async () => {
    const viewer = createViewer({
      canvas: canvas(),
      source,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
    });
    const spectrum = await viewer.querySpectrum({
      time: 0.25,
      channel: 0,
      mode: "db",
    });
    expect(spectrum.frequencies.length).toBeGreaterThan(0);
    expect(spectrum.values.length).toBe(spectrum.frequencies.length);
    expect(spectrum.mode).toBe("db");

    const point = await viewer.queryPoint({
      time: 0.25,
      frequency: 200,
      mode: "magnitude",
    });
    expect(point.mode).toBe("magnitude");
    expect(typeof point.value).toBe("number");
    expect(point.frequency).toBeCloseTo(200, -1);
  });

  it("uses analysis-window centers for frame queries and tile lookup", async () => {
    const stft = {
      windowSize: 8,
      fftSize: 8,
      hopSize: 2,
      window: "hann" as const,
    };
    const frameIndex = 3;
    const frameCenterTime =
      (frameIndex * stft.hopSize + stft.windowSize / 2) / source.sampleRate;

    const queryViewer = createViewer({
      canvas: canvas(),
      source,
      ...stft,
      autoRender: false,
    });
    expect((await queryViewer.queryFrame({ frameIndex })).time).toBeCloseTo(
      frameCenterTime,
      8,
    );

    const tiledViewer = createViewer({
      canvas: canvas(),
      source,
      ...stft,
      tileMaxCells: 4,
      autoRender: false,
    });
    const privateViewer = tiledViewer as unknown as {
      tileRangeForTime(time: number): { timeStart: number; timeEnd: number };
      tileRangesForTimeRange(
        startTime: number,
        endTime: number,
      ): Array<{ timeStart: number; timeEnd: number }>;
    };
    const expectedTileStart = (frameIndex * stft.hopSize) / source.sampleRate;

    expect(
      privateViewer.tileRangeForTime(frameCenterTime).timeStart,
    ).toBeCloseTo(expectedTileStart, 8);
    expect(
      privateViewer.tileRangesForTimeRange(
        frameCenterTime,
        frameCenterTime + 1 / source.sampleRate,
      )[0]?.timeStart,
    ).toBeCloseTo(expectedTileStart, 8);
  });

  it("converts queryCanvasPoint from CSS pixels, not high-DPR backing pixels", async () => {
    const viewer = createViewer({
      canvas: sizedCanvas(250, 100, 500, 200),
      source: { ...source, duration: 10 },
      startTime: 7.5,
      endTime: 9,
      minFrequency: 0,
      maxFrequency: 500,
      maxDuration: 10,
    });
    const queryPoint = vi.spyOn(viewer, "queryPoint").mockResolvedValue({
      time: 8.25,
      frequency: 250,
      frameIndex: 0,
      binIndex: 0,
      channel: 0,
      mode: "magnitude",
      value: 0.5,
    });

    await viewer.queryCanvasPoint({ x: 125, y: 50, channel: 0 });

    expect(queryPoint).toHaveBeenCalledWith({
      time: 8.25,
      frequency: 250,
      channel: 0,
    });
  });

  it("preserves viewport when non-viewport config changes", async () => {
    const viewer = createViewer({
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
    const viewer = createViewer({
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
    const viewer = createViewer({
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
      minDb: -80,
      maxDb: -5,
    });

    expect(before).toBeGreaterThan(0);
    expect(viewer.getCacheStats().tiles).toBe(before);
  });

  it("preserves cached tiles when only viewport changes", async () => {
    const viewer = createViewer({
      canvas: canvas(),
      source,
      startTime: 0,
      endTime: 1,
      minFrequency: 0,
      maxFrequency: 512,
    });
    await viewer.render();
    const before = viewer.getCacheStats().tiles;

    viewer.scope.setViewport({
      startTime: 0.05,
      endTime: 0.95,
    });

    expect(before).toBeGreaterThan(0);
    expect(viewer.getCacheStats().tiles).toBe(before);
  });

  it("clears cached tiles when tile-generating config changes", async () => {
    const viewer = createViewer({
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
    const viewer = createViewer({
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
    });
    expect(viewer.getFrequencyScale()).toBe("mel");
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

    const scope = new Sonoscope({
      source: sourceA,
      startTime: 0,
      endTime: 2,
      minFrequency: 0,
      maxFrequency: 500,
    });
    const viewer = new SpectrogramViewer(
      canvas(),
      scope.viewport,
      scope.source,
    );

    await viewer.render();
    const cachedForA = viewer.getCacheStats().tiles;
    expect(cachedForA).toBeGreaterThan(0);

    const viewerB = new SpectrogramViewer(canvas(), scope.viewport, sourceB);
    await viewerB.render();
    expect(viewerB.getCacheStats().tiles).toBeGreaterThan(0);
  });

  it("reuses cached AudioSource on repeated Sonoscope.fromUrl without refetching", async () => {
    const fromUrlSpy = vi
      .spyOn(sourceModule, "createAudioSourceFromUrl")
      .mockResolvedValue(source);

    const scope1 = await Sonoscope.fromUrl("cached-track.wav");
    const viewer = new SpectrogramViewer(
      canvas(),
      scope1.viewport,
      scope1.source,
    );

    expect(fromUrlSpy).toHaveBeenCalledTimes(1);
    expect(viewer.getSource()).toBe(source);
  });

  it("dynamically adjusts tile size for ultra-high sample rate sources based on tileMaxCells", async () => {
    const ultraHighRateSource: AudioSource = {
      id: "bat-ultrasonic-500k",
      sampleRate: 500_000,
      duration: 1,
      channelCount: 1,
      read: () => new Float32Array(500_000),
    };

    const viewer = createViewer({
      canvas: canvas(),
      source: ultraHighRateSource,
      hopSize: 128,
      tileMaxCells: 2 ** 17,
      startTime: 0,
      endTime: 5,
    });

    await viewer.render();

    const stats = viewer.getCacheStats();
    expect(stats.tiles).toBeGreaterThanOrEqual(16);
  }, 20000);

  describe("Sonoscope integration", () => {
    it("creates viewer with new SpectrogramViewer(canvas, viewport, source)", () => {
      const scope = new Sonoscope({ source, startTime: 0.1, endTime: 0.8 });
      const target = canvas();
      const viewer = new SpectrogramViewer(
        target,
        scope.viewport,
        scope.source,
      );

      expect(viewer.getSource()).toBe(source);
      expect(viewer.getViewportController()).toBe(scope.viewport);
      expect(viewer.getViewport()).toMatchObject({
        startTime: 0.1,
        endTime: 0.8,
        minFrequency: 0,
        maxFrequency: 512,
      });
      expect(viewer.getCanvas()).toBe(target);
    });

    it("creates viewer with new SpectrogramViewer(canvas, viewport, source, options)", () => {
      const scope = new Sonoscope({
        source,
        startTime: 0.2,
        endTime: 0.7,
        minFrequency: 50,
        maxFrequency: 400,
      });
      const target = canvas();
      const viewer = new SpectrogramViewer(
        target,
        scope.viewport,
        scope.source,
        {
          colorMap: "viridis",
        },
      );

      expect(viewer.getSource()).toBe(source);
      expect(viewer.getViewportController()).toBe(scope.viewport);
      expect(viewer.getConfig().colorMap).toBe("viridis");
      expect(viewer.getViewport()).toMatchObject({
        startTime: 0.2,
        endTime: 0.7,
        minFrequency: 50,
        maxFrequency: 400,
      });
    });

    it("creates viewer via scope.createSpectrogram(canvas, options)", () => {
      const scope = new Sonoscope({ source, startTime: 0.2, endTime: 0.9 });
      const target = canvas();
      const viewer = scope.createSpectrogram(target, { colorMap: "inferno" });

      expect(viewer.getSource()).toBe(source);
      expect(viewer.getViewportController()).toBe(scope.viewport);
      expect(viewer.getConfig().colorMap).toBe("inferno");
      expect(viewer.getViewport().startTime).toBeCloseTo(0.2);
      expect(viewer.getViewport().endTime).toBeCloseTo(0.9);
    });

    it("updates SpectrogramViewer when scope.pan() is called", () => {
      const scope = new Sonoscope({ source, startTime: 0.1, endTime: 0.5 });
      const viewer = new SpectrogramViewer(
        canvas(),
        scope.viewport,
        scope.source,
      );
      const requestRender = vi.spyOn(viewer, "requestRender");

      scope.pan(0.2);

      expect(viewer.getViewport().startTime).toBeCloseTo(0.3);
      expect(viewer.getViewport().endTime).toBeCloseTo(0.7);
      expect(requestRender).toHaveBeenCalledTimes(1);
    });

    it("updates SpectrogramViewer when scope.zoom() is called", () => {
      const scope = new Sonoscope({ source, startTime: 0.2, endTime: 0.8 });
      const viewer = new SpectrogramViewer(
        canvas(),
        scope.viewport,
        scope.source,
      );
      const requestRender = vi.spyOn(viewer, "requestRender");

      scope.zoom(0.5, 0.5);

      expect(viewer.getViewport().startTime).toBeCloseTo(0.35);
      expect(viewer.getViewport().endTime).toBeCloseTo(0.65);
      expect(requestRender).toHaveBeenCalledTimes(1);
    });

    it("updates SpectrogramViewer when scope.setViewport() is called", () => {
      const scope = new Sonoscope({ source, startTime: 0, endTime: 1 });
      const viewer = new SpectrogramViewer(
        canvas(),
        scope.viewport,
        scope.source,
      );
      const requestRender = vi.spyOn(viewer, "requestRender");

      scope.setViewport({ startTime: 0.3, endTime: 0.9 });

      expect(viewer.getViewport().startTime).toBeCloseTo(0.3);
      expect(viewer.getViewport().endTime).toBeCloseTo(0.9);
      expect(requestRender).toHaveBeenCalledTimes(1);
    });

    it("updates viewer viewport and emits viewportchange when scope.setViewport() is called", () => {
      const scope = new Sonoscope({ source, startTime: 0, endTime: 1 });
      const viewer = new SpectrogramViewer(
        canvas(),
        scope.viewport,
        scope.source,
      );
      const onViewportChange = vi.fn();
      viewer.on("viewportchange", onViewportChange);

      scope.setViewport({
        startTime: 0.2,
        endTime: 0.7,
        minFrequency: 100,
      });

      expect(scope.getViewport().startTime).toBeCloseTo(0.2);
      expect(scope.getViewport().endTime).toBeCloseTo(0.7);
      expect(viewer.getViewport()).toMatchObject({
        startTime: 0.2,
        endTime: 0.7,
        minFrequency: 100,
      });
      expect(onViewportChange).toHaveBeenCalled();
    });

    it("unbinds from scope on destroy() without destroying externally owned scope", () => {
      const scope = new Sonoscope({ source, startTime: 0, endTime: 1 });
      const scopeDestroySpy = vi.spyOn(scope, "destroy");
      const viewer = new SpectrogramViewer(
        canvas(),
        scope.viewport,
        scope.source,
      );
      const requestRender = vi.spyOn(viewer, "requestRender");

      viewer.destroy();

      expect(scopeDestroySpy).not.toHaveBeenCalled();

      // Viewport changes on scope should no longer trigger render on destroyed viewer
      scope.pan(0.1);
      expect(requestRender).not.toHaveBeenCalled();
    });

    it("automatically requests render on construction by default (autoRender: true)", async () => {
      const scope = new Sonoscope({ source, startTime: 0, endTime: 1 });
      const viewer = new SpectrogramViewer(
        canvas(),
        scope.viewport,
        scope.source,
      );
      expect(viewer.getConfig().autoRender).toBe(true);

      // Wait for microtask
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      // Viewer transitioned from idle to rendering/ready
      expect(viewer.getStatus().state).not.toBe("idle");
    });

    it("does not automatically render when autoRender is false", async () => {
      const scope = new Sonoscope({ source, startTime: 0, endTime: 1 });
      const viewer = new SpectrogramViewer(
        canvas(),
        scope.viewport,
        scope.source,
        {
          autoRender: false,
        },
      );
      expect(viewer.getConfig().autoRender).toBe(false);

      // Wait for microtask
      await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      expect(viewer.getStatus().state).toBe("idle");
    });

    it("supports shorthand and object shader program renderer configs", async () => {
      const gl = {
        ARRAY_BUFFER: 0x8892,
        COMPILE_STATUS: 0x8b81,
        FRAGMENT_SHADER: 0x8b30,
        LINK_STATUS: 0x8b82,
        STATIC_DRAW: 0x88e4,
        VERTEX_SHADER: 0x8b31,
        TEXTURE_2D: 0x0de1,
        RGBA: 0x1908,
        UNSIGNED_BYTE: 0x1401,
        LINEAR: 0x2601,
        CLAMP_TO_EDGE: 0x812f,
        TEXTURE_MIN_FILTER: 0x2801,
        TEXTURE_MAG_FILTER: 0x2800,
        TEXTURE_WRAP_S: 0x2802,
        TEXTURE_WRAP_T: 0x2803,
        UNPACK_ALIGNMENT: 0x0cf5,
        createShader: vi.fn(() => ({})),
        shaderSource: vi.fn(),
        compileShader: vi.fn(),
        getShaderParameter: vi.fn(() => true),
        getShaderInfoLog: vi.fn(),
        deleteShader: vi.fn(),
        createProgram: vi.fn(() => ({})),
        attachShader: vi.fn(),
        linkProgram: vi.fn(),
        getProgramParameter: vi.fn(() => true),
        getProgramInfoLog: vi.fn(),
        deleteProgram: vi.fn(),
        getAttribLocation: vi.fn(() => 0),
        getUniformLocation: vi.fn(() => ({})),
        enableVertexAttribArray: vi.fn(),
        disableVertexAttribArray: vi.fn(),
        vertexAttribPointer: vi.fn(),
        createBuffer: vi.fn(() => ({})),
        deleteBuffer: vi.fn(),
        createTexture: vi.fn(() => ({})),
        deleteTexture: vi.fn(),
        createVertexArray: vi.fn(() => ({})),
        bindVertexArray: vi.fn(),
        deleteVertexArray: vi.fn(),
        bindBuffer: vi.fn(),
        bufferData: vi.fn(),
        texImage2D: vi.fn(),
        getExtension: vi.fn(),
        viewport: vi.fn(),
        useProgram: vi.fn(),
        bindTexture: vi.fn(),
        pixelStorei: vi.fn(),
        texParameteri: vi.fn(),
        getError: vi.fn(() => 0),
        isContextLost: vi.fn(() => false),
      } as unknown as WebGL2RenderingContext;

      const mockCanvas = {
        width: 100,
        height: 100,
        getBoundingClientRect: () => ({ width: 100, height: 100 }),
        getContext: (type: string) => (type === "webgl2" ? gl : null),
      } as unknown as HTMLCanvasElement;

      const scope = new Sonoscope({ source, startTime: 0, endTime: 1 });
      const v1 = scope.createSpectrogram(mockCanvas, {
        renderer: "halftone",
      });
      expect(v1.getConfig().renderer).toBe("halftone");
      v1.destroy();

      const v2 = scope.createSpectrogram(mockCanvas, {
        renderer: "terrain",
      });
      expect(v2.getConfig().renderer).toBe("terrain");
      v2.destroy();

      const v3 = scope.createSpectrogram(mockCanvas, {
        renderer: { type: "halftone" },
      });
      expect(v3.getConfig().renderer).toEqual({ type: "halftone" });
      v3.destroy();

      const v4 = scope.createSpectrogram(mockCanvas, {
        renderer: {
          type: "halftone",
          dotFrequency: 0.25,
          minEnergyThreshold: 0.1,
          energyGamma: 3.5,
        },
      });
      expect(v4.getConfig().renderer).toEqual({
        type: "halftone",
        dotFrequency: 0.25,
        minEnergyThreshold: 0.1,
        energyGamma: 3.5,
      });
      v4.destroy();

      scope.destroy();
    });
  });
});
