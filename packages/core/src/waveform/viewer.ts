import { colorMapToRgb } from "../colormap";
import { clampViewportTimes } from "../config";
import { TypedEventEmitter } from "../events";
import { Sonoscope } from "../sonoscope";
import { createAudioSourceFromUrl } from "../sources/source";
import type { AudioSource } from "../types";
import { WaveformPeakPyramid } from "./peaks";
import { CanvasWaveformRenderer } from "./renderers/canvas";
import { WebGL2WaveformRenderer } from "./renderers/webgl2";
import type {
  IWaveformViewer,
  ResolvedWaveformConfig,
  WaveformConfig,
  WaveformEvents,
  WaveformRenderer,
  WaveformStatus,
  WaveformViewport,
} from "./types";

function resolveWaveformConfig(
  input: WaveformConfig & { source: AudioSource },
): ResolvedWaveformConfig {
  if (!input.canvas) throw new Error("WaveformViewer requires a canvas");
  if (!input.source) throw new Error("WaveformViewer requires a source");

  const duration = input.source.duration;
  const minViewportDuration = input.minViewportDuration ?? 0.05;
  const maxViewportDuration =
    input.maxViewportDuration ?? Math.min(30, duration);

  const initialStart = input.startTime ?? 0;
  const initialEnd = input.endTime ?? duration;

  const clamped = clampViewportTimes(
    initialStart,
    initialEnd,
    duration,
    minViewportDuration,
    maxViewportDuration,
  );

  const defaultColor = input.colorMap
    ? colorMapToRgb(input.colorMap, 210)
    : "#38bdf8";
  const defaultProgressColor = input.colorMap
    ? colorMapToRgb(input.colorMap, 255)
    : "#0284c7";

  return {
    canvas: input.canvas,
    source: input.source,
    channel: input.channel ?? 0,
    startTime: clamped.startTime,
    endTime: clamped.endTime,
    minViewportDuration,
    maxViewportDuration,
    color: input.color ?? defaultColor,
    progressColor: input.progressColor ?? defaultProgressColor,
    backgroundColor: input.backgroundColor ?? "transparent",
    cursorColor: input.cursorColor ?? "#ffffff",
    amplitudeScale: input.amplitudeScale ?? 1.0,
    colorMap: input.colorMap,
    renderer: input.renderer ?? "canvas2d",
  };
}

export class WaveformViewer implements IWaveformViewer {
  private readonly events = new TypedEventEmitter<WaveformEvents>();
  private pyramid: WaveformPeakPyramid;
  private renderer: WaveformRenderer;
  private audioElement: HTMLAudioElement | undefined = undefined;
  private playbackCleanup: Array<() => void> = [];
  private scopeCleanup: Array<() => void> = [];
  private renderQueued = false;
  private renderRunning = false;
  private renderAgain = false;
  private animationFrame: number | undefined;
  private requestCounter = 0;
  private status: WaveformStatus = { state: "idle" };
  private isSelfUpdating = false;
  private scope: Sonoscope;
  private ownsScope = false;
  private config: ResolvedWaveformConfig;
  private readonly sourceMap = new Map<string, AudioSource>();

  constructor(
    scope: Sonoscope,
    canvas: HTMLCanvasElement,
    options?: Omit<WaveformConfig, "source" | "canvas" | "audio">,
  );
  constructor(
    scope: Sonoscope,
    options: Omit<WaveformConfig, "source" | "audio"> & {
      canvas: HTMLCanvasElement;
    },
  );
  constructor(options: WaveformConfig & { scope?: Sonoscope });
  constructor(
    config: ResolvedWaveformConfig,
    renderer?: WaveformRenderer,
    audioElement?: HTMLAudioElement,
  );
  constructor(
    arg0:
      | Sonoscope
      | (WaveformConfig & { scope?: Sonoscope })
      | ResolvedWaveformConfig,
    arg1?:
      | HTMLCanvasElement
      | (Omit<WaveformConfig, "source" | "audio"> & {
          canvas: HTMLCanvasElement;
        })
      | WaveformRenderer,
    arg2?:
      | Omit<WaveformConfig, "source" | "canvas" | "audio">
      | HTMLAudioElement,
  ) {
    let scope: Sonoscope;
    let ownsScope = false;
    let canvas: HTMLCanvasElement;
    let userOptions: Partial<WaveformConfig> = {};
    let customRenderer: WaveformRenderer | undefined;
    let customAudio: HTMLAudioElement | undefined;

    if (isSonoscope(arg0)) {
      scope = arg0;
      ownsScope = false;
      if (isCanvasElement(arg1)) {
        canvas = arg1;
        userOptions = (arg2 as Partial<WaveformConfig>) ?? {};
      } else if (
        typeof arg1 === "object" &&
        arg1 !== null &&
        "canvas" in arg1
      ) {
        const opts = arg1 as Omit<WaveformConfig, "source" | "audio"> & {
          canvas: HTMLCanvasElement;
        };
        canvas = opts.canvas;
        userOptions = opts;
      } else {
        throw new Error("WaveformViewer requires a canvas");
      }
    } else if (typeof arg0 === "object" && arg0 !== null) {
      if (isWaveformRenderer(arg1)) {
        customRenderer = arg1;
        customAudio = arg2 as HTMLAudioElement | undefined;
      }

      const optionsWithScope = arg0 as WaveformConfig & {
        scope?: Sonoscope;
      };
      if (optionsWithScope.scope && isSonoscope(optionsWithScope.scope)) {
        scope = optionsWithScope.scope;
        ownsScope = false;
        canvas = optionsWithScope.canvas;
        userOptions = optionsWithScope;
      } else {
        if (!optionsWithScope.source) {
          throw new Error("WaveformViewer requires a source or scope");
        }
        ownsScope = true;
        scope = new Sonoscope({
          source: optionsWithScope.source,
          audio: optionsWithScope.audio ?? customAudio,
          startTime: optionsWithScope.startTime,
          endTime: optionsWithScope.endTime,
          minDuration: optionsWithScope.minViewportDuration,
          maxDuration: optionsWithScope.maxViewportDuration,
        });
        canvas = optionsWithScope.canvas;
        userOptions = optionsWithScope;
      }
    } else {
      throw new Error("Invalid arguments to WaveformViewer constructor");
    }

    if (
      userOptions.startTime !== undefined ||
      userOptions.endTime !== undefined
    ) {
      scope.setViewport({
        ...(userOptions.startTime !== undefined
          ? { startTime: userOptions.startTime }
          : {}),
        ...(userOptions.endTime !== undefined
          ? { endTime: userOptions.endTime }
          : {}),
      });
    }

    const scopeVp = scope.getViewport();
    const resolvedConfig = resolveWaveformConfig({
      ...userOptions,
      canvas,
      source: scope.source,
      startTime: scopeVp.startTime,
      endTime: scopeVp.endTime,
    });

    let renderer: WaveformRenderer;
    if (customRenderer) {
      renderer = customRenderer;
    } else if (typeof resolvedConfig.renderer === "object") {
      renderer = resolvedConfig.renderer;
    } else if (resolvedConfig.renderer === "webgl2") {
      renderer = new WebGL2WaveformRenderer();
    } else {
      renderer = new CanvasWaveformRenderer();
    }

    this.scope = scope;
    this.ownsScope = ownsScope;
    this.config = resolvedConfig;
    this.renderer = renderer;
    this.audioElement = scope.getAudio() ?? userOptions.audio ?? customAudio;
    this.pyramid = new WaveformPeakPyramid(
      resolvedConfig.source,
      resolvedConfig.channel,
    );
    this.bindScope();
    this.attachPlaybackSync();
  }

  static async create(
    input: WaveformConfig & { scope?: Sonoscope },
  ): Promise<WaveformViewer> {
    if (input.scope) {
      return new WaveformViewer(input.scope, input.canvas, input);
    }
    let source = input.source;
    if (!source && input.audio) {
      const url = input.audio.currentSrc || input.audio.src;
      if (!url) {
        throw new Error(
          "WaveformViewer requires audio.currentSrc or audio.src when source is omitted",
        );
      }
      source = await createAudioSourceFromUrl(url);
    }
    if (!source) {
      throw new Error("WaveformViewer requires a source");
    }
    return new WaveformViewer({
      ...input,
      source,
    });
  }

  static async fromUrl(
    input: Omit<WaveformConfig, "source"> & { url: string },
  ): Promise<WaveformViewer> {
    if (input.audio) input.audio.src = input.url;
    const source = await createAudioSourceFromUrl(input.url);
    const viewer = await WaveformViewer.create({
      startTime: 0,
      endTime: Math.min(10, source.duration),
      ...input,
      source,
    });
    viewer.sourceMap.set(input.url, source);
    return viewer;
  }

  static async fromAudio(
    input: Omit<WaveformConfig, "source"> & { audio: HTMLAudioElement },
  ): Promise<WaveformViewer> {
    const url = input.audio.currentSrc || input.audio.src;
    if (!url) {
      throw new Error(
        "WaveformViewer.fromAudio requires audio.currentSrc or audio.src to be set",
      );
    }
    const source = await createAudioSourceFromUrl(url);
    return WaveformViewer.create({
      startTime: 0,
      endTime: Math.min(10, source.duration),
      ...input,
      source,
    });
  }

  static async fromSource(
    input: Omit<WaveformConfig, "audio"> & { source: AudioSource },
  ): Promise<WaveformViewer> {
    return WaveformViewer.create({
      startTime: 0,
      endTime: Math.min(10, input.source.duration),
      ...input,
    });
  }

  getScope(): Sonoscope {
    return this.scope;
  }

  getViewport(): WaveformViewport {
    const scopeVp = this.scope.getViewport();
    return {
      startTime: scopeVp.startTime,
      endTime: scopeVp.endTime,
    };
  }

  setViewport(viewport: Partial<WaveformViewport>): void {
    const prev = this.getViewport();
    if (viewport.startTime !== undefined || viewport.endTime !== undefined) {
      const nextStart = viewport.startTime ?? prev.startTime;
      const nextEnd = viewport.endTime ?? prev.endTime;
      if (
        Math.abs(prev.startTime - nextStart) >= 1e-6 ||
        Math.abs(prev.endTime - nextEnd) >= 1e-6
      ) {
        this.isSelfUpdating = true;
        try {
          this.scope.setViewport(
            { startTime: nextStart, endTime: nextEnd },
            "viewer",
          );
        } finally {
          this.isSelfUpdating = false;
        }
        this.config.startTime = nextStart;
        this.config.endTime = nextEnd;
      }
    }
  }

  updateViewport(viewport: Partial<WaveformViewport>): void {
    this.setViewport(viewport);
    this.requestRender();
  }

  getTimeBounds(): {
    startTime: number;
    endTime: number;
    minDurationSeconds: number;
    maxDurationSeconds: number;
  } {
    return {
      startTime: 0,
      endTime: this.getDuration(),
      minDurationSeconds: this.config.minViewportDuration,
      maxDurationSeconds: this.config.maxViewportDuration,
    };
  }

  zoomTime(
    factor: number,
    centerTime = (this.config.startTime + this.config.endTime) / 2,
  ): void {
    const currentViewport = this.getViewport();
    const duration = currentViewport.endTime - currentViewport.startTime;
    const minDur = this.config.minViewportDuration;
    const maxDur = Math.min(
      this.config.maxViewportDuration,
      this.getDuration(),
    );
    const targetDuration = Math.max(
      minDur,
      Math.min(maxDur, duration * factor),
    );

    if (Math.abs(targetDuration - duration) < 1e-9) return;

    const ratio = (centerTime - currentViewport.startTime) / (duration || 1);
    const startTime = Math.max(
      0,
      Math.min(
        this.getDuration() - targetDuration,
        centerTime - targetDuration * ratio,
      ),
    );
    const next: WaveformViewport = {
      startTime,
      endTime: startTime + targetDuration,
    };

    this.updateViewport(next);
  }

  bindViewport(controller: {
    bind: (viewer: unknown) => () => void;
  }): () => void {
    return controller.bind(this);
  }

  getConfig(): ResolvedWaveformConfig {
    return this.config;
  }

  setConfig(input: Partial<WaveformConfig>): void {
    const source = input.source ?? this.config.source;
    if (input.source && input.source !== this.scope.source) {
      this.scope.setSource(input.source);
    }
    if (input.audio !== undefined) {
      if (input.audio) {
        this.attachAudio(input.audio);
      } else {
        this.detachAudio();
      }
    }
    const cleanInput = Object.fromEntries(
      Object.entries(input).filter(([_, v]) => v !== undefined),
    );
    const shouldDeriveColors =
      input.colorMap !== undefined &&
      input.color === undefined &&
      input.progressColor === undefined;

    const baseConfig = { ...this.config };
    if (shouldDeriveColors) {
      delete (baseConfig as Partial<ResolvedWaveformConfig>).color;
      delete (baseConfig as Partial<ResolvedWaveformConfig>).progressColor;
    }

    const previousChannel = this.config.channel;
    const previousSource = this.config.source;

    this.config = resolveWaveformConfig({
      ...baseConfig,
      ...cleanInput,
      canvas: input.canvas ?? this.config.canvas,
      source,
    });

    if (
      this.config.source !== previousSource ||
      this.config.channel !== previousChannel
    ) {
      this.pyramid.clear();
      this.pyramid = new WaveformPeakPyramid(
        this.config.source,
        this.config.channel,
      );
    }

    if (input.renderer !== undefined) {
      this.renderer.destroy?.();
      if (typeof input.renderer === "object") {
        this.renderer = input.renderer;
      } else if (input.renderer === "webgl2") {
        this.renderer = new WebGL2WaveformRenderer();
      } else {
        this.renderer = new CanvasWaveformRenderer();
      }
    }

    this.events.emit("configchange", { config: this.config });
  }

  updateConfig(input: Partial<WaveformConfig>): void {
    this.setConfig(input);
    this.requestRender();
  }

  setSource(source: AudioSource, options?: Partial<WaveformViewport>): void {
    const defaultStart = 0;
    const defaultEnd = Math.min(10, source.duration);
    const start = options?.startTime ?? defaultStart;
    const end = options?.endTime ?? defaultEnd;
    if (this.scope.source !== source) {
      this.scope.setSource(source);
    }
    this.scope.setViewport({ startTime: start, endTime: end }, "viewer");
    this.setConfig({
      source,
      startTime: start,
      endTime: end,
      ...options,
    });
  }

  updateSource(source: AudioSource, options?: Partial<WaveformViewport>): void {
    this.setSource(source, options);
    this.requestRender();
  }

  async setSourceUrl(
    url: string,
    options?: Partial<WaveformViewport>,
  ): Promise<void> {
    if (this.audioElement) this.audioElement.src = url;
    let source = this.sourceMap.get(url);
    if (!source) {
      source = await createAudioSourceFromUrl(url);
      this.sourceMap.set(url, source);
    }
    this.setSource(source, options);
  }

  async updateSourceUrl(
    url: string,
    options?: Partial<WaveformViewport>,
  ): Promise<void> {
    await this.setSourceUrl(url, options);
    this.requestRender();
  }

  getDuration(): number {
    return this.scope.getDuration();
  }

  getSampleRate(): number {
    return this.scope.getSampleRate();
  }

  getSource(): AudioSource {
    return this.scope.source;
  }

  getAudio(): HTMLAudioElement | undefined {
    return this.scope.getAudio() ?? this.audioElement;
  }

  attachAudio(audio: HTMLAudioElement): void {
    this.detachAudio();
    this.audioElement = audio;
    this.scope.attachAudio(audio);
    this.attachPlaybackSync();
    this.requestRender();
  }

  detachAudio(): void {
    this.stopPlaybackLoop();
    for (const cleanup of this.playbackCleanup) cleanup();
    this.playbackCleanup = [];
    this.audioElement = undefined;
    this.scope.detachAudio();
    this.requestRender();
  }

  getStatus(): WaveformStatus {
    return this.status;
  }

  canvasToTime(x: number): number {
    const rect = this.config.canvas.getBoundingClientRect();
    const width = rect.width || this.config.canvas.width;
    const ratio = Math.max(0, Math.min(1, x / (width || 1)));
    const vp = this.getViewport();
    return vp.startTime + ratio * (vp.endTime - vp.startTime);
  }

  timeToCanvas(time: number): number {
    const rect = this.config.canvas.getBoundingClientRect();
    const width = rect.width || this.config.canvas.width;
    const vp = this.getViewport();
    const span = vp.endTime - vp.startTime;
    return ((time - vp.startTime) / (span || 1)) * width;
  }

  on<Name extends keyof WaveformEvents>(
    name: Name,
    handler: (event: WaveformEvents[Name]) => void,
  ): () => void {
    return this.events.on(name, handler);
  }

  requestRender(): void {
    if (this.status.state === "destroyed") return;
    this.renderAgain = true;
    if (this.renderQueued || this.renderRunning) return;
    this.renderQueued = true;
    void Promise.resolve().then(() => this.renderRequested());
  }

  private async renderRequested(): Promise<void> {
    this.renderQueued = false;
    if (this.renderRunning || this.status.state === "destroyed") return;
    this.renderRunning = true;
    while (this.renderAgain && this.status.state !== "destroyed") {
      this.renderAgain = false;
      try {
        await this.render();
      } catch (error) {
        this.status = {
          state: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        };
        this.events.emit("error", {
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
    this.renderRunning = false;
  }

  async render(): Promise<void> {
    if (this.status.state === "destroyed") return;
    const requestId = `waveform-${++this.requestCounter}`;
    this.status = { state: "rendering" };
    this.events.emit("renderstart", { requestId });

    const rect = this.config.canvas.getBoundingClientRect();
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const targetWidth = Math.max(
      1,
      Math.floor((rect.width || this.config.canvas.width) * dpr),
    );

    const vp = this.getViewport();
    const peaks = await this.pyramid.getPeaks(
      vp.startTime,
      vp.endTime,
      targetWidth,
    );

    if (this.status.state === "destroyed") return;

    this.renderer.render({
      canvas: this.config.canvas,
      peaks,
      color: this.config.color,
      progressColor: this.config.progressColor,
      backgroundColor: this.config.backgroundColor,
      cursorColor: this.config.cursorColor,
      playheadTime:
        this.audioElement?.currentTime ?? this.scope.getCurrentTime(),
      startTime: vp.startTime,
      endTime: vp.endTime,
      amplitudeScale: this.config.amplitudeScale,
      colorMap: this.config.colorMap,
    });

    this.status = { state: "ready" };
    this.events.emit("rendercomplete", { requestId });
  }

  destroy(): void {
    this.status = { state: "destroyed" };
    this.events.clear();
    for (const cleanup of this.scopeCleanup) cleanup();
    this.scopeCleanup = [];
    if (this.ownsScope) {
      this.scope.destroy();
    }
    this.stopPlaybackLoop();
    for (const cleanup of this.playbackCleanup) cleanup();
    this.playbackCleanup = [];
    this.pyramid.clear();
    this.sourceMap.clear();
    this.renderer.destroy?.();
  }

  private bindScope(): void {
    for (const cleanup of this.scopeCleanup) cleanup();
    this.scopeCleanup = [];

    const unlistenViewport = this.scope.on("viewportchange", (e) => {
      const currentStart = this.config.startTime;
      const currentEnd = this.config.endTime;
      if (
        Math.abs(currentStart - e.viewport.startTime) < 1e-6 &&
        Math.abs(currentEnd - e.viewport.endTime) < 1e-6
      ) {
        return;
      }
      this.config.startTime = e.viewport.startTime;
      this.config.endTime = e.viewport.endTime;
      this.events.emit("viewportchange", { viewport: this.getViewport() });
      if (!this.isSelfUpdating) {
        this.requestRender();
      }
    });

    const unlistenSource = this.scope.on("sourcechange", (e) => {
      if (this.config.source !== e.source) {
        this.setSource(e.source);
      }
    });

    const unlistenAudio = this.scope.on("audiochange", (e) => {
      if (e.audio) {
        this.audioElement = e.audio;
        this.attachPlaybackSync();
      } else {
        this.audioElement = undefined;
        this.stopPlaybackLoop();
        for (const cleanup of this.playbackCleanup) cleanup();
        this.playbackCleanup = [];
      }
      this.requestRender();
    });

    const unlistenTime = this.scope.on("timeupdate", () => {
      this.requestRender();
    });

    this.scopeCleanup.push(
      unlistenViewport,
      unlistenSource,
      unlistenAudio,
      unlistenTime,
    );
  }

  private attachPlaybackSync(): void {
    const audio = this.audioElement ?? this.scope.getAudio();
    if (!audio) return;
    for (const cleanup of this.playbackCleanup) cleanup();
    this.playbackCleanup = [];

    const onPlay = () => this.startPlaybackLoop();
    const onPause = () => this.stopPlaybackLoop();
    const onSeek = () => this.requestRender();

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("seeked", onSeek);
    audio.addEventListener("timeupdate", onSeek);

    this.playbackCleanup.push(() => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("seeked", onSeek);
      audio.removeEventListener("timeupdate", onSeek);
    });

    if (!audio.paused) this.startPlaybackLoop();
  }

  private startPlaybackLoop(): void {
    if (this.animationFrame !== undefined) return;
    const tick = () => {
      this.requestRender();
      const audio = this.audioElement ?? this.scope.getAudio();
      if (audio && !audio.paused) {
        this.animationFrame = requestAnimationFrame(tick);
      } else {
        this.animationFrame = undefined;
      }
    };
    this.animationFrame = requestAnimationFrame(tick);
  }

  private stopPlaybackLoop(): void {
    if (this.animationFrame !== undefined) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
  }
}

function isSonoscope(val: unknown): val is Sonoscope {
  return (
    val instanceof Sonoscope ||
    (typeof val === "object" &&
      val !== null &&
      "viewportController" in val &&
      typeof (val as Sonoscope).getViewport === "function" &&
      "source" in val)
  );
}

function isCanvasElement(val: unknown): val is HTMLCanvasElement {
  return (
    typeof val === "object" &&
    val !== null &&
    ("getContext" in val || ("width" in val && "height" in val))
  );
}

function isWaveformRenderer(val: unknown): val is WaveformRenderer {
  return (
    typeof val === "object" &&
    val !== null &&
    ("kind" in val || typeof (val as WaveformRenderer).render === "function")
  );
}
