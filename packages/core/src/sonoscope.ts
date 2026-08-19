import type { NavigableViewer, NavigationOptions } from "./navigation";
import type {
  AudioSource,
  FollowPlaybackMode,
  FrequencyScale,
  ISonoscope,
  SonoscopeEvents,
  SonoscopeOptions,
  ViewportState,
} from "./types";
import type { FrequencyRulerOptions } from "./viewers/frequency-ruler/types";
import type { SpectrogramOptions } from "./viewers/spectrogram/types";
import type { TimeRulerOptions } from "./viewers/time-ruler/types";
import type { WaveformOptions } from "./viewers/waveform/types";
import { type AutoResizeOptions, attachAutoResize } from "./auto-resize";
import { TypedEventEmitter } from "./events";
import { attachNavigation } from "./navigation";
import { ArrayAudioSource } from "./sources/array-source";
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
import { clampViewportTimes } from "./viewport-math";

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
  return setTimeout(callback, 16) as unknown as number;
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
  private audioElement: HTMLAudioElement | undefined;
  private audioCleanup: Array<() => void> = [];
  private navigationCleanups: Array<() => void> = [];
  private readonly events = new TypedEventEmitter<SonoscopeEvents>();
  private animationFrame: number | undefined;

  private startTime: number;
  private endTime: number;
  private minFrequency: number;
  private maxFrequency: number;
  private frequencyScale: FrequencyScale;
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
    this.totalDuration = Math.max(0.01, this._source.duration);
    this.minDuration = Math.max(0.001, opts.minDuration ?? 0.05);
    this.maxDuration = Math.max(
      this.minDuration,
      opts.maxDuration ?? Math.min(30, this.totalDuration),
    );
    this.followPlayback = opts.followPlayback ?? "page";
    this.smoothAnchor = Math.max(0, Math.min(1, opts.smoothAnchor ?? 0.5));

    const nyquist = Math.max(100, Math.floor(this._source.sampleRate / 2));
    this.frequencyScale = opts.frequencyScale ?? "linear";
    this.minFrequency =
      opts.minFrequency ?? (this.frequencyScale === "log" ? 20 : 0);
    this.maxFrequency = opts.maxFrequency ?? nyquist;

    const initialStart = opts.startTime ?? 0;
    const initialEnd = opts.endTime ?? Math.min(10, this.totalDuration);
    const clamped = clampViewportTimes(
      initialStart,
      initialEnd,
      this.totalDuration,
      this.minDuration,
      this.maxDuration,
    );
    this.startTime = clamped.startTime;
    this.endTime = clamped.endTime;

    if (opts.audio) {
      this.attachAudio(opts.audio);
    }
  }

  get source(): AudioSource {
    return this._source;
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
    return {
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime - this.startTime,
      totalDuration: this.totalDuration,
      minFrequency: this.minFrequency,
      maxFrequency: this.maxFrequency,
      frequencyScale: this.frequencyScale,
    };
  }

  setViewport(
    vp: Partial<{
      startTime: number | undefined;
      endTime: number | undefined;
      minFrequency: number | undefined;
      maxFrequency: number | undefined;
      frequencyScale: FrequencyScale | undefined;
    }>,
    source?: string | undefined,
  ): void {
    let changed = false;

    if (vp.startTime !== undefined || vp.endTime !== undefined) {
      const targetStart = Number.isFinite(vp.startTime)
        ? (vp.startTime as number)
        : this.startTime;
      const targetEnd = Number.isFinite(vp.endTime)
        ? (vp.endTime as number)
        : this.endTime;
      const clamped = clampViewportTimes(
        targetStart,
        targetEnd,
        this.totalDuration,
        this.minDuration,
        this.maxDuration,
      );

      if (
        Math.abs(clamped.startTime - this.startTime) >= 1e-6 ||
        Math.abs(clamped.endTime - this.endTime) >= 1e-6
      ) {
        this.startTime = clamped.startTime;
        this.endTime = clamped.endTime;
        changed = true;
      }
    }

    if (
      vp.minFrequency !== undefined &&
      Math.abs(this.minFrequency - vp.minFrequency) >= 1e-6
    ) {
      this.minFrequency = vp.minFrequency;
      changed = true;
    }

    if (
      vp.maxFrequency !== undefined &&
      Math.abs(this.maxFrequency - vp.maxFrequency) >= 1e-6
    ) {
      this.maxFrequency = vp.maxFrequency;
      changed = true;
    }

    if (
      vp.frequencyScale !== undefined &&
      this.frequencyScale !== vp.frequencyScale
    ) {
      this.frequencyScale = vp.frequencyScale;
      changed = true;
    }

    if (changed) {
      this.events.emit("viewportchange", {
        viewport: this.getViewport(),
        source,
      });
    }
  }

  updateViewport(
    vp: Partial<{
      startTime: number | undefined;
      endTime: number | undefined;
      minFrequency: number | undefined;
      maxFrequency: number | undefined;
      frequencyScale: FrequencyScale | undefined;
    }>,
    source?: string | undefined,
  ): void {
    this.setViewport(vp, source);
  }

  zoom(factor: number, centerTime?: number, source?: string): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const duration = this.endTime - this.startTime;
    const center = Number.isFinite(centerTime)
      ? (centerTime as number)
      : (this.startTime + this.endTime) / 2;
    const targetDuration = Math.max(
      this.minDuration,
      Math.min(this.maxDuration, this.totalDuration, duration * factor),
    );

    if (Math.abs(targetDuration - duration) < 1e-9) return;

    const ratio = (center - this.startTime) / (duration || 1);
    const startTime = Math.max(
      0,
      Math.min(
        this.totalDuration - targetDuration,
        center - targetDuration * ratio,
      ),
    );

    this.setViewport(
      { startTime, endTime: startTime + targetDuration },
      source,
    );
  }

  zoomTime(factor: number, centerTime?: number, source?: string): void {
    this.zoom(factor, centerTime, source);
  }

  pan(deltaSeconds: number, source?: string): void {
    if (!Number.isFinite(deltaSeconds)) return;
    const duration = this.endTime - this.startTime;
    const nextStart = Math.max(
      0,
      Math.min(this.totalDuration - duration, this.startTime + deltaSeconds),
    );
    this.setViewport(
      { startTime: nextStart, endTime: nextStart + duration },
      source,
    );
  }

  panTo(startTime: number, source?: string): void {
    if (!Number.isFinite(startTime)) return;
    const duration = this.endTime - this.startTime;
    const nextStart = Math.max(
      0,
      Math.min(this.totalDuration - duration, startTime),
    );
    this.setViewport(
      { startTime: nextStart, endTime: nextStart + duration },
      source,
    );
  }

  zoomFrequency(
    factor: number,
    centerFrequency?: number,
    source?: string,
  ): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const currentSpan = this.maxFrequency - this.minFrequency;
    const nyquist = this.getNyquist();
    const minSpan = 10;
    const maxSpan = nyquist;
    const targetSpan = Math.max(
      minSpan,
      Math.min(maxSpan, currentSpan * factor),
    );
    if (Math.abs(targetSpan - currentSpan) < 1e-9) return;

    const center = Number.isFinite(centerFrequency)
      ? (centerFrequency as number)
      : (this.minFrequency + this.maxFrequency) / 2;
    const ratio =
      currentSpan <= 0 ? 0.5 : (center - this.minFrequency) / currentSpan;
    const newMin = Math.max(
      0,
      Math.min(nyquist - targetSpan, center - targetSpan * ratio),
    );
    const newMax = newMin + targetSpan;

    this.setViewport({ minFrequency: newMin, maxFrequency: newMax }, source);
  }

  zoomFreq(factor: number, centerFrequency?: number, source?: string): void {
    this.zoomFrequency(factor, centerFrequency, source);
  }

  zoomBoth(
    factor: number | { time: number; frequency: number },
    center?: { time?: number; frequency?: number },
    source?: string,
  ): void {
    const timeFactor = typeof factor === "number" ? factor : factor.time;
    const freqFactor = typeof factor === "number" ? factor : factor.frequency;

    let nextStartTime = this.startTime;
    let nextEndTime = this.endTime;
    let nextMinFreq = this.minFrequency;
    let nextMaxFreq = this.maxFrequency;

    if (Number.isFinite(timeFactor) && timeFactor > 0) {
      const duration = this.endTime - this.startTime;
      const cTime = Number.isFinite(center?.time)
        ? (center!.time as number)
        : (this.startTime + this.endTime) / 2;
      const targetDuration = Math.max(
        this.minDuration,
        Math.min(this.maxDuration, this.totalDuration, duration * timeFactor),
      );
      if (Math.abs(targetDuration - duration) >= 1e-9) {
        const ratio = (cTime - this.startTime) / (duration || 1);
        nextStartTime = Math.max(
          0,
          Math.min(
            this.totalDuration - targetDuration,
            cTime - targetDuration * ratio,
          ),
        );
        nextEndTime = nextStartTime + targetDuration;
      }
    }

    if (Number.isFinite(freqFactor) && freqFactor > 0) {
      const currentSpan = this.maxFrequency - this.minFrequency;
      const nyquist = this.getNyquist();
      const minSpan = 10;
      const maxSpan = nyquist;
      const targetSpan = Math.max(
        minSpan,
        Math.min(maxSpan, currentSpan * freqFactor),
      );
      if (Math.abs(targetSpan - currentSpan) >= 1e-9) {
        const cFreq = Number.isFinite(center?.frequency)
          ? (center!.frequency as number)
          : (this.minFrequency + this.maxFrequency) / 2;
        const ratio =
          currentSpan <= 0 ? 0.5 : (cFreq - this.minFrequency) / currentSpan;
        nextMinFreq = Math.max(
          0,
          Math.min(nyquist - targetSpan, cFreq - targetSpan * ratio),
        );
        nextMaxFreq = nextMinFreq + targetSpan;
      }
    }

    this.setViewport(
      {
        startTime: nextStartTime,
        endTime: nextEndTime,
        minFrequency: nextMinFreq,
        maxFrequency: nextMaxFreq,
      },
      source,
    );
  }

  panFrequency(deltaHz: number, source?: string): void {
    if (!Number.isFinite(deltaHz) || deltaHz === 0) return;
    const span = this.maxFrequency - this.minFrequency;
    const nyquist = this.getNyquist();
    const newMin = Math.max(
      0,
      Math.min(nyquist - span, this.minFrequency + deltaHz),
    );
    this.setViewport(
      { minFrequency: newMin, maxFrequency: newMin + span },
      source,
    );
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
    const duration = this.endTime - this.startTime;

    if (this.followPlayback === "page") {
      if (currentTime >= this.endTime || currentTime < this.startTime) {
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
      const currentTime = this.getCurrentTime();
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

    const onTimeUpdate = () => {
      this.events.emit("timeupdate", { currentTime: audio.currentTime });
      this.checkPlaybackFollow(audio.currentTime);
    };
    const onPlay = () => {
      this.startPlaybackLoop();
    };
    const onPause = () => {
      this.stopPlaybackLoop();
      this.events.emit("timeupdate", { currentTime: audio.currentTime });
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
    this.events.emit("timeupdate", { currentTime: audio.currentTime });
    this.checkPlaybackFollow(audio.currentTime);

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
    const clamped = Math.max(0, Math.min(this.getDuration(), time));
    if (this.audioElement) {
      this.audioElement.currentTime = clamped;
    }
    this.events.emit("timeupdate", { currentTime: clamped });
    this.checkPlaybackFollow(clamped);
  }

  setSource(source: AudioSource): void {
    this._source = source;
    this.totalDuration = Math.max(0.01, source.duration);
    this.setViewport({ startTime: this.startTime, endTime: this.endTime });
    this.events.emit("sourcechange", { source });
  }

  createSpectrogram(
    canvas: HTMLCanvasElement,
    options?: Partial<SpectrogramOptions>,
  ): SpectrogramViewer {
    return new SpectrogramViewer(this, canvas, options);
  }

  createWaveform(
    canvas: HTMLCanvasElement,
    options?: Partial<WaveformOptions>,
  ): WaveformViewer {
    return new WaveformViewer(this, canvas, options);
  }

  createTimeRuler(
    canvas: HTMLCanvasElement,
    options?: Partial<TimeRulerOptions>,
  ): TimeRulerViewer {
    return new TimeRulerViewer(this, canvas, options);
  }

  createFrequencyRuler(
    canvas: HTMLCanvasElement,
    options?: Partial<FrequencyRulerOptions>,
  ): FrequencyRulerViewer {
    return new FrequencyRulerViewer(this, canvas, options);
  }

  attachNavigation(
    container: HTMLElement,
    options?: NavigationOptions,
  ): () => void {
    if (
      (typeof HTMLElement !== "undefined" &&
        container instanceof HTMLElement) ||
      (typeof container === "object" &&
        container !== null &&
        "addEventListener" in container)
    ) {
      const scopeAdapter: NavigableViewer = {
        getViewport: () => {
          const vp = this.getViewport();
          return {
            startTime: vp.startTime,
            endTime: vp.endTime,
            minFrequency: vp.minFrequency,
            maxFrequency: vp.maxFrequency,
            frequencyScale: vp.frequencyScale,
          };
        },
        setViewport: (vp) => {
          this.setViewport(vp, "navigation");
        },
        requestRender: () => {},
        getCanvas: () => container,
        getScope: () => this,
        getConfig: () => ({
          canvas: container,
          minViewportDuration: this.minDuration,
          maxViewportDuration: this.maxDuration,
          minFrequency: 0,
          maxFrequency: this.getNyquist(),
        }),
        getTimeBounds: () => ({
          startTime: 0,
          endTime: this.totalDuration,
          minDurationSeconds: this.minDuration,
          maxDurationSeconds: this.maxDuration,
        }),
        getFrequencyBounds: () => ({
          minFrequency: 0,
          maxFrequency: this.getNyquist(),
          minSpanHz: 20,
        }),
      };

      const cleanup = attachNavigation(scopeAdapter, container, options);
      this.navigationCleanups.push(cleanup);
      return () => {
        const idx = this.navigationCleanups.indexOf(cleanup);
        if (idx !== -1) this.navigationCleanups.splice(idx, 1);
        cleanup();
      };
    }

    throw new Error(
      "Invalid navigation target: expected DOM container element",
    );
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
