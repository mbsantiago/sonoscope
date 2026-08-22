import type { ColorMapConfig, ISonoscope } from "../../types";
import type { BarsWaveformRendererOptions } from "./renderers/bars";

export type PeakBlock = {
  min: Float32Array;
  max: Float32Array;
  x?: Float32Array | undefined;
  isLineMode?: boolean | undefined;
};

export type BarPeakBlock = PeakBlock & {
  kStart: number;
  kEnd: number;
  barDuration: number;
};

export type WaveformViewport = {
  startTime: number;
  endTime: number;
};

export type BarsWaveformRendererConfig = BarsWaveformRendererOptions & {
  type: "bars" | "segmented-bars";
};

export type Canvas2DWaveformRendererConfig = {
  type: "canvas2d";
};

export type WebGL2WaveformRendererConfig = {
  type: "webgl2";
};

export type WaveformRendererMode =
  | "canvas2d"
  | "webgl2"
  | "bars"
  | "segmented-bars"
  | BarsWaveformRendererConfig
  | Canvas2DWaveformRendererConfig
  | WebGL2WaveformRendererConfig
  | WaveformRenderer;

export type WaveformRendererKind =
  | "canvas2d"
  | "webgl2"
  | "bars"
  | "segmented-bars";

export type WaveformRenderInput = {
  canvas: HTMLCanvasElement;
  peaks: PeakBlock | BarPeakBlock;
  color?: string | undefined;
  backgroundColor?: string | undefined;
  startTime: number;
  endTime: number;
  amplitudeScale?: number | undefined;
  colorMap?: ColorMapConfig | undefined;
};

export interface WaveformRenderer {
  readonly kind: WaveformRendererKind | string;
  render(input: WaveformRenderInput): void;
  getBarDuration?(
    timeSpan: number,
    width: number,
    dpr?: number,
  ): number | undefined;
  destroy?(): void;
}

export type WaveformConfig = {
  autoRender?: boolean | undefined;
  channel?: number | undefined;
  startTime?: number | undefined;
  endTime?: number | undefined;
  minViewportDuration?: number | undefined;
  maxViewportDuration?: number | undefined;
  color?: string | undefined;
  backgroundColor?: string | undefined;
  amplitudeScale?: number | undefined;
  colorMap?: ColorMapConfig | undefined;
  renderer?: WaveformRendererMode | undefined;
  autoResize?: boolean | undefined;
  devicePixelRatio?: boolean | number | undefined;
};

export type ResolvedWaveformConfig = {
  autoRender: boolean;
  channel: number;
  startTime: number;
  endTime: number;
  minViewportDuration: number;
  maxViewportDuration: number;
  color: string;
  backgroundColor: string;
  amplitudeScale: number;
  colorMap?: ColorMapConfig | undefined;
  renderer: WaveformRendererMode;
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
  getCanvas(): HTMLCanvasElement;
  getRendererKind(): string;

  // Viewport
  getScope(): ISonoscope;
  getViewport(): WaveformViewport;

  // Configuration
  getConfig(): ResolvedWaveformConfig;
  updateConfig(input: Partial<WaveformConfig>): void;
  setConfig(input: Partial<WaveformConfig>): void;

  // Coordinates
  canvasToTime(x: number): number;
  timeToCanvas(time: number): number;

  // Events
  on<Name extends keyof WaveformEvents>(
    name: Name,
    handler: (event: WaveformEvents[Name]) => void,
  ): () => void;
}
