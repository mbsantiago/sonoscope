import { colorMapToRgb } from "../colormap";
import { clampViewportTimes } from "../config";
import { TypedEventEmitter } from "../events";
import { createAudioSourceFromUrl } from "../sources/source";
import type { AudioSource } from "../types";
import { WaveformPeakPyramid } from "./peaks";
import { CanvasWaveformRenderer } from "./renderers/canvas";
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
  private readonly pyramid: WaveformPeakPyramid;
  private renderer: WaveformRenderer;
  private audioElement: HTMLAudioElement | undefined = undefined;
  private playbackCleanup: Array<() => void> = [];
  private renderQueued = false;
  private renderRunning = false;
  private renderAgain = false;
  private animationFrame: number | undefined;
  private requestCounter = 0;
  private status: WaveformStatus = { state: "idle" };

  private constructor(
    private config: ResolvedWaveformConfig,
    renderer: WaveformRenderer,
    audioElement?: HTMLAudioElement,
  ) {
    this.audioElement = audioElement;
    this.renderer = renderer;
    this.pyramid = new WaveformPeakPyramid(config.source, config.channel);
    this.attachPlaybackSync();
  }

  static async create(input: WaveformConfig): Promise<WaveformViewer> {
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
    const resolved = resolveWaveformConfig({ ...input, source });
    const renderer =
      typeof resolved.renderer === "object"
        ? resolved.renderer
        : new CanvasWaveformRenderer();
    return new WaveformViewer(resolved, renderer, input.audio);
  }

  static async fromUrl(
    input: Omit<WaveformConfig, "source"> & { url: string },
  ): Promise<WaveformViewer> {
    if (input.audio) input.audio.src = input.url;
    const source = await createAudioSourceFromUrl(input.url);
    return WaveformViewer.create({ ...input, source });
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
    return WaveformViewer.create({ ...input, source });
  }

  static async fromSource(
    input: Omit<WaveformConfig, "audio"> & { source: AudioSource },
  ): Promise<WaveformViewer> {
    return WaveformViewer.create(input);
  }

  getViewport(): WaveformViewport {
    return {
      startTime: this.config.startTime,
      endTime: this.config.endTime,
    };
  }

  setViewport(viewport: Partial<WaveformViewport>): void {
    const prev = this.getViewport();
    const cleanViewport = Object.fromEntries(
      Object.entries(viewport).filter(([_, v]) => v !== undefined),
    );
    const nextConfig = resolveWaveformConfig({
      ...this.config,
      ...cleanViewport,
      canvas: this.config.canvas,
      source: this.config.source,
    });
    if (
      Math.abs(prev.startTime - nextConfig.startTime) < 1e-6 &&
      Math.abs(prev.endTime - nextConfig.endTime) < 1e-6
    ) {
      return;
    }
    this.config = nextConfig;
    this.events.emit("viewportchange", { viewport: this.getViewport() });
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

    this.config = resolveWaveformConfig({
      ...baseConfig,
      ...cleanInput,
      canvas: input.canvas ?? this.config.canvas,
      source: input.source ?? this.config.source,
    });
    this.events.emit("configchange", { config: this.config });
  }

  updateConfig(input: Partial<WaveformConfig>): void {
    this.setConfig(input);
    this.requestRender();
  }

  setSource(source: AudioSource, options?: Partial<WaveformViewport>): void {
    this.setConfig({
      source,
      startTime: 0,
      endTime: Math.min(10, source.duration),
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
    const source = await createAudioSourceFromUrl(url);
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
    return this.config.source.duration;
  }

  getSampleRate(): number {
    return this.config.source.sampleRate;
  }

  getSource(): AudioSource {
    return this.config.source;
  }

  getAudio(): HTMLAudioElement | undefined {
    return this.audioElement;
  }

  attachAudio(audio: HTMLAudioElement): void {
    this.detachAudio();
    this.audioElement = audio;
    this.attachPlaybackSync();
    this.requestRender();
  }

  detachAudio(): void {
    this.stopPlaybackLoop();
    for (const cleanup of this.playbackCleanup) cleanup();
    this.playbackCleanup = [];
    this.audioElement = undefined;
    this.requestRender();
  }

  getStatus(): WaveformStatus {
    return this.status;
  }

  canvasToTime(x: number): number {
    const rect = this.config.canvas.getBoundingClientRect();
    const width = rect.width || this.config.canvas.width;
    const ratio = Math.max(0, Math.min(1, x / (width || 1)));
    return (
      this.config.startTime +
      ratio * (this.config.endTime - this.config.startTime)
    );
  }

  timeToCanvas(time: number): number {
    const rect = this.config.canvas.getBoundingClientRect();
    const width = rect.width || this.config.canvas.width;
    const span = this.config.endTime - this.config.startTime;
    return ((time - this.config.startTime) / (span || 1)) * width;
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

    const peaks = await this.pyramid.getPeaks(
      this.config.startTime,
      this.config.endTime,
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
      playheadTime: this.audioElement?.currentTime,
      startTime: this.config.startTime,
      endTime: this.config.endTime,
      amplitudeScale: this.config.amplitudeScale,
    });

    this.status = { state: "ready" };
    this.events.emit("rendercomplete", { requestId });
  }

  destroy(): void {
    this.status = { state: "destroyed" };
    this.events.clear();
    this.stopPlaybackLoop();
    for (const cleanup of this.playbackCleanup) cleanup();
    this.playbackCleanup = [];
    this.pyramid.clear();
    this.renderer.destroy?.();
  }

  private attachPlaybackSync(): void {
    if (!this.audioElement) return;
    const audio = this.audioElement;
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
      if (this.audioElement && !this.audioElement.paused) {
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
