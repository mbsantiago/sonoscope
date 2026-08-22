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

/**
 * Main coordinator that binds audio playback, viewport state, and visualization viewers.
 */
export class Sonoscope implements ISonoscope {
  private _source: AudioSource;
  private _viewport: IViewportController;
  private _clipStart: number | undefined;
  private _clipEnd: number | undefined;
  private audioElement: HTMLAudioElement | undefined;
  private audioCleanup: Array<() => void> = [];
  private navigationCleanups: Array<() => void> = [];
  private readonly events = new TypedEventEmitter<SonoscopeEvents>();
  private readonly viewers = new Set<SpectrogramViewer | WaveformViewer>();
  private animationFrame: number | undefined;

  private totalDuration: number;
  private minDuration: number;
  private maxDuration: number;
  private followPlayback: FollowPlaybackMode;
  private smoothAnchor: number;

  /**
   * Creates a new Sonoscope coordinator instance.
   * @param options Configuration options or an existing AudioSource.
   * @param options.source Audio source for decoding and STFT computation.
   * @param options.audio Optional HTML audio element to synchronize playback with.
   * @param options.clipStart Clip start boundary in seconds.
   * @param options.clipEnd Clip end boundary in seconds.
   * @param options.startTime Initial viewport start time in seconds.
   * @param options.endTime Initial viewport end time in seconds.
   * @param options.minFrequency Initial minimum frequency in Hz.
   * @param options.maxFrequency Initial maximum frequency in Hz.
   * @param options.followPlayback Viewport follow mode during audio playback (`page`, `smooth`, or `off`).
   * @param options.smoothAnchor Screen anchor ratio (0 to 1) for smooth playback follow.
   * @param options.minDuration Minimum zoom duration in seconds.
   * @param options.maxDuration Maximum zoom duration in seconds.
   * @param options.sampleRate Target audio sample rate in Hz.
   * @param options.preferStreaming Prefer streaming audio source when loading from URL.
   * @param options.preferDecoded Prefer full decoded AudioBuffer over streaming.
   * @param options.viewport Custom viewport controller to share coordinates across instances.
   */
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
      this._viewport.setTimeBounds(initialClipStart, initialClipEnd);
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
        minTime: initialClipStart,
        maxTime: initialClipEnd,
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

  /** Active audio source. */
  get source(): AudioSource {
    return this._source;
  }

  /** Viewport controller managing visible time and frequency coordinates. */
  get viewport(): IViewportController {
    return this._viewport;
  }

  /** Returns the viewport controller instance. */
  getViewportController(): IViewportController {
    return this._viewport;
  }

  /** Creates a standalone viewport controller. */
  static createViewport(
    options?: ViewportControllerOptions,
  ): IViewportController {
    return new ViewportController(options);
  }

  /**
   * Creates an independent Sonoscope coordinator sharing the same audio source.
   * @param options Optional overrides for viewport or playback configuration.
   */
  fork(options?: Partial<SonoscopeOptions>): Sonoscope {
    return new Sonoscope({
      source: this._source,
      audio: this.audioElement,
      ...options,
    });
  }

  /**
   * Creates a Sonoscope instance by fetching and decoding or streaming an audio URL.
   * @param url URL of the audio file.
   * @param options Coordinator options.
   */
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

  /**
   * Creates a Sonoscope instance from an existing HTMLAudioElement.
   * @param audio HTML audio element with a valid src.
   * @param options Coordinator options.
   */
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

  /**
   * Creates a Sonoscope instance from an existing AudioSource.
   * @param source AudioSource instance.
   * @param options Coordinator options.
   */
  static fromSource(
    source: AudioSource,
    options?: Omit<SonoscopeOptions, "source">,
  ): Sonoscope {
    return new Sonoscope({ ...options, source });
  }

  /**
   * Creates a Sonoscope instance from an in-memory AudioBuffer.
   * @param buffer Web Audio API AudioBuffer.
   * @param options Coordinator options.
   */
  static fromAudioBuffer(
    buffer: AudioBuffer,
    options?: Omit<SonoscopeOptions, "source">,
  ): Sonoscope {
    const source = new DecodedAudioSource(buffer);
    return new Sonoscope({ ...options, source });
  }

  /**
   * Creates a Sonoscope instance from a Blob or File object.
   * @param blob Audio Blob or File.
   * @param options Coordinator options.
   */
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
        : (this._clipStart ?? 0);
    const newEnd =
      bounds.clipEnd !== undefined
        ? Math.min(total, bounds.clipEnd)
        : (this._clipEnd ?? total);

    this._clipStart = newStart;
    this._clipEnd = newEnd;

    if (this._source instanceof ClippedAudioSource) {
      this._source.setClipBounds({
        clipStart: newStart,
        clipEnd: newEnd,
      });
    }

    this._viewport.setTimeBounds(newStart, newEnd);
    const clipSpan = Math.max(0.001, newEnd - newStart);
    const vpDuration = Math.min(
      this._viewport.getViewport().duration,
      clipSpan,
    );
    this._viewport.setViewport(
      {
        startTime: newStart,
        endTime: newStart + vpDuration,
      },
      "clipchange",
    );

    if (this.audioElement) {
      if (
        !this.audioElement.paused &&
        typeof this.audioElement.pause === "function"
      ) {
        this.audioElement.pause();
      }
      this.audioElement.currentTime = newStart;
      this.events.emit("timeupdate", { currentTime: newStart });
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
          this._clipStart ?? 0,
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
        this._clipStart ?? 0,
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
      if (
        this._clipEnd !== undefined &&
        audio.currentTime >= this._clipEnd - 0.05
      ) {
        audio.currentTime = this._clipStart ?? 0;
      } else if (
        this._clipStart !== undefined &&
        audio.currentTime < this._clipStart
      ) {
        audio.currentTime = this._clipStart;
      }
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
      this._viewport.setTimeBounds(0, this.totalDuration);
    }
    const vp = this._viewport.getViewport();
    this._viewport.setViewport(
      {
        startTime: Math.min(vp.startTime, this.totalDuration),
        endTime: Math.min(vp.endTime, this.totalDuration),
        minFrequency: 0,
        maxFrequency: nyquist,
      },
      "sourcechange",
    );

    for (const viewer of this.viewers) {
      viewer.setSource(source);
    }

    this.events.emit("sourcechange", { source });
  }

  /**
   * Creates and attaches a SpectrogramViewer to a canvas element.
   * @param canvas HTML canvas element for rendering.
   * @param options Spectrogram visual configuration.
   */
  createSpectrogram(
    canvas: HTMLCanvasElement,
    options?: Partial<SpectrogramOptions> & {
      viewport?: IViewportController | undefined;
      source?: AudioSource | undefined;
    },
  ): SpectrogramViewer {
    const viewer = new SpectrogramViewer(
      canvas,
      options?.viewport ?? this._viewport,
      options?.source ?? this._source,
      options,
    );
    this.viewers.add(viewer);
    return viewer;
  }

  /**
   * Creates and attaches a WaveformViewer to a canvas element.
   * @param canvas HTML canvas element for rendering.
   * @param options Waveform visual configuration.
   */
  createWaveform(
    canvas: HTMLCanvasElement,
    options?: Partial<WaveformConfig> & {
      viewport?: IViewportController | undefined;
      source?: AudioSource | undefined;
    },
  ): WaveformViewer {
    const viewer = new WaveformViewer(
      canvas,
      options?.viewport ?? this._viewport,
      options?.source ?? this._source,
      options,
    );
    this.viewers.add(viewer);
    return viewer;
  }

  /**
   * Creates and attaches a TimeRulerViewer to a canvas element.
   * @param canvas HTML canvas element for rendering.
   * @param options Ruler appearance and tick formatting options.
   */
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

  /**
   * Creates and attaches a FrequencyRulerViewer to a canvas element.
   * @param canvas HTML canvas element for rendering.
   * @param options Frequency scale and tick formatting options.
   */
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
