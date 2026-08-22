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

export interface AudioSource {
  readonly sampleRate: number;
  readonly duration: number;
  readonly channelCount: number;
  readonly id: string;
  read(options: {
    channel: number;
    startTime: number;
    endTime: number;
  }): Float32Array | Promise<Float32Array>;
  onRangeAvailable?(handler: (range: AudioRange) => void): () => void;
}

export type FollowPlaybackMode = "page" | "smooth" | "off";

export type FrequencyScale = "linear" | "log" | "mel";

export type ViewportConfig = {
  startTime: number;
  endTime: number;
  minFrequency?: number | undefined;
  maxFrequency?: number | undefined;
};

export type ViewportState = {
  startTime: number;
  endTime: number;
  duration: number;
  totalDuration: number;
  minFrequency: number;
  maxFrequency: number;
};

export type ViewportEvents = {
  viewportchange: { viewport: ViewportState; source?: string | undefined };
  destroy: undefined;
};

export type ViewportConstraints = {
  totalDuration?: number | undefined;
  minDuration?: number | undefined;
  maxDuration?: number | undefined;
  minFrequency?: number | undefined;
  maxFrequency?: number | undefined;
};

export type ViewportControllerOptions = Partial<ViewportConfig> &
  ViewportConstraints;

export interface IViewportController {
  getViewport(): ViewportState;
  setViewport(patch: Partial<ViewportConfig>, source?: string): void;
  updateViewport(patch: Partial<ViewportConfig>, source?: string): void;
  zoom(factor: number, centerTime?: number, source?: string): void;
  zoomTime(factor: number, centerTime?: number, source?: string): void;
  pan(deltaSeconds: number, source?: string): void;
  panTo(startTime: number, source?: string): void;
  panTime(deltaSeconds: number, source?: string): void;
  zoomFrequency(
    factor: number,
    centerFrequency?: number,
    source?: string,
  ): void;
  zoomFreq(factor: number, centerFrequency?: number, source?: string): void;
  panFrequency(deltaHz: number, source?: string): void;
  zoomBoth(
    factor: number | { time: number; frequency: number },
    center?: { time?: number; frequency?: number },
    source?: string,
  ): void;
  reset(): void;
  on<K extends keyof ViewportEvents>(
    event: K,
    handler: (e: ViewportEvents[K]) => void,
  ): () => void;
  attachNavigation(
    container: HTMLElement,
    options?: NavigationOptions,
  ): () => void;
  destroy(): void;
}

export type SonoscopeOptions = {
  source: AudioSource;
  audio?: HTMLAudioElement | undefined;
  viewport?: IViewportController | undefined;
  startTime?: number | undefined;
  endTime?: number | undefined;
  minFrequency?: number | undefined;
  maxFrequency?: number | undefined;
  minDuration?: number | undefined;
  maxDuration?: number | undefined;
  followPlayback?: FollowPlaybackMode | undefined;
  smoothAnchor?: number | undefined;
  preferStreaming?: boolean | undefined;
  preferDecoded?: boolean | undefined;
  sampleRate?: number | undefined;
};

export type SonoscopeEvents = {
  viewportchange: { viewport: ViewportState; source?: string | undefined };
  playbackchange: { mode: FollowPlaybackMode };
  timeupdate: { currentTime: number };
  sourcechange: { source: AudioSource };
  audiochange: { audio: HTMLAudioElement | undefined };
  destroy: undefined;
};

export interface ISonoscope {
  readonly source: AudioSource;
  readonly viewport: IViewportController;
  getViewport(): ViewportState;
  getViewportController(): IViewportController;
  fork(options?: Partial<SonoscopeOptions>): ISonoscope;
  setViewport(vp: Partial<ViewportConfig>, source?: string | undefined): void;
  updateViewport(
    vp: Partial<ViewportConfig>,
    source?: string | undefined,
  ): void;
  zoom(factor: number, centerTime?: number, source?: string): void;
  zoomTime(factor: number, centerTime?: number, source?: string): void;
  pan(deltaSeconds: number, source?: string): void;
  panTo(startTime: number, source?: string): void;
  zoomFrequency(
    factor: number,
    centerFrequency?: number,
    source?: string,
  ): void;
  zoomFreq(factor: number, centerFrequency?: number, source?: string): void;
  zoomBoth(
    factor: number | { time: number; frequency: number },
    center?: { time?: number; frequency?: number },
    source?: string,
  ): void;
  panFrequency(deltaHz: number, source?: string): void;
  getDuration(): number;
  getSampleRate(): number;
  getNyquist(): number;
  getFollowPlayback(): FollowPlaybackMode;
  setFollowPlayback(mode: FollowPlaybackMode): void;

  getCurrentTime(): number;
  isPlaying(): boolean;
  seek(time: number): void;
  getAudio(): HTMLAudioElement | undefined;
  attachAudio(audio: HTMLAudioElement): void;
  detachAudio(): void;
  setSource(source: AudioSource): void;

  attachNavigation(
    container: HTMLElement,
    options?: NavigationOptions,
  ): () => void;

  on<K extends keyof SonoscopeEvents>(
    event: K,
    handler: (e: SonoscopeEvents[K]) => void,
  ): () => void;
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
