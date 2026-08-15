import type { AudioSource, ColorMapConfig, ISonoscope } from "../types";

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
  renderer?: "canvas2d" | "webgl2" | WaveformRenderer | undefined;
};

export type WaveformOptions = Omit<WaveformConfig, "source" | "canvas">;

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
  renderer: "canvas2d" | "webgl2" | WaveformRenderer;
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
  requestRender(): void;
  destroy(): void;
  getStatus(): WaveformStatus;

  // Viewport & Navigation
  getScope(): ISonoscope;
  getViewport(): WaveformViewport;
  updateViewport(viewport: Partial<WaveformViewport>): void;
  setViewport(viewport: Partial<WaveformViewport>): void;

  // Configuration
  getConfig(): ResolvedWaveformConfig;
  updateConfig(input: Partial<WaveformOptions>): void;
  setConfig(input: Partial<WaveformOptions>): void;

  // Coordinates
  canvasToTime(x: number): number;
  timeToCanvas(time: number): number;

  // Events
  on<Name extends keyof WaveformEvents>(
    name: Name,
    handler: (event: WaveformEvents[Name]) => void,
  ): () => void;
}
