import type { AudioSource, ColorMapConfig } from "../types";

export type PeakBlock = {
  min: Float32Array;
  max: Float32Array;
};

export type WaveformViewport = {
  startTime: number;
  endTime: number;
};

export type WaveformRenderInput = {
  canvas: HTMLCanvasElement;
  peaks: PeakBlock;
  color?: string | undefined;
  progressColor?: string | undefined;
  backgroundColor?: string | undefined;
  cursorColor?: string | undefined;
  playheadTime?: number | undefined;
  startTime: number;
  endTime: number;
  amplitudeScale?: number | undefined;
  colorMap?: ColorMapConfig | undefined;
};

export interface WaveformRenderer {
  readonly kind: "canvas2d" | "webgl2";
  render(input: WaveformRenderInput): void;
  destroy?(): void;
}

export type WaveformConfig = {
  canvas: HTMLCanvasElement;
  source?: AudioSource | undefined;
  audio?: HTMLAudioElement | undefined;
  channel?: number | undefined;
  startTime?: number | undefined;
  endTime?: number | undefined;
  minViewportDuration?: number | undefined;
  maxViewportDuration?: number | undefined;
  color?: string | undefined;
  progressColor?: string | undefined;
  backgroundColor?: string | undefined;
  cursorColor?: string | undefined;
  amplitudeScale?: number | undefined;
  colorMap?: ColorMapConfig | undefined;
  renderer?: "canvas2d" | WaveformRenderer | undefined;
};

export type ResolvedWaveformConfig = {
  canvas: HTMLCanvasElement;
  source: AudioSource;
  channel: number;
  startTime: number;
  endTime: number;
  minViewportDuration: number;
  maxViewportDuration: number;
  color: string;
  progressColor: string;
  backgroundColor: string;
  cursorColor: string;
  amplitudeScale: number;
  colorMap?: ColorMapConfig | undefined;
  renderer: "canvas2d" | WaveformRenderer;
};

export type WaveformStatus =
  | {
      state: "idle" | "loading" | "rendering" | "ready" | "destroyed";
      error?: undefined;
    }
  | { state: "error"; error: Error };

export type WaveformEvents = {
  configchange: { config: ResolvedWaveformConfig };
  viewportchange: { viewport: WaveformViewport };
  renderstart: { requestId: string };
  rendercomplete: { requestId: string };
  error: { error: Error };
};

export interface IWaveformViewer {
  // Lifecycle & Render
  render(): Promise<void>;
  destroy(): void;
  getStatus(): WaveformStatus;

  // Viewport & Navigation
  getViewport(): WaveformViewport;
  updateViewport(viewport: Partial<WaveformViewport>): void;
  setViewport(viewport: Partial<WaveformViewport>): void;
  getTimeBounds(): {
    startTime: number;
    endTime: number;
    minDurationSeconds: number;
    maxDurationSeconds: number;
  };
  zoomTime(factor: number, centerTime?: number): void;

  // Configuration & Source
  getConfig(): ResolvedWaveformConfig;
  updateConfig(input: Partial<WaveformConfig>): void;
  setConfig(input: Partial<WaveformConfig>): void;
  updateSource(source: AudioSource, options?: Partial<WaveformViewport>): void;
  setSource(source: AudioSource, options?: Partial<WaveformViewport>): void;
  updateSourceUrl(
    url: string,
    options?: Partial<WaveformViewport>,
  ): Promise<void>;
  setSourceUrl(url: string, options?: Partial<WaveformViewport>): Promise<void>;

  // Metadata & Audio
  getDuration(): number;
  getSampleRate(): number;
  getSource(): AudioSource;
  getAudio(): HTMLAudioElement | undefined;
  attachAudio(audio: HTMLAudioElement): void;
  detachAudio(): void;

  // Coordinates
  canvasToTime(x: number): number;
  timeToCanvas(time: number): number;

  // Events
  on<Name extends keyof WaveformEvents>(
    name: Name,
    handler: (event: WaveformEvents[Name]) => void,
  ): () => void;
}
