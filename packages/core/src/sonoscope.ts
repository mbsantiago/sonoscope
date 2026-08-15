import { TypedEventEmitter } from "./events";
import { createAudioSourceFromUrl, DecodedAudioSource } from "./sources/source";
import type { AudioSource, SpectrogramConfig } from "./types";
import { SpectrogramViewer } from "./viewer";
import {
  type FollowPlaybackMode,
  ViewportController,
  type ViewportState,
} from "./viewport-controller";
import type { WaveformConfig } from "./waveform/types";
import { WaveformViewer } from "./waveform/viewer";

export type SonoscopeOptions = {
  source: AudioSource;
  audio?: HTMLAudioElement | undefined;
  startTime?: number | undefined;
  endTime?: number | undefined;
  minDuration?: number | undefined;
  maxDuration?: number | undefined;
  followPlayback?: FollowPlaybackMode | undefined;
  smoothAnchor?: number | undefined;
};

export type SonoscopeEvents = {
  viewportchange: { viewport: ViewportState; source?: string | undefined };
  playbackchange: { mode: FollowPlaybackMode };
  timeupdate: { currentTime: number };
  sourcechange: { source: AudioSource };
  audiochange: { audio: HTMLAudioElement | undefined };
  destroy: undefined;
};

export class Sonoscope {
  private _source: AudioSource;
  private audioElement: HTMLAudioElement | undefined;
  private audioCleanup: Array<() => void> = [];
  private readonly controllerCleanup: Array<() => void> = [];
  private readonly events = new TypedEventEmitter<SonoscopeEvents>();
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
    const source = await createAudioSourceFromUrl(url);
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
    const source = await createAudioSourceFromUrl(url);
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
    vp: Partial<{ startTime: number; endTime: number }>,
    source?: string,
  ): void {
    this.viewportController.setViewport(vp, source);
  }

  updateViewport(
    vp: Partial<{ startTime: number; endTime: number }>,
    source?: string,
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

  attachAudio(audio: HTMLAudioElement): void {
    this.detachAudio();
    this.audioElement = audio;
    this.viewportController.attachAudio(audio);

    const onTimeUpdate = () => {
      this.events.emit("timeupdate", { currentTime: audio.currentTime });
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("seeked", onTimeUpdate);

    this.audioCleanup.push(() => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("seeked", onTimeUpdate);
    });

    this.events.emit("audiochange", { audio });
    this.events.emit("timeupdate", { currentTime: audio.currentTime });
  }

  detachAudio(): void {
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
    options?: Omit<SpectrogramConfig, "source" | "canvas" | "audio">,
  ): SpectrogramViewer {
    return new SpectrogramViewer(this, canvas, options);
  }

  createWaveform(
    canvas: HTMLCanvasElement,
    options?: Omit<WaveformConfig, "source" | "canvas" | "audio">,
  ): WaveformViewer {
    return new WaveformViewer(this, canvas, options);
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
