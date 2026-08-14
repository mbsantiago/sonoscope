import { type SpectrogramRenderer } from "./renderers/canvas";
import type {
  AudioSource,
  CacheStats,
  FrequencyScale,
  FromAudioOptions,
  FromSourceOptions,
  FromUrlOptions,
  ResolvedSpectrogramConfig,
  SpectrogramConfig,
  SpectrogramEvents,
  SpectrogramStatus,
  TileStateInfo,
  ViewportConfig,
} from "./types";
export declare class SpectrogramViewer {
  private config;
  private readonly backend;
  private readonly events;
  private readonly cache;
  private renderer;
  private audioElement;
  private playbackCleanup;
  private sourceRangeCleanup;
  private renderQueued;
  private renderRunning;
  private renderAgain;
  private animationFrame;
  private readonly pendingTiles;
  private readonly sourceMap;
  private requestCounter;
  private renderGeneration;
  private status;
  private readonly playbackFrameMeter;
  private lastPlaybackPrefetchTime;
  private suppressCachedPlaybackRender;
  private constructor();
  static create(input: SpectrogramConfig): Promise<SpectrogramViewer>;
  static fromUrl(input: FromUrlOptions): Promise<SpectrogramViewer>;
  static fromAudio(input: FromAudioOptions): Promise<SpectrogramViewer>;
  static fromSource(input: FromSourceOptions): Promise<SpectrogramViewer>;
  static renderLoading(canvas: HTMLCanvasElement, text?: string): void;
  renderLoading(text?: string): void;
  on<Name extends keyof SpectrogramEvents>(
    name: Name,
    handler: (event: SpectrogramEvents[Name]) => void,
  ): () => void;
  getConfig(): ResolvedSpectrogramConfig;
  getRendererKind(): SpectrogramRenderer["kind"];
  getSource(): AudioSource;
  getDuration(): number;
  getAudio(): HTMLAudioElement | undefined;
  attachAudio(audio: HTMLAudioElement): void;
  detachAudio(): void;
  setConfig(input: Partial<SpectrogramConfig>): void;
  updateConfig(input: Partial<SpectrogramConfig>): void;
  setSource(source: AudioSource, options?: Partial<ViewportConfig>): void;
  updateSource(source: AudioSource, options?: Partial<ViewportConfig>): void;
  setSourceUrl(url: string, options?: Partial<ViewportConfig>): Promise<void>;
  updateSourceUrl(
    url: string,
    options?: Partial<ViewportConfig>,
  ): Promise<void>;
  getViewport(): ViewportConfig;
  setViewport(viewport: Partial<ViewportConfig>): void;
  updateViewport(viewport: Partial<ViewportConfig>): void;
  getTimeBounds(): {
    startTime: number;
    endTime: number;
    minDurationSeconds: number;
    maxDurationSeconds: number;
  };
  zoomTime(factor: number, centerTime?: number): void;
  getStatus(): SpectrogramStatus;
  getTileStates(): TileStateInfo[];
  getCacheStats(): CacheStats;
  canvasToTimeFrequency(
    x: number,
    y: number,
  ): {
    time: number;
    frequency: number;
  };
  timeFrequencyToCanvas(
    time: number,
    frequency: number,
  ): {
    x: number;
    y: number;
  };
  render(): Promise<void>;
  requestRender(): void;
  private paintPartial;
  private missingPlaceholders;
  queryPoint(input: {
    time: number;
    frequency: number;
    channel?: number;
  }): Promise<{
    time: number;
    frequency: number;
    frameIndex: number;
    binIndex: number;
    channel: number;
    magnitude?: number;
    power?: number;
    db?: number;
  }>;
  queryCanvasPoint(input: {
    x: number;
    y: number;
    channel?: number;
  }): ReturnType<SpectrogramViewer["queryPoint"]>;
  querySpectrum(input: { time: number; channel?: number }): Promise<{
    time: number;
    frameIndex: number;
    channel: number;
    frequencyScale: FrequencyScale;
    values: {
      frequency: Float32Array;
      magnitude: Float32Array;
      power?: Float32Array;
      db?: Float32Array;
      normalized?: Uint8Array | Float32Array;
    };
  }>;
  queryFrame(input: {
    frameIndex: number;
    channel?: number;
  }): ReturnType<SpectrogramViewer["querySpectrum"]>;
  destroy(): void;
  private attachSourceRangeSync;
  private rangeIntersectsViewport;
  private queueSourceRangeRender;
  private visibleTilesCached;
  private renderRequested;
  private isDestroyed;
  private attachPlaybackSync;
  private startPlaybackLoop;
  private stopPlaybackLoop;
  private followPlayheadIfNeeded;
  private get effectiveTileDuration();
  private prefetchPlaybackLookahead;
  private prefetchAroundViewport;
  private renderPlaybackPlayhead;
  private visibleTileRanges;
  private tileRangesForTimeRange;
  private tileRangeForTime;
  private getTile;
  private tileKey;
  private tileConfigHash;
}
//# sourceMappingURL=viewer.d.ts.map
