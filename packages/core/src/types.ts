import type { NavigationOptions } from "./navigation";

export type Rgba = [number, number, number, number];

export type BuiltInColorMap =
  // Perceptually Uniform
  | "viridis"
  | "magma"
  | "inferno"
  | "plasma"
  | "turbo"
  | "cividis"
  | "gray"
  | "gray_r"
  | "gray_inverted"
  | "inverse_gray"
  | "greys"
  | "greys_r"
  | "Greys"
  | "Greys_r"
  | "gist_yarg"
  | "binary"
  | "bone"
  // Sequential / Colorbrewer
  | "purples"
  | "Purples"
  | "blues"
  | "Blues"
  | "greens"
  | "Greens"
  | "oranges"
  | "Oranges"
  | "reds"
  | "Reds"
  | "ylorbr"
  | "YlOrBr"
  | "ylorrd"
  | "YlOrRd"
  | "orrd"
  | "OrRd"
  | "purd"
  | "PuRd"
  | "rdpu"
  | "RdPu"
  | "bupu"
  | "BuPu"
  | "gnbu"
  | "GnBu"
  | "pubu"
  | "PuBu"
  | "ylgnbu"
  | "YlGnBu"
  | "pubugn"
  | "PuBuGn"
  | "bugn"
  | "BuGn"
  | "ylgn"
  | "YlGn"
  // Miscellaneous / Funnier
  | "ocean"
  | "gist_earth"
  | "terrain"
  | "gist_stern"
  | "gnuplot"
  | "gnuplot2"
  | "cmrmap"
  | "CMRmap"
  | "cubehelix"
  | "brg"
  | "gist_rainbow"
  | "rainbow"
  | "jet"
  | "nipy_spectral"
  | "gist_ncar"
  // Categorical
  | "tab20";

export type ColorPoint = { at: number; color: string | Rgba };

export type ColorMapConfig =
  | BuiltInColorMap
  | {
      base: BuiltInColorMap;
      gamma?: number;
      contrast?: number;
      brightness?: number;
    }
  | {
      points: ColorPoint[];
      gamma?: number;
      contrast?: number;
      brightness?: number;
    };

export type AudioRange = { startTime: number; endTime: number };

/**
 * Audio source that supplies PCM samples on demand.
 */
export interface AudioSource {
  /** Sample rate in Hz. */
  readonly sampleRate: number;
  /** Total duration in seconds. */
  readonly duration: number;
  /** Number of audio channels. */
  readonly channelCount: number;
  /** Stable identifier for caching computed STFT frames. */
  readonly id: string;
  /**
   * Reads PCM samples for a specific channel and time range.
   * @param options Channel index and time span in seconds.
   * @returns Float32Array of normalized audio samples.
   */
  read(options: {
    channel: number;
    startTime: number;
    endTime: number;
  }): Float32Array | Promise<Float32Array>;
  /**
   * Subscribes to progressive loading updates as new byte ranges arrive.
   * @param handler Callback receiving the newly available time range in seconds.
   * @returns Unsubscribe function.
   */
  onRangeAvailable?(handler: (range: AudioRange) => void): () => void;
}

/**
 * Playhead tracking behavior during audio playback.
 * - `page`: Flips the viewport forward when the playhead leaves the screen.
 * - `smooth`: Continuously scrolls the viewport to keep the playhead centered.
 * - `off`: Disables automatic viewport scrolling.
 */
export type FollowPlaybackMode = "page" | "smooth" | "off";

/**
 * Frequency scaling mode for the Y-axis.
 * - `linear`: Uniform spacing in Hz.
 * - `log`: Logarithmic frequency distribution.
 * - `mel`: Perceptual pitch scale.
 */
export type FrequencyScale = "linear" | "log" | "mel";

/**
 * Visible time and frequency boundaries for a viewer.
 */
export type ViewportConfig = {
  /** Start time in seconds. */
  startTime: number;
  /** End time in seconds. */
  endTime: number;
  /** Minimum visible frequency in Hz. */
  minFrequency?: number | undefined;
  /** Maximum visible frequency in Hz. */
  maxFrequency?: number | undefined;
};

/**
 * Complete viewport state including bounds and total audio duration.
 */
export type ViewportState = {
  /** Viewport start time in seconds. */
  startTime: number;
  /** Viewport end time in seconds. */
  endTime: number;
  /** Visible duration in seconds (`endTime - startTime`). */
  duration: number;
  /** Total recording duration in seconds. */
  totalDuration: number;
  /** Minimum visible frequency in Hz. */
  minFrequency: number;
  /** Maximum visible frequency in Hz. */
  maxFrequency: number;
};

export type ViewportEvents = {
  viewportchange: { viewport: ViewportState; source?: string | undefined };
  destroy: undefined;
};

/**
 * Constraints applied to viewport zooming and panning.
 */
export type ViewportConstraints = {
  /** Total duration in seconds. */
  totalDuration?: number | undefined;
  /** Minimum allowable start time in seconds. */
  minTime?: number | undefined;
  /** Maximum allowable end time in seconds. */
  maxTime?: number | undefined;
  /** Minimum allowable viewport span in seconds. */
  minDuration?: number | undefined;
  /** Maximum allowable viewport span in seconds. */
  maxDuration?: number | undefined;
  /** Minimum allowable frequency in Hz. */
  minFrequency?: number | undefined;
  /** Maximum allowable frequency in Hz. */
  maxFrequency?: number | undefined;
};

export type ViewportControllerOptions = Partial<ViewportConfig> &
  ViewportConstraints;

/**
 * Controls visible time and frequency coordinates across synchronized viewers.
 */
export interface IViewportController {
  /** Returns the current viewport state. */
  getViewport(): ViewportState;
  /** Updates viewport coordinates and notifies listeners. */
  setViewport(patch: Partial<ViewportConfig>, source?: string): void;
  /** Alias for `setViewport`. */
  updateViewport(patch: Partial<ViewportConfig>, source?: string): void;
  /** Sets outer time limits in seconds for panning and zooming. */
  setTimeBounds(minTime: number, maxTime: number): void;
  /** Returns active outer time limits in seconds. */
  getTimeBounds(): { minTime: number; maxTime: number };
  /** Zooms the time axis around an optional center time in seconds. */
  zoom(factor: number, centerTime?: number, source?: string): void;
  /** Zooms the time axis around an optional center time in seconds. */
  zoomTime(factor: number, centerTime?: number, source?: string): void;
  /** Shifts visible start and end times by a delta in seconds. */
  pan(deltaSeconds: number, source?: string): void;
  /** Moves the viewport start to a specific timestamp in seconds. */
  panTo(startTime: number, source?: string): void;
  /** Shifts visible start and end times by a delta in seconds. */
  panTime(deltaSeconds: number, source?: string): void;
  /** Zooms the frequency axis around an optional center frequency in Hz. */
  zoomFrequency(
    factor: number,
    centerFrequency?: number,
    source?: string,
  ): void;
  /** Alias for `zoomFrequency`. */
  zoomFreq(factor: number, centerFrequency?: number, source?: string): void;
  /** Shifts visible frequency range by a delta in Hz. */
  panFrequency(deltaHz: number, source?: string): void;
  /** Zooms both time and frequency axes simultaneously. */
  zoomBoth(
    factor: number | { time: number; frequency: number },
    center?: { time?: number; frequency?: number },
    source?: string,
  ): void;
  /** Resets viewport to default time and frequency limits. */
  reset(): void;
  /** Subscribes to viewport change and destruction events. */
  on<K extends keyof ViewportEvents>(
    event: K,
    handler: (e: ViewportEvents[K]) => void,
  ): () => void;
  /**
   * Attaches drag, wheel, and pinch gestures on an element.
   * @param container DOM element to attach listeners to.
   * @param options Gesture configuration.
   * @returns Cleanup function that removes listeners.
   */
  attachNavigation(
    container: HTMLElement,
    options?: NavigationOptions,
  ): () => void;
  /** Disposes listeners and event emitters. */
  destroy(): void;
}

/**
 * Options for initializing a Sonoscope coordinator instance.
 */
export type SonoscopeOptions = {
  /** Audio source for decoding and STFT computation. */
  source: AudioSource;
  /** Optional HTML audio element to sync playback with. */
  audio?: HTMLAudioElement | undefined;
  /** Custom viewport controller to share coordinates across instances. */
  viewport?: IViewportController | undefined;
  /** Clip start boundary in seconds. Constrains playback and visualization. */
  clipStart?: number | undefined;
  /** Clip end boundary in seconds. Constrains playback and visualization. */
  clipEnd?: number | undefined;
  /** Initial viewport start time in seconds. */
  startTime?: number | undefined;
  /** Initial viewport end time in seconds. */
  endTime?: number | undefined;
  /** Initial minimum frequency in Hz. */
  minFrequency?: number | undefined;
  /** Initial maximum frequency in Hz. */
  maxFrequency?: number | undefined;
  /** Minimum zoom duration in seconds. */
  minDuration?: number | undefined;
  /** Maximum zoom duration in seconds. */
  maxDuration?: number | undefined;
  /** Viewport follow mode during audio playback. Defaults to `page`. */
  followPlayback?: FollowPlaybackMode | undefined;
  /** Screen anchor ratio (0 to 1) for smooth playback follow. */
  smoothAnchor?: number | undefined;
  /** Prefer streaming audio source when loading from URL. Defaults to true. */
  preferStreaming?: boolean | undefined;
  /** Prefer full decoded AudioBuffer over streaming. Defaults to false. */
  preferDecoded?: boolean | undefined;
  /** Target audio sample rate in Hz. */
  sampleRate?: number | undefined;
};

export type SonoscopeEvents = {
  viewportchange: { viewport: ViewportState; source?: string | undefined };
  playbackchange: { mode: FollowPlaybackMode };
  timeupdate: { currentTime: number };
  sourcechange: { source: AudioSource };
  audiochange: { audio: HTMLAudioElement | undefined };
  clipchange: {
    clipStart?: number | undefined;
    clipEnd?: number | undefined;
  };
  destroy: undefined;
};

/**
 * Central coordinator managing audio playback, viewport state, and viewer creation.
 */
export interface ISonoscope {
  /** Active audio source. */
  readonly source: AudioSource;
  /** Viewport controller managing time and frequency axes. */
  readonly viewport: IViewportController;
  /** Returns the current viewport state. */
  getViewport(): ViewportState;
  /** Returns the underlying viewport controller. */
  getViewportController(): IViewportController;
  /** Creates an independent coordinator sharing the same audio source. */
  fork(options?: Partial<SonoscopeOptions>): ISonoscope;
  /** Updates viewport coordinates. */
  setViewport(vp: Partial<ViewportConfig>, source?: string | undefined): void;
  /** Alias for `setViewport`. */
  updateViewport(
    vp: Partial<ViewportConfig>,
    source?: string | undefined,
  ): void;
  /** Zooms the time axis. */
  zoom(factor: number, centerTime?: number, source?: string): void;
  /** Zooms the time axis. */
  zoomTime(factor: number, centerTime?: number, source?: string): void;
  /** Shifts viewport time range by a delta in seconds. */
  pan(deltaSeconds: number, source?: string): void;
  /** Moves viewport start to a specific timestamp in seconds. */
  panTo(startTime: number, source?: string): void;
  /** Zooms the frequency axis around an optional center in Hz. */
  zoomFrequency(
    factor: number,
    centerFrequency?: number,
    source?: string,
  ): void;
  /** Alias for `zoomFrequency`. */
  zoomFreq(factor: number, centerFrequency?: number, source?: string): void;
  /** Zooms both time and frequency axes. */
  zoomBoth(
    factor: number | { time: number; frequency: number },
    center?: { time?: number; frequency?: number },
    source?: string,
  ): void;
  /** Shifts viewport frequency range by a delta in Hz. */
  panFrequency(deltaHz: number, source?: string): void;
  /** Returns total audio duration in seconds. */
  getDuration(): number;
  /** Returns audio sample rate in Hz. */
  getSampleRate(): number;
  /** Returns Nyquist frequency (`sampleRate / 2`) in Hz. */
  getNyquist(): number;
  /** Returns active playback follow mode. */
  getFollowPlayback(): FollowPlaybackMode;
  /** Sets playback follow mode (`page`, `smooth`, or `off`). */
  setFollowPlayback(mode: FollowPlaybackMode): void;

  /**
   * Updates audio clip boundaries in seconds without re-creating the source.
   */
  setClipBounds(bounds: {
    clipStart?: number | undefined;
    clipEnd?: number | undefined;
  }): void;
  /** Returns active clip start and end boundaries in seconds. */
  getClipBounds(): {
    clipStart?: number | undefined;
    clipEnd?: number | undefined;
  };

  /** Returns current audio playback position in seconds. */
  getCurrentTime(): number;
  /** Returns true if audio playback is currently active. */
  isPlaying(): boolean;
  /** Seeks audio and updates playhead timestamp in seconds. */
  seek(time: number): void;
  /** Returns attached HTML audio element if present. */
  getAudio(): HTMLAudioElement | undefined;
  /** Connects an HTML audio element to synchronize playhead and time updates. */
  attachAudio(audio: HTMLAudioElement): void;
  /** Disconnects the HTML audio element. */
  detachAudio(): void;
  /** Replaces the audio source and updates all attached viewers. */
  setSource(source: AudioSource): void;

  /**
   * Attaches pan and zoom navigation handlers to a DOM element.
   * @param container DOM element to receive pointer and wheel events.
   * @param options Gesture configuration.
   * @returns Unsubscribe function that removes event listeners.
   */
  attachNavigation(
    container: HTMLElement,
    options?: NavigationOptions,
  ): () => void;

  /** Subscribes to coordinator events. */
  on<K extends keyof SonoscopeEvents>(
    event: K,
    handler: (e: SonoscopeEvents[K]) => void,
  ): () => void;
  /** Disposes the coordinator, audio listeners, and animation loops. */
  destroy(): void;
}

export type {
  DragNavigationOptions,
  FrequencyBounds,
  ModifierKey,
  NavigableViewer,
  NavigationAxis,
  NavigationOptions,
  TimeBounds,
  WheelNavigationOptions,
} from "./navigation";
