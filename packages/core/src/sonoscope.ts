import type { NavigationOptions } from "./navigation";
import type {
  AudioSource,
  FollowPlaybackMode,
  ISonoscope,
  IViewportController,
  SonoscopeEvents,
  SonoscopeOptions,
  ViewportConfig,
  ViewportControllerOptions,
  ViewportState,
} from "./types";
import type { FrequencyRulerOptions } from "./viewers/frequency-ruler/types";
import type { SpectrogramOptions } from "./viewers/spectrogram/types";
import type { TimeRulerOptions } from "./viewers/time-ruler/types";
import type { WaveformConfig } from "./viewers/waveform/types";
import { type AutoResizeOptions, attachAutoResize } from "./auto-resize";
import { TypedEventEmitter } from "./events";
import { ArrayAudioSource } from "./sources/array-source";
import { ClippedAudioSource } from "./sources/clipped-source";
import {
  createAudioSourceFromBlob,
  createAudioSourceFromBuffer,
  createAudioSourceFromUrl,
  DecodedAudioSource,
} from "./sources/source";
import { encodeWavBlob } from "./sources/wav-encoder";
import { FrequencyRulerViewer } from "./viewers/frequency-ruler/viewer";
import { SpectrogramViewer } from "./viewers/spectrogram/viewer";
import { TimeRulerViewer } from "./viewers/time-ruler/viewer";
import { WaveformViewer } from "./viewers/waveform/viewer";
import { ViewportController } from "./viewport";

export function isSonoscope(value: unknown): value is ISonoscope {
  return (
    typeof value === "object" &&
    value !== null &&
    "getViewport" in value &&
    typeof (value as ISonoscope).getViewport === "function" &&
    "source" in value &&
    "on" in value &&
    typeof (value as ISonoscope).on === "function"
  );
}

function safeRequestAnimationFrame(callback: () => void): number {
  if (typeof requestAnimationFrame !== "undefined") {
    return requestAnimationFrame(callback);
  }
  return setTimeout(callback, 1000 / 60) as unknown as number;
}

function safeCancelAnimationFrame(id: number): void {
  if (typeof cancelAnimationFrame !== "undefined") {
    cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
}

export class Sonoscope implements ISonoscope {
  private _source: AudioSource;
  private _viewport: IViewportController;
  private _clipStart: number | undefined;
  private _clipEnd: number | undefined;
  private audioElement: HTMLAudioElement | undefined;
  private audioCleanup: Array<() => void> = [];
  private navigationCleanups: Array<() => void> = [];
  private readonly events = new TypedEventEmitter<SonoscopeEvents>();
  private animationFrame: number | undefined;

  private totalDuration: number;
  private minDuration: number;
  private maxDuration: number;
  private followPlayback: FollowPlaybackMode;
  private smoothAnchor: number;

  constructor(options: SonoscopeOptions | AudioSource) {
    const isSource =
      typeof options === "object" &&
      options !== null &&
      "read" in options &&
      typeof (options as AudioSource).read === "function";

    const opts: SonoscopeOptions = isSource
      ? { source: options as AudioSource }
      : (options as SonoscopeOptions);

    this._source = opts.source;

    if (opts.clipStart !== undefined || opts.clipEnd !== undefined) {
      this._clipStart = opts.clipStart;
      this._clipEnd = opts.clipEnd;
      if (!(this._source instanceof ClippedAudioSource)) {
        this._source = new ClippedAudioSource(this._source, {
          clipStart: opts.clipStart,
          clipEnd: opts.clipEnd,
        });
      }
    } else if (this._source instanceof ClippedAudioSource) {
      this._clipStart = this._source.clipStart;
      this._clipEnd = this._source.clipEnd;
    }

    this.totalDuration = Math.max(0.01, this._source.duration);
    this.minDuration = Math.max(0.001, opts.minDuration ?? 0.05);
    this.maxDuration = Math.max(
      this.minDuration,
      opts.maxDuration ?? Math.min(30, this.totalDuration),
    );
    this.followPlayback = opts.followPlayback ?? "page";
    this.smoothAnchor = Math.max(0, Math.min(1, opts.smoothAnchor ?? 0.5));

    const initialClipStart = this._clipStart ?? 0;
    const initialClipEnd = this._clipEnd ?? this.totalDuration;

    if (opts.viewport) {
      this._viewport = opts.viewport;
    } else {
      const nyquist = Math.max(100, Math.floor(this._source.sampleRate / 2));
      const minFrequency = opts.minFrequency ?? 0;
      const maxFrequency = opts.maxFrequency ?? nyquist;

      const initialStartTime = Math.max(
        initialClipStart,
        opts.startTime ?? initialClipStart,
      );
      const initialEndTime = Math.min(
        initialClipEnd,
        opts.endTime ?? Math.min(initialStartTime + 10, initialClipEnd),
      );

      this._viewport = new ViewportController({
        totalDuration: this.totalDuration,
        minDuration: this.minDuration,
        maxDuration: this.maxDuration,
        minFrequency,
        maxFrequency,
        startTime: initialStartTime,
        endTime: Math.max(initialStartTime + this.minDuration, initialEndTime),
      });
    }

    this._viewport.on("viewportchange", (e) => {
      this.events.emit("viewportchange", e);
    });

    if (opts.audio) {
      this.attachAudio(opts.audio);
    }
  }

  get source(): AudioSource {
    return this._source;
  }

  get viewport(): IViewportController {
    return this._viewport;
  }

  getViewportController(): IViewportController {
    return this._viewport;
  }

  static createViewport(
    options?: ViewportControllerOptions,
  ): IViewportController {
    return new ViewportController(options);
  }

  fork(options?: Partial<SonoscopeOptions>): Sonoscope {
    return new Sonoscope({
      source: this._source,
      audio: this.audioElement,
      ...options,
    });
  }

  static async fromUrl(
    url: string,
    options?: Omit<SonoscopeOptions, "source">,
  ): Promise<Sonoscope> {
    const sourceOptions =
      options?.preferStreaming !== undefined ||
      options?.preferDecoded !== undefined ||
      options?.sampleRate !== undefined
        ? {
            preferStreaming: options.preferStreaming,
            preferDecoded: options.preferDecoded,
            sampleRate: options.sampleRate,
          }
        : undefined;
    const source = sourceOptions
      ? await createAudioSourceFromUrl(url, sourceOptions)
      : await createAudioSourceFromUrl(url);
    if (options?.audio && !options.audio.src) {
      options.audio.src = url;
    }
    return new Sonoscope({ ...options, source });
  }

  static async fromAudio(
    audio: HTMLAudioElement,
    options?: Omit<SonoscopeOptions, "source" | "audio">,
  ): Promise<Sonoscope> {
    const url = audio.currentSrc || audio.src;
    if (!url) {
      throw new Error("Audio element has no src or currentSrc");
    }
    const sourceOptions =
      options?.preferStreaming !== undefined ||
      options?.preferDecoded !== undefined ||
      options?.sampleRate !== undefined
        ? {
            preferStreaming: options.preferStreaming,
            preferDecoded: options.preferDecoded,
            sampleRate: options.sampleRate,
          }
        : undefined;
    const source = sourceOptions
      ? await createAudioSourceFromUrl(url, sourceOptions)
      : await createAudioSourceFromUrl(url);
    return new Sonoscope({ ...options, source, audio });
  }

  static fromSource(
    source: AudioSource,
    options?: Omit<SonoscopeOptions, "source">,
  ): Sonoscope {
    return new Sonoscope({ ...options, source });
  }

  static fromAudioBuffer(
    buffer: AudioBuffer,
    options?: Omit<SonoscopeOptions, "source">,
  ): Sonoscope {
    const source = new DecodedAudioSource(buffer);
    return new Sonoscope({ ...options, source });
  }

  static async fromBlob(
    blob: Blob,
    options?: Omit<SonoscopeOptions, "source">,
  ): Promise<Sonoscope> {
    const sourceOptions =
      options?.preferStreaming !== undefined ||
      options?.preferDecoded !== undefined ||
      options?.sampleRate !== undefined
        ? {
            preferStreaming: options.preferStreaming,
            preferDecoded: options.preferDecoded,
            sampleRate: options.sampleRate,
          }
        : undefined;
    const source = sourceOptions
      ? await createAudioSourceFromBlob(blob, sourceOptions)
      : await createAudioSourceFromBlob(blob);

    let createdUrl: string | undefined;
    const audio = options?.audio;
    if (
      audio &&
      !audio.src &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function"
    ) {
      createdUrl = URL.createObjectURL(blob);
      audio.src = createdUrl;
    }

    const scope = new Sonoscope({ ...options, source, audio });
    if (createdUrl) {
      scope.audioCleanup.push(() => {
        URL.revokeObjectURL(createdUrl!);
      });
    }
    return scope;
  }

  static async fromBuffer(
    buffer: ArrayBuffer | Uint8Array,
    options?: Omit<SonoscopeOptions, "source">,
  ): Promise<Sonoscope> {
    const sourceOptions =
      options?.preferStreaming !== undefined ||
      options?.preferDecoded !== undefined ||
      options?.sampleRate !== undefined
        ? {
            preferStreaming: options.preferStreaming,
            preferDecoded: options.preferDecoded,
            sampleRate: options.sampleRate,
          }
        : undefined;
    const source = sourceOptions
      ? await createAudioSourceFromBuffer(buffer, sourceOptions)
      : await createAudioSourceFromBuffer(buffer);

    let createdUrl: string | undefined;
    const audio = options?.audio;
    if (
      audio &&
      !audio.src &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function"
    ) {
      const uint8 =
        buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      const blob = new Blob([uint8 as unknown as BlobPart]);
      createdUrl = URL.createObjectURL(blob);
      audio.src = createdUrl;
    }

    const scope = new Sonoscope({ ...options, source, audio });
    if (createdUrl) {
      scope.audioCleanup.push(() => {
        URL.revokeObjectURL(createdUrl!);
      });
    }
    return scope;
  }

  static fromArray(
    data: Float32Array | Float32Array[] | number[] | number[][],
    sampleRate: number,
    options?: Omit<SonoscopeOptions, "source">,
  ): Sonoscope {
    const source = new ArrayAudioSource(data, sampleRate);
    let createdUrl: string | undefined;
    const audio = options?.audio;

    if (
      audio &&
      !audio.src &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function"
    ) {
      const wavBlob = encodeWavBlob(data, sampleRate);
      createdUrl = URL.createObjectURL(wavBlob);
      audio.src = createdUrl;
    }

    const scope = new Sonoscope({ ...options, source, audio });
    if (createdUrl) {
      scope.audioCleanup.push(() => {
        URL.revokeObjectURL(createdUrl!);
      });
    }
    return scope;
  }

  getViewport(): ViewportState {
    return this._viewport.getViewport();
  }

  setViewport(vp: Partial<ViewportConfig>, source?: string | undefined): void {
    this._viewport.setViewport(vp, source);
  }

  updateViewport(
    vp: Partial<ViewportConfig>,
    source?: string | undefined,
  ): void {
    this._viewport.updateViewport(vp, source);
  }

  zoom(factor: number, centerTime?: number, source?: string): void {
    this._viewport.zoom(factor, centerTime, source);
  }

  zoomTime(factor: number, centerTime?: number, source?: string): void {
    this._viewport.zoomTime(factor, centerTime, source);
  }

  pan(deltaSeconds: number, source?: string): void {
    this._viewport.pan(deltaSeconds, source);
  }

  panTo(startTime: number, source?: string): void {
    this._viewport.panTo(startTime, source);
  }

  zoomFrequency(
    factor: number,
    centerFrequency?: number,
    source?: string,
  ): void {
    this._viewport.zoomFrequency(factor, centerFrequency, source);
  }

  zoomFreq(factor: number, centerFrequency?: number, source?: string): void {
    this._viewport.zoomFreq(factor, centerFrequency, source);
  }

  zoomBoth(
    factor: number | { time: number; frequency: number },
    center?: { time?: number; frequency?: number },
    source?: string,
  ): void {
    this._viewport.zoomBoth(factor, center, source);
  }

  panFrequency(deltaHz: number, source?: string): void {
    this._viewport.panFrequency(deltaHz, source);
  }

  getDuration(): number {
    return this._source.duration;
  }

  getSampleRate(): number {
    return this._source.sampleRate;
  }

  getNyquist(): number {
    return Math.floor(this._source.sampleRate / 2);
  }

  getFollowPlayback(): FollowPlaybackMode {
    return this.followPlayback;
  }

  setFollowPlayback(mode: FollowPlaybackMode): void {
    if (this.followPlayback === mode) return;
    this.followPlayback = mode;
    this.events.emit("playbackchange", { mode });
    if (mode !== "off" && this.audioElement) {
      this.checkPlaybackFollow(this.audioElement.currentTime);
    }
  }

  getClipBounds(): {
    clipStart?: number | undefined;
    clipEnd?: number | undefined;
  } {
    return { clipStart: this._clipStart, clipEnd: this._clipEnd };
  }

  setClipBounds(bounds: {
    clipStart?: number | undefined;
    clipEnd?: number | undefined;
  }): void {
    const total = this._source.duration;
    const newStart =
      bounds.clipStart !== undefined
        ? Math.max(0, bounds.clipStart)
        : this._clipStart;
    const newEnd =
      bounds.clipEnd !== undefined
        ? Math.min(total, bounds.clipEnd)
        : this._clipEnd;

    this._clipStart = newStart;
    this._clipEnd = newEnd;

    if (this._source instanceof ClippedAudioSource) {
      this._source.setClipBounds({
        clipStart: newStart,
        clipEnd: newEnd,
      });
    }

    if (newStart !== undefined || newEnd !== undefined) {
      const clipMin = newStart ?? 0;
      const clipMax = newEnd ?? total;
      const currentVp = this._viewport.getViewport();
      const clampedStart = Math.max(
        clipMin,
        Math.min(clipMax - currentVp.duration, currentVp.startTime),
      );
      const clampedEnd = Math.min(clipMax, clampedStart + currentVp.duration);

      this._viewport.setViewport(
        {
          startTime: clampedStart,
          endTime: clampedEnd,
        },
        "clipchange",
      );
    }

    if (this.audioElement) {
      this.enforceClipPlayback(this.audioElement.currentTime);
    }

    this.events.emit("clipchange", {
      clipStart: this._clipStart,
      clipEnd: this._clipEnd,
    });
  }

  private enforceClipPlayback(currentTime: number): number {
    let targetTime = currentTime;
    if (this._clipStart !== undefined && targetTime < this._clipStart) {
      targetTime = this._clipStart;
      if (
        this.audioElement &&
        Math.abs(this.audioElement.currentTime - targetTime) > 0.05
      ) {
        this.audioElement.currentTime = targetTime;
      }
    }
    if (this._clipEnd !== undefined && targetTime >= this._clipEnd) {
      targetTime = this._clipEnd;
      if (this.audioElement) {
        if (Math.abs(this.audioElement.currentTime - targetTime) > 0.05) {
          this.audioElement.currentTime = targetTime;
        }
        if (
          !this.audioElement.paused &&
          typeof this.audioElement.pause === "function"
        ) {
          this.audioElement.pause();
        }
      }
    }
    return targetTime;
  }

  getAudio(): HTMLAudioElement | undefined {
    return this.audioElement;
  }

  isPlaying(): boolean {
    return Boolean(
      this.audioElement &&
        !this.audioElement.paused &&
        !this.audioElement.ended,
    );
  }

  private checkPlaybackFollow(currentTime: number): void {
    if (this.followPlayback === "off") return;
    const vp = this._viewport.getViewport();
    const duration = vp.duration;

    if (this.followPlayback === "page") {
      if (currentTime >= vp.endTime || currentTime < vp.startTime) {
        const nextStart = Math.max(
          0,
          Math.min(this.totalDuration - duration, currentTime),
        );
        this.setViewport(
          { startTime: nextStart, endTime: nextStart + duration },
          "playback",
        );
      }
    } else if (this.followPlayback === "smooth") {
      const targetStart = currentTime - duration * this.smoothAnchor;
      const nextStart = Math.max(
        0,
        Math.min(this.totalDuration - duration, targetStart),
      );
      this.setViewport(
        { startTime: nextStart, endTime: nextStart + duration },
        "playback",
      );
    }
  }

  private startPlaybackLoop(): void {
    if (this.animationFrame !== undefined) return;
    const tick = () => {
      if (!this.isPlaying()) {
        this.stopPlaybackLoop();
        return;
      }
      const rawTime = this.getCurrentTime();
      const currentTime = this.enforceClipPlayback(rawTime);
      this.events.emit("timeupdate", { currentTime });
      this.checkPlaybackFollow(currentTime);
      this.animationFrame = safeRequestAnimationFrame(tick);
    };
    this.animationFrame = safeRequestAnimationFrame(tick);
  }

  private stopPlaybackLoop(): void {
    if (this.animationFrame !== undefined) {
      safeCancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }
  }

  attachAudio(audio: HTMLAudioElement): void {
    this.detachAudio();
    this.audioElement = audio;

    if (this._clipStart !== undefined && audio.currentTime < this._clipStart) {
      audio.currentTime = this._clipStart;
    }

    const onTimeUpdate = () => {
      const currentTime = this.enforceClipPlayback(audio.currentTime);
      this.events.emit("timeupdate", { currentTime });
      this.checkPlaybackFollow(currentTime);
    };
    const onPlay = () => {
      this.enforceClipPlayback(audio.currentTime);
      this.startPlaybackLoop();
    };
    const onPause = () => {
      this.stopPlaybackLoop();
      const currentTime = this.enforceClipPlayback(audio.currentTime);
      this.events.emit("timeupdate", { currentTime });
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("seeked", onTimeUpdate);
    audio.addEventListener("seeking", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("playing", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);
    audio.addEventListener("waiting", onPause);

    this.audioCleanup.push(() => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("seeked", onTimeUpdate);
      audio.removeEventListener("seeking", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("playing", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
      audio.removeEventListener("waiting", onPause);
    });

    this.events.emit("audiochange", { audio });
    const initialTime = this.enforceClipPlayback(audio.currentTime);
    this.events.emit("timeupdate", { currentTime: initialTime });
    this.checkPlaybackFollow(initialTime);

    if (!audio.paused && !audio.ended) {
      this.startPlaybackLoop();
    }
  }

  detachAudio(): void {
    this.stopPlaybackLoop();
    for (const cleanup of this.audioCleanup) {
      cleanup();
    }
    this.audioCleanup = [];
    const hadAudio = this.audioElement !== undefined;
    this.audioElement = undefined;
    if (hadAudio) {
      this.events.emit("audiochange", { audio: undefined });
    }
  }

  getCurrentTime(): number {
    return this.audioElement?.currentTime ?? 0;
  }

  seek(time: number): void {
    const minBound = this._clipStart ?? 0;
    const maxBound = this._clipEnd ?? this.getDuration();
    const clamped = Math.max(minBound, Math.min(maxBound, time));
    if (this.audioElement) {
      this.audioElement.currentTime = clamped;
    }
    this.events.emit("timeupdate", { currentTime: clamped });
    this.checkPlaybackFollow(clamped);
  }

  setSource(source: AudioSource): void {
    this._source = source;
    this.totalDuration = Math.max(0.01, source.duration);
    const nyquist = Math.max(100, Math.floor(source.sampleRate / 2));
    if (this._viewport instanceof ViewportController) {
      this._viewport.setTotalDuration(this.totalDuration);
      this._viewport.setBaseFrequencyBounds(0, nyquist);
    }
    const vp = this._viewport.getViewport();
    this._viewport.setViewport({
      startTime: Math.min(vp.startTime, this.totalDuration),
      endTime: Math.min(vp.endTime, this.totalDuration),
      minFrequency: Math.min(vp.minFrequency, nyquist),
      maxFrequency: Math.min(vp.maxFrequency, nyquist),
    });
    this.events.emit("sourcechange", { source });
  }

  createSpectrogram(
    canvas: HTMLCanvasElement,
    options?: Partial<SpectrogramOptions> & {
      viewport?: IViewportController | undefined;
      source?: AudioSource | undefined;
    },
  ): SpectrogramViewer {
    return new SpectrogramViewer(
      canvas,
      options?.viewport ?? this._viewport,
      options?.source ?? this._source,
      options,
    );
  }

  createWaveform(
    canvas: HTMLCanvasElement,
    options?: Partial<WaveformConfig> & {
      viewport?: IViewportController | undefined;
      source?: AudioSource | undefined;
    },
  ): WaveformViewer {
    return new WaveformViewer(
      canvas,
      options?.viewport ?? this._viewport,
      options?.source ?? this._source,
      options,
    );
  }

  createTimeRuler(
    canvas: HTMLCanvasElement,
    options?: Partial<TimeRulerOptions> & {
      viewport?: IViewportController | undefined;
    },
  ): TimeRulerViewer {
    return new TimeRulerViewer(
      canvas,
      options?.viewport ?? this._viewport,
      options,
    );
  }

  createFrequencyRuler(
    canvas: HTMLCanvasElement,
    options?: Partial<FrequencyRulerOptions> & {
      viewport?: IViewportController | undefined;
    },
  ): FrequencyRulerViewer {
    return new FrequencyRulerViewer(
      canvas,
      options?.viewport ?? this._viewport,
      options,
    );
  }

  attachNavigation(
    container: HTMLElement,
    options?: NavigationOptions,
  ): () => void {
    const cleanup = this._viewport.attachNavigation(container, options);
    this.navigationCleanups.push(cleanup);
    return () => {
      const idx = this.navigationCleanups.indexOf(cleanup);
      if (idx !== -1) this.navigationCleanups.splice(idx, 1);
      cleanup();
    };
  }

  attachAutoResize(
    canvas: HTMLCanvasElement,
    options?: AutoResizeOptions,
  ): () => void {
    return attachAutoResize(canvas, options);
  }

  on<K extends keyof SonoscopeEvents>(
    event: K,
    handler: (e: SonoscopeEvents[K]) => void,
  ): () => void {
    return this.events.on(event, handler);
  }

  destroy(): void {
    this.detachAudio();
    for (const cleanup of this.navigationCleanups) {
      cleanup();
    }
    this.navigationCleanups = [];
    this.events.emit("destroy", undefined);
    this.events.clear();
  }
}
