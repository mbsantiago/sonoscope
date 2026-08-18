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
import { TypedEventEmitter } from "./events";
import { createAudioSourceFromUrl, DecodedAudioSource } from "./sources/source";
import { FrequencyRulerViewer } from "./viewers/frequency-ruler/viewer";
import { SpectrogramViewer } from "./viewers/spectrogram/viewer";
import { TimeRulerViewer } from "./viewers/time-ruler/viewer";
import { WaveformViewer } from "./viewers/waveform/viewer";
import { ViewportController } from "./viewport-controller";

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
  private readonly controllerCleanup: Array<() => void> = [];
  private readonly events = new TypedEventEmitter<SonoscopeEvents>();
  private animationFrame: number | undefined;
  readonly viewportController: ViewportController;

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

    this.viewportController = new ViewportController({
      totalDuration: this._source.duration,
      startTime: opts.startTime,
      endTime: opts.endTime,
      minFrequency: opts.minFrequency,
      maxFrequency: opts.maxFrequency,
      frequencyScale: opts.frequencyScale,
      minDuration: opts.minDuration,
      maxDuration: opts.maxDuration,
      followPlayback: opts.followPlayback,
      smoothAnchor: opts.smoothAnchor,
    });

    const unlistenChange = this.viewportController.on("change", (e) => {
      this.events.emit("viewportchange", {
        viewport: e.viewport,
        source: e.source,
      });
    });
    const unlistenFollow = this.viewportController.on("followchange", (e) => {
      this.events.emit("playbackchange", {
        mode: e.mode,
      });
    });
    this.controllerCleanup.push(unlistenChange, unlistenFollow);

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

  getViewport(): ViewportState {
    return this.viewportController.getViewport();
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
    this.viewportController.setViewport(vp, source);
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
    this.viewportController.updateViewport(vp, source);
  }

  zoom(factor: number, centerTime?: number, source?: string): void {
    this.viewportController.zoom(factor, centerTime, source);
  }

  pan(deltaSeconds: number, source?: string): void {
    this.viewportController.pan(deltaSeconds, source);
  }

  panTo(startTime: number, source?: string): void {
    this.viewportController.panTo(startTime, source);
  }

  getDuration(): number {
    return this._source.duration;
  }

  getSampleRate(): number {
    return this._source.sampleRate;
  }

  getFollowPlayback(): FollowPlaybackMode {
    return this.viewportController.getFollowPlayback();
  }

  setFollowPlayback(mode: FollowPlaybackMode): void {
    this.viewportController.setFollowPlayback(mode);
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

  private startPlaybackLoop(): void {
    if (this.animationFrame !== undefined) return;
    const tick = () => {
      if (!this.isPlaying()) {
        this.stopPlaybackLoop();
        return;
      }
      this.events.emit("timeupdate", { currentTime: this.getCurrentTime() });
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
    this.viewportController.attachAudio(audio);

    const onTimeUpdate = () => {
      this.events.emit("timeupdate", { currentTime: audio.currentTime });
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
    this.viewportController.detachAudio();
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
  }

  setSource(source: AudioSource): void {
    this._source = source;
    this.viewportController.setTotalDuration(source.duration);
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

  on<K extends keyof SonoscopeEvents>(
    event: K,
    handler: (e: SonoscopeEvents[K]) => void,
  ): () => void {
    return this.events.on(event, handler);
  }

  destroy(): void {
    this.detachAudio();
    for (const cleanup of this.controllerCleanup) {
      cleanup();
    }
    this.controllerCleanup.length = 0;
    this.viewportController.destroy();
    this.events.emit("destroy", undefined);
    this.events.clear();
  }
}
