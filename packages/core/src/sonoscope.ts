import type { FrequencyRulerOptions } from "./locators/frequency-ruler/types";
import type { TimeRulerOptions } from "./locators/time-ruler/types";
import type {
  AudioSource,
  AudioSourceOptions,
  CustomViewerFactory,
  FollowPlaybackMode,
  IDataViewer,
  ISonoscope,
  ISonoscopeViewer,
  IViewportController,
  NavigationOptions,
  SonoscopeEvents,
  SonoscopeOptions,
  SourceState,
  ViewportConfig,
  ViewportControllerOptions,
  ViewportState,
} from "./types";
import type { SpectrogramOptions } from "./viewers/spectrogram/types";
import type { WaveformOptions } from "./viewers/waveform/types";
import { type AutoResizeOptions, attachAutoResize } from "./auto-resize";
import { TypedEventEmitter } from "./events";
import { FrequencyRulerLocator } from "./locators/frequency-ruler/locator";
import { TimeRulerLocator } from "./locators/time-ruler/locator";
import { attachPlayheadOverlay, type PlayheadOverlayOptions } from "./playhead";
import {
  getRegisteredViewer,
  registerViewer as registerCustomViewer,
  unregisterViewer as unregisterCustomViewer,
} from "./plugins";
import { ArrayAudioSource } from "./sources/array-source";
import { ClippedAudioSource } from "./sources/clipped-source";
import {
  createAudioSourceFromBlob,
  createAudioSourceFromBuffer,
  createAudioSourceFromUrl,
  DecodedAudioSource,
  wrapClippedIfNeeded,
} from "./sources/source";
import { encodeWavBlob } from "./sources/wav-encoder";
import { SpectrogramViewer } from "./viewers/spectrogram/viewer";
import { WaveformViewer } from "./viewers/waveform/viewer";
import { ViewportController } from "./viewport";

const DEFAULT_MIN_DURATION = 0.05;
const DEFAULT_MAX_DURATION = 40;
const PROGRESSIVE_DURATION_STEP = 0.2;
const DEFAULT_FOLLOW_PLAYBACK = "page";
const DEFAULT_SMOOTH_ANCHOR = 0.5;

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

function sourceOptionsWithSignal(
  options: AudioSourceOptions,
  signal: AbortSignal,
): AudioSourceOptions {
  if (
    options &&
    "decodeAudioData" in options &&
    typeof options.decodeAudioData === "function"
  ) {
    return { audioContext: options, signal };
  }
  return {
    ...(options && typeof options === "object" ? options : {}),
    signal,
  };
}

/**
 * Main coordinator that binds audio playback, viewport state, and visualization viewers.
 */
export class Sonoscope implements ISonoscope {
  private _state: SourceState = { status: "empty" };
  private sourceGeneration = 0;
  private viewerGeneration = 0;
  private _viewport: IViewportController;
  private readonly events = new TypedEventEmitter<SonoscopeEvents>();
  private readonly viewers = new Set<IDataViewer>();
  private _clipStart: number | undefined;
  private _clipEnd: number | undefined;
  private audioElement: HTMLAudioElement | undefined;
  private audioCleanup: Array<() => void> = [];
  private navigationCleanups: Array<() => void> = [];
  private playheadCleanups: Array<() => void> = [];
  private sourceAbortController: AbortController | undefined;
  private externalAbortCleanup: (() => void) | undefined;
  private sourceRangeCleanup: (() => void) | undefined;
  private animationFrame: number | undefined;

  private totalDuration: number;
  private progressiveViewportDuration = 10;
  private updatingProgressiveDuration = false;
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

    let source = opts.source;

    if (!source) {
      this._clipStart = opts.clipStart;
      this._clipEnd = opts.clipEnd;
    } else if (opts.clipStart !== undefined || opts.clipEnd !== undefined) {
      this._clipStart = opts.clipStart;
      this._clipEnd = opts.clipEnd;
      if (!(source instanceof ClippedAudioSource)) {
        source = new ClippedAudioSource(source, {
          clipStart: opts.clipStart,
          clipEnd: opts.clipEnd,
        });
      }
    } else if (source instanceof ClippedAudioSource) {
      this._clipStart = source.clipStart;
      this._clipEnd = source.clipEnd;
    }

    this.totalDuration = source ? Math.max(0.01, source.duration) : 0.01;
    this.minDuration = Math.max(
      0.001,
      opts.minDuration ?? DEFAULT_MIN_DURATION,
    );
    this.maxDuration = Math.max(
      this.minDuration,
      opts.maxDuration ?? DEFAULT_MAX_DURATION,
    );
    this.followPlayback = opts.followPlayback ?? DEFAULT_FOLLOW_PLAYBACK;
    this.smoothAnchor = Math.max(
      0,
      Math.min(1, opts.smoothAnchor ?? DEFAULT_SMOOTH_ANCHOR),
    );

    const initialClipStart = this._clipStart ?? 0;
    const initialClipEnd = source
      ? (this._clipEnd ?? this.totalDuration)
      : Infinity;

    if (opts.viewport) {
      this._viewport = opts.viewport;
      if (source)
        this._viewport.setTimeBounds(initialClipStart, initialClipEnd);
    } else {
      const nyquist = source
        ? Math.max(100, Math.floor(source.sampleRate / 2))
        : 24000;
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
        ...(Number.isFinite(initialClipEnd) ? { maxTime: initialClipEnd } : {}),
        ...(source ? { totalDuration: this.totalDuration } : {}),
        minDuration: this.minDuration,
        maxDuration: this.maxDuration,
        minFrequency,
        maxFrequency,
        startTime: initialStartTime,
        endTime: Math.max(initialStartTime + this.minDuration, initialEndTime),
      });
    }

    this._viewport.on("viewportchange", (e) => {
      if (
        this._state.status === "ready" &&
        !this.updatingProgressiveDuration &&
        e.source !== "sourcechange" &&
        e.source !== "sourceprogress"
      ) {
        this.progressiveViewportDuration = e.viewport.duration;
      }
      this.events.emit("viewportchange", e);
    });
    this.progressiveViewportDuration = this._viewport.getViewport().duration;

    if (source) this._state = { status: "ready", source };

    if (opts.audio) {
      this.attachAudio(opts.audio);
    }
  }

  /** Active audio source. */
  get source(): AudioSource | undefined {
    return this._state.status === "ready" ? this._state.source : undefined;
  }

  get state(): SourceState {
    return this._state;
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
    const source = this.source;
    if (!source) throw new Error("No audio source is ready");
    return new Sonoscope({
      source,
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
    const sourceOptions = pickSourceOptions(options);
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
    const url = audio.src || audio.currentSrc;
    if (!url) {
      throw new Error("Audio element has no src or currentSrc");
    }
    const sourceOptions = pickSourceOptions(options);
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
    const sourceOptions = pickSourceOptions(options);
    const source = sourceOptions
      ? await createAudioSourceFromBlob(blob, sourceOptions)
      : await createAudioSourceFromBlob(blob);

    const audio = options?.audio;
    const scope = new Sonoscope({ ...options, source, audio });
    Sonoscope.attachAudioObjectUrl(scope, audio, () => blob);
    return scope;
  }

  static async fromBuffer(
    buffer: ArrayBuffer | Uint8Array,
    options?: Omit<SonoscopeOptions, "source">,
  ): Promise<Sonoscope> {
    const sourceOptions = pickSourceOptions(options);
    const source = sourceOptions
      ? await createAudioSourceFromBuffer(buffer, sourceOptions)
      : await createAudioSourceFromBuffer(buffer);

    const audio = options?.audio;
    const scope = new Sonoscope({ ...options, source, audio });
    Sonoscope.attachAudioObjectUrl(scope, audio, () => {
      const uint8 =
        buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      return new Blob([uint8 as unknown as BlobPart]);
    });
    return scope;
  }

  static fromArray(
    data: Float32Array | Float32Array[] | number[] | number[][],
    sampleRate: number,
    options?: Omit<SonoscopeOptions, "source">,
  ): Sonoscope {
    const source = new ArrayAudioSource(data, sampleRate);
    const audio = options?.audio;
    const scope = new Sonoscope({ ...options, source, audio });
    Sonoscope.attachAudioObjectUrl(scope, audio, () =>
      encodeWavBlob(data, sampleRate),
    );
    return scope;
  }

  private static attachAudioObjectUrl(
    scope: Sonoscope,
    audio: HTMLAudioElement | undefined,
    createBlob: () => Blob,
  ): void {
    if (
      !audio ||
      audio.src ||
      typeof URL === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      return;
    }
    const url = URL.createObjectURL(createBlob());
    audio.src = url;
    scope.audioCleanup.push(() => {
      URL.revokeObjectURL(url);
    });
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

  getDuration(): number | undefined {
    return this.source?.duration;
  }

  getSampleRate(): number | undefined {
    return this.source?.sampleRate;
  }

  getNyquist(): number | undefined {
    const source = this.source;
    return source ? Math.floor(source.sampleRate / 2) : undefined;
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
    const source = this.source;
    if (!source) throw new Error("No audio source is ready");
    const total = source.duration;
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

    if (source instanceof ClippedAudioSource) {
      source.setClipBounds({
        clipStart: newStart,
        clipEnd: newEnd,
      });
    }
    this.refreshViewersForSourceContext();

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
    if (this._state.status !== "ready") return;
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
    if (!this.source) throw new Error("No audio source is ready");
    const duration = this.getDuration();
    if (duration === undefined) throw new Error("No audio source is ready");
    const minBound = this._clipStart ?? 0;
    const maxBound = this._clipEnd ?? duration;
    const clamped = Math.max(minBound, Math.min(maxBound, time));
    if (this.audioElement) {
      this.audioElement.currentTime = clamped;
    }
    this.events.emit("timeupdate", { currentTime: clamped });
    this.checkPlaybackFollow(clamped);
  }

  setSource(source: AudioSource): void {
    const generation = this.beginSourceReplacement();
    try {
      this.installSource(source, generation);
    } catch (error) {
      if (generation === this.sourceGeneration) {
        this.transitionSourceState({
          status: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
      throw error;
    }
  }

  private beginSourceReplacement(
    updateAudio?: () => void,
    controller?: AbortController,
    externalSignal?: AbortSignal,
  ): number {
    this.sourceAbortController?.abort();
    this.sourceRangeCleanup?.();
    this.sourceRangeCleanup = undefined;
    this.externalAbortCleanup?.();
    this.externalAbortCleanup = undefined;
    this.sourceAbortController = controller;
    const generation = ++this.sourceGeneration;
    let externalAborted = false;
    if (controller && externalSignal) {
      const abortCurrent = () => {
        externalAborted = true;
        controller.abort(externalSignal.reason);
        if (generation !== this.sourceGeneration) return;
        this.sourceAbortController = undefined;
        this.externalAbortCleanup?.();
        this.externalAbortCleanup = undefined;
        this.sourceGeneration += 1;
        this.transitionSourceState({ status: "empty" });
      };
      externalSignal.addEventListener("abort", abortCurrent, { once: true });
      this.externalAbortCleanup = () =>
        externalSignal.removeEventListener("abort", abortCurrent);
    }
    try {
      this.transitionSourceState({ status: "loading" }, updateAudio);
      if (externalSignal?.aborted && !externalAborted) {
        externalAborted = true;
        controller?.abort(externalSignal.reason);
        if (generation === this.sourceGeneration) {
          this.sourceAbortController = undefined;
          this.externalAbortCleanup?.();
          this.externalAbortCleanup = undefined;
          this.sourceGeneration += 1;
          this.transitionSourceState({ status: "empty" });
        }
      }
    } catch (error) {
      if (generation === this.sourceGeneration) {
        if (this.sourceAbortController === controller)
          this.sourceAbortController = undefined;
        this.externalAbortCleanup?.();
        this.externalAbortCleanup = undefined;
        this.transitionSourceState({
          status: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
      throw error;
    }
    return generation;
  }

  private transitionSourceState(
    state: SourceState,
    beforeEmit?: () => void,
  ): void {
    const previousState = this._state;
    this._state = state;
    this.viewerGeneration += 1;
    for (const viewer of this.viewers) {
      viewer.setSourceState(state, this.viewerGeneration);
    }
    beforeEmit?.();
    this.events.emit("statechange", { state, previousState });
  }

  private installSource(source: AudioSource, generation: number): void {
    if (generation !== this.sourceGeneration) return;
    const previousState = this._state;
    let installedSource = source;
    if (source instanceof ClippedAudioSource) {
      this._clipStart = source.clipStart;
      this._clipEnd = source.clipEnd;
    } else if (this._clipStart !== undefined || this._clipEnd !== undefined) {
      const rawTotal = Math.max(0.01, source.duration);
      const clipStart = Math.min(this._clipStart ?? 0, rawTotal);
      const clipEnd = Math.min(this._clipEnd ?? rawTotal, rawTotal);
      this._clipStart = this._clipStart !== undefined ? clipStart : undefined;
      this._clipEnd = this._clipEnd !== undefined ? clipEnd : undefined;
      installedSource = new ClippedAudioSource(source, { clipStart, clipEnd });
    }

    this.totalDuration = Math.max(0.01, installedSource.duration);
    const nyquist = Math.max(100, Math.floor(installedSource.sampleRate / 2));
    const effectiveMinTime = this._clipStart ?? 0;
    const effectiveMaxTime = this._clipEnd ?? this.totalDuration;

    if (this._viewport instanceof ViewportController) {
      this._viewport.setTotalDuration(installedSource.duration);
      this._viewport.setBaseFrequencyBounds(0, nyquist);
      this._viewport.setTimeBounds(effectiveMinTime, effectiveMaxTime);
    }

    const vp = this._viewport.getViewport();
    const currentDuration = Math.min(
      vp.duration,
      effectiveMaxTime - effectiveMinTime,
    );
    const clampedStart = Math.max(
      effectiveMinTime,
      Math.min(vp.startTime, effectiveMaxTime - currentDuration),
    );

    this._viewport.setViewport(
      {
        startTime: clampedStart,
        endTime: clampedStart + currentDuration,
        minFrequency: 0,
        maxFrequency: nyquist,
      },
      "sourcechange",
    );

    if (this.audioElement) {
      if (
        this.audioElement.currentTime < effectiveMinTime ||
        this.audioElement.currentTime > effectiveMaxTime
      ) {
        this.audioElement.currentTime = effectiveMinTime;
      }
    }

    if (this.audioElement && this.followPlayback !== "off") {
      this.checkPlaybackFollow(this.audioElement.currentTime);
    }
    if (generation !== this.sourceGeneration) return;

    const readyState: SourceState = {
      status: "ready",
      source: installedSource,
    };
    this._state = readyState;
    this.sourceRangeCleanup?.();
    this.sourceRangeCleanup = installedSource.onRangeAvailable?.((range) => {
      if (
        generation !== this.sourceGeneration ||
        this.source !== installedSource
      )
        return;
      this.updateProgressiveDuration(installedSource, range.endTime);
    });
    this.viewerGeneration += 1;
    for (const viewer of this.viewers)
      viewer.setSourceState(readyState, this.viewerGeneration);
    this.events.emit("statechange", { state: readyState, previousState });
    if (generation !== this.sourceGeneration) return;
    this.events.emit("sourcechange", { source: installedSource });
    if (generation !== this.sourceGeneration) return;
    if (this._clipStart !== undefined || this._clipEnd !== undefined) {
      this.events.emit("clipchange", {
        clipStart: this._clipStart,
        clipEnd: this._clipEnd,
      });
    }
  }

  private updateProgressiveDuration(
    source: AudioSource,
    availableEnd: number,
  ): void {
    const duration = Math.max(source.duration, availableEnd);
    if (
      !Number.isFinite(duration) ||
      duration - this.totalDuration < PROGRESSIVE_DURATION_STEP
    )
      return;

    const previousDuration = this.totalDuration;
    const viewport = this._viewport.getViewport();
    const preferredViewportDuration = this.progressiveViewportDuration;
    const wasAtAvailableEnd = viewport.endTime >= previousDuration - 0.001;
    this.totalDuration = duration;

    const minTime = this._clipStart ?? 0;
    const maxTime = this._clipEnd ?? duration;
    if (this._viewport instanceof ViewportController) {
      this.updatingProgressiveDuration = true;
      try {
        this._viewport.setTotalDuration(duration);
        this._viewport.setTimeBounds(minTime, maxTime);
      } finally {
        this.updatingProgressiveDuration = false;
      }
    }

    if (wasAtAvailableEnd) {
      const endTime = Math.min(
        maxTime,
        viewport.startTime +
          Math.min(
            this.maxDuration,
            preferredViewportDuration,
            duration - viewport.startTime,
          ),
      );
      if (endTime > viewport.endTime + 0.001) {
        this._viewport.setViewport(
          { startTime: viewport.startTime, endTime },
          "sourceprogress",
        );
      }
    }
  }

  private refreshViewersForSourceContext(): void {
    this.viewerGeneration += 1;
    for (const viewer of this.viewers) {
      viewer.setSourceState(this._state, this.viewerGeneration);
    }
  }

  private async replaceSource(
    load: (signal: AbortSignal) => Promise<AudioSource>,
    updateAudio?: () => void,
    externalSignal?: AbortSignal,
  ): Promise<void> {
    const controller = new AbortController();
    const generation = this.beginSourceReplacement(
      updateAudio,
      controller,
      externalSignal,
    );
    try {
      const source = await load(controller.signal);
      if (generation !== this.sourceGeneration || controller.signal.aborted)
        return;
      this.installSource(source, generation);
    } catch (error) {
      if (generation !== this.sourceGeneration || controller.signal.aborted)
        return;
      this.sourceAbortController = undefined;
      this.externalAbortCleanup?.();
      this.externalAbortCleanup = undefined;
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this.transitionSourceState({ status: "error", error: normalizedError });
      throw error;
    }
  }

  /**
   * Replaces the audio source from a remote URL and updates all attached viewers.
   * Automatically aborts any in-flight source loads on this coordinator.
   */
  async setUrl(url: string, options?: AudioSourceOptions): Promise<void> {
    await this.replaceSource(
      (signal) =>
        createAudioSourceFromUrl(url, sourceOptionsWithSignal(options, signal)),
      () => {
        if (!this.audioElement) return;
        this.audioElement.pause?.();
        this.audioElement.removeAttribute?.("src");
        this.audioElement.load?.();
        this.audioElement.src = url;
        this.audioElement.load?.();
      },
      options && "signal" in options ? options.signal : undefined,
    );
  }

  /**
   * Replaces the audio source from an HTML audio element and updates all attached viewers.
   * Connects the audio element to the coordinator if not already connected.
   */
  async setAudio(
    audio: HTMLAudioElement,
    options?: AudioSourceOptions,
  ): Promise<void> {
    const url = audio.src || audio.currentSrc;
    if (!url) {
      throw new Error("Audio element has no src or currentSrc");
    }
    if (this.audioElement !== audio) {
      this.attachAudio(audio);
    }
    await this.setUrl(url, options);
  }

  /**
   * Replaces the audio source from a Blob or File and updates all attached viewers.
   */
  async setBlob(blob: Blob, options?: AudioSourceOptions): Promise<void> {
    await this.replaceSource(
      (signal) =>
        createAudioSourceFromBlob(
          blob,
          sourceOptionsWithSignal(options, signal),
        ),
      () => {
        if (!this.audioElement) return;
        this.audioElement.pause?.();
        this.audioElement.removeAttribute?.("src");
        this.audioElement.load?.();
        Sonoscope.attachAudioObjectUrl(this, this.audioElement!, () => blob);
      },
      options && "signal" in options ? options.signal : undefined,
    );
  }

  /**
   * Replaces the audio source from raw sample array and updates all attached viewers.
   */
  setArray(
    samples: Float32Array,
    sampleRate: number,
    options?: AudioSourceOptions,
  ): void {
    const generation = this.beginSourceReplacement(() => {
      if (!this.audioElement) return;
      this.audioElement.pause?.();
      this.audioElement.removeAttribute?.("src");
      this.audioElement.load?.();
      Sonoscope.attachAudioObjectUrl(this, this.audioElement, () =>
        encodeWavBlob(samples, sampleRate),
      );
    });
    try {
      const source = wrapClippedIfNeeded(
        new ArrayAudioSource(samples, sampleRate),
        options,
      );
      this.installSource(source, generation);
    } catch (error) {
      if (generation === this.sourceGeneration) {
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        this.transitionSourceState({ status: "error", error: normalizedError });
      }
      throw error;
    }
  }

  /**
   * Replaces the audio source from an in-memory buffer and updates all attached viewers.
   */
  async setBuffer(
    buffer: ArrayBuffer | Uint8Array,
    options?: AudioSourceOptions,
  ): Promise<void> {
    await this.replaceSource(
      (signal) =>
        createAudioSourceFromBuffer(
          buffer,
          sourceOptionsWithSignal(options, signal),
        ),
      () => {
        if (!this.audioElement) return;
        this.audioElement.pause?.();
        this.audioElement.removeAttribute?.("src");
        this.audioElement.load?.();
        Sonoscope.attachAudioObjectUrl(this, this.audioElement, () => {
          const bytes =
            buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
          return new Blob([bytes as unknown as BlobPart], {
            type: "audio/wav",
          });
        });
      },
      options && "signal" in options ? options.signal : undefined,
    );
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
    },
  ): SpectrogramViewer {
    const initialSource = this.source;
    const viewer = new SpectrogramViewer(
      canvas,
      options?.viewport ?? this._viewport,
      initialSource,
      options,
    );
    this.viewers.add(viewer);
    if (initialSource !== this.source) {
      viewer.setSourceState(
        initialSource
          ? { status: "ready", source: initialSource }
          : this._state,
        this.viewerGeneration,
      );
    } else if (!initialSource) {
      viewer.setSourceState(this._state, this.viewerGeneration);
    }
    return viewer;
  }

  /**
   * Creates and attaches a WaveformViewer to a canvas element.
   * @param canvas HTML canvas element for rendering.
   * @param options Waveform visual configuration.
   */
  createWaveform(
    canvas: HTMLCanvasElement,
    options?: Partial<WaveformOptions> & {
      viewport?: IViewportController | undefined;
    },
  ): WaveformViewer {
    const initialSource = this.source;
    const viewer = new WaveformViewer(
      canvas,
      options?.viewport ?? this._viewport,
      initialSource,
      options,
    );
    this.viewers.add(viewer);
    if (initialSource !== this.source) {
      viewer.setSourceState(
        initialSource
          ? { status: "ready", source: initialSource }
          : this._state,
        this.viewerGeneration,
      );
    } else if (!initialSource) {
      viewer.setSourceState(this._state, this.viewerGeneration);
    }
    return viewer;
  }

  /**
   * Creates and attaches a TimeRulerLocator to a canvas element.
   * @param canvas HTML canvas element for rendering.
   * @param options Ruler appearance and tick formatting options.
   */
  createTimeRuler(
    canvas: HTMLCanvasElement,
    options?: Partial<TimeRulerOptions> & {
      viewport?: IViewportController | undefined;
    },
  ): TimeRulerLocator {
    return new TimeRulerLocator(
      canvas,
      options?.viewport ?? this._viewport,
      options,
    );
  }

  /**
   * Creates and attaches a FrequencyRulerLocator to a canvas element.
   * @param canvas HTML canvas element for rendering.
   * @param options Frequency scale and tick formatting options.
   */
  createFrequencyRuler(
    canvas: HTMLCanvasElement,
    options?: Partial<FrequencyRulerOptions> & {
      viewport?: IViewportController | undefined;
    },
  ): FrequencyRulerLocator {
    return new FrequencyRulerLocator(
      canvas,
      options?.viewport ?? this._viewport,
      options,
    );
  }

  /**
   * Registers a custom viewer factory globally under a unique name.
   */
  static registerViewer<
    TOptions = unknown,
    TViewer extends ISonoscopeViewer = ISonoscopeViewer,
  >(name: string, factory: CustomViewerFactory<TOptions, TViewer>): void {
    registerCustomViewer(name, factory);
  }

  /**
   * Unregisters a custom viewer factory.
   */
  static unregisterViewer(name: string): boolean {
    return unregisterCustomViewer(name);
  }

  /**
   * Creates a custom viewer instance (registered name or direct factory function)
   * attached to this Sonoscope instance.
   */
  createViewer<
    TOptions = unknown,
    TViewer extends ISonoscopeViewer = ISonoscopeViewer,
  >(
    nameOrFactory: string | CustomViewerFactory<TOptions, TViewer>,
    canvas: HTMLCanvasElement,
    options?: TOptions,
  ): TViewer {
    const factory =
      typeof nameOrFactory === "function"
        ? nameOrFactory
        : getRegisteredViewer<TOptions, TViewer>(nameOrFactory);
    if (!factory) {
      throw new Error(
        `No viewer registered with name "${String(nameOrFactory)}"`,
      );
    }
    const viewer = factory(this, canvas, options);
    if (
      viewer &&
      typeof (viewer as unknown as IDataViewer).setSourceState === "function"
    ) {
      const dataViewer = viewer as unknown as IDataViewer;
      this.viewers.add(dataViewer);
      dataViewer.setSourceState(this._state, this.viewerGeneration);
    }
    return viewer;
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

  /**
   * Attaches a synchronized playback playhead overlay to a DOM container.
   * @param container DOM element that will host the playhead line.
   * @param options Visual styling options for the playhead overlay.
   * @returns Cleanup function that removes the playhead element and unsubscribes event listeners.
   */
  attachPlayhead(
    container: HTMLElement,
    options?: PlayheadOverlayOptions,
  ): () => void {
    const overlay = attachPlayheadOverlay(container, this, options);
    const cleanup = () => {
      overlay.destroy();
    };
    this.playheadCleanups.push(cleanup);
    return () => {
      const idx = this.playheadCleanups.indexOf(cleanup);
      if (idx !== -1) this.playheadCleanups.splice(idx, 1);
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
    this.sourceRangeCleanup?.();
    this.sourceRangeCleanup = undefined;
    this.externalAbortCleanup?.();
    this.externalAbortCleanup = undefined;
    this.sourceAbortController?.abort();
    this.sourceAbortController = undefined;
    this.sourceGeneration += 1;
    this.detachAudio();
    for (const cleanup of this.navigationCleanups) {
      cleanup();
    }
    this.navigationCleanups = [];
    for (const cleanup of this.playheadCleanups) {
      cleanup();
    }
    this.playheadCleanups = [];
    this.events.emit("destroy", undefined);
    this.events.clear();
  }
}

function pickSourceOptions(options?: Partial<SonoscopeOptions>):
  | {
      preferStreaming?: boolean | undefined;
      preferDecoded?: boolean | undefined;
      sampleRate?: number | undefined;
    }
  | undefined {
  return options?.preferStreaming !== undefined ||
    options?.preferDecoded !== undefined ||
    options?.sampleRate !== undefined
    ? {
        preferStreaming: options.preferStreaming,
        preferDecoded: options.preferDecoded,
        sampleRate: options.sampleRate,
      }
    : undefined;
}
