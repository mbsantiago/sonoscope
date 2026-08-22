import type {
  AudioSource,
  ColorMapConfig,
  IViewportController,
} from "../../types";
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
  type: "bars";
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
  | BarsWaveformRendererConfig
  | Canvas2DWaveformRendererConfig
  | WebGL2WaveformRendererConfig
  | WaveformRenderer;

export type WaveformRendererKind = "canvas2d" | "webgl2" | "bars";

export type WaveformRenderInput = {
  canvas: HTMLCanvasElement;
  source: AudioSource;
  channel: number;
  startTime: number;
  endTime: number;
  color?: string | undefined;
  backgroundColor?: string | undefined;
  amplitudeScale?: number | undefined;
  colorMap?: ColorMapConfig | undefined;
};

export interface WaveformRenderer {
  readonly kind: WaveformRendererKind | string;
  render(input: WaveformRenderInput): Promise<void> | void;
  destroy?(): void;
}

export type WaveformConfig = {
  /**
   * Whether to automatically re-render when viewport or configuration changes.
   * @default true
   */
  autoRender?: boolean | undefined;

  /**
   * Audio channel index to visualize (0 for left/mono, 1 for right).
   * @default 0
   */
  channel?: number | undefined;

  /**
   * Viewport start time in seconds.
   * @default 0
   */
  startTime?: number | undefined;

  /**
   * Viewport end time in seconds.
   * @default audio duration
   */
  endTime?: number | undefined;

  /**
   * Minimum viewport duration in seconds to prevent zooming in too far.
   * @default 0.001
   */
  minViewportDuration?: number | undefined;

  /**
   * Maximum viewport duration in seconds to prevent zooming out past bounds.
   * @default audio duration
   */
  maxViewportDuration?: number | undefined;

  /**
   * Primary color for the waveform line or bars.
   * @default "#38bdf8"
   */
  color?: string | undefined;

  /**
   * Background fill color for the canvas.
   * @default "transparent"
   */
  backgroundColor?: string | undefined;

  /**
   * Multiplier applied to audio sample amplitudes for gain adjustment.
   * @default 1.0
   */
  amplitudeScale?: number | undefined;

  /**
   * Named colormap or palette configuration used to derive a matching solid color.
   * Samples a representative accent color from the palette to align with spectrogram visuals.
   * Overrides the `color` property when specified.
   * @default undefined
   */
  colorMap?: ColorMapConfig | undefined;

  /**
   * Rendering engine:
   * - "canvas2d": Standard 2D canvas line/envelope renderer.
   * - "webgl2": Hardware-accelerated GPU shader renderer.
   * - "bars": Segmented pill/bar waveform renderer.
   * - Custom object with bar configuration options (`{ type: "bars", barWidth, barGap, ... }`).
   * @default "canvas2d"
   */
  renderer?: WaveformRendererMode | undefined;

  /**
   * Whether to automatically resize canvas pixel resolution when container dimensions change.
   * @default true
   */
  autoResize?: boolean | undefined;

  /**
   * Device pixel ratio scaling factor for HiDPI/Retina displays.
   * @default window.devicePixelRatio
   */
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
  getSource(): AudioSource;
  getViewportController(): IViewportController;
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
