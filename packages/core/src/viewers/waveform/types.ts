import type {
  AudioSource,
  ColorMapConfig,
  IViewportController,
} from "../../types";
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

export interface BarsWaveformRendererOptions {
  /**
   * Width of each bar in CSS pixels.
   * @default 3
   */
  barWidth?: number | undefined;

  /**
   * Gap between adjacent bars in CSS pixels.
   * @default 2
   */
  barGap?: number | undefined;

  /**
   * Corner radius for bars in CSS pixels.
   * If undefined and rounded is true, pill/capsule shapes are rendered (radius = barWidth / 2).
   * If 0, flat rectangular bars are rendered.
   * @default undefined
   */
  barRadius?: number | undefined;

  /**
   * Whether bar ends are rounded (pill/capsule shape).
   * @default true
   */
  rounded?: boolean | undefined;

  /**
   * Alignment of bars relative to the canvas height:
   * - "center": Bars expand vertically from the horizontal centerline.
   * - "bottom": Bars grow upwards from the bottom edge.
   * - "top": Bars grow downwards from the top edge.
   * @default "center"
   */
  barAlign?: "center" | "bottom" | "top" | undefined;

  /**
   * Whether to mirror amplitude symmetrically around center in "center" mode.
   * @default true
   */
  symmetric?: boolean | undefined;

  /**
   * Minimum height of a bar in CSS pixels.
   * If 0, bars taper down to a circle of diameter barWidth during silence.
   * @default 0
   */
  minBarHeight?: number | undefined;
}

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
  color: string;
  backgroundColor: string;
  amplitudeScale: number;
  colorMap?: ColorMapConfig | undefined;
  renderer: WaveformRendererMode;
};

export type WaveformOptions = WaveformConfig;

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

/**
 * Waveform viewer canvas controller and peak renderer.
 */
export interface IWaveformViewer {
  /** Renders the current waveform viewport asynchronously. */
  render(): Promise<void>;
  /** Schedules a render on the next animation frame. */
  requestRender(): void;
  /** Disposes the renderer and event listeners. */
  destroy(): void;
  /** Returns the current render status. */
  getStatus(): WaveformStatus;
  /** Returns the bound HTML canvas element. */
  getCanvas(): HTMLCanvasElement;
  /** Returns the active rendering engine (`canvas2d`, `webgl2`, or `bars`). */
  getRendererKind(): string;

  /** Returns the active audio source. */
  getSource(): AudioSource;
  /** Returns the bound viewport controller. */
  getViewportController(): IViewportController;
  /** Returns the visible time viewport. */
  getViewport(): WaveformViewport;

  /** Returns the resolved waveform configuration options. */
  getConfig(): ResolvedWaveformConfig;
  /** Updates configuration options and triggers a re-render. */
  updateConfig(input: Partial<WaveformOptions>): void;
  /** Alias for `updateConfig`. */
  setConfig(input: Partial<WaveformOptions>): void;
  /** Updates the audio source. */
  setSource(source: AudioSource): void;

  /** Converts canvas X pixel position to time in seconds. */
  canvasToTime(x: number): number;
  /** Converts time in seconds to canvas X pixel position. */
  timeToCanvas(time: number): number;

  /** Subscribes to waveform events. */
  on<Name extends keyof WaveformEvents>(
    name: Name,
    handler: (event: WaveformEvents[Name]) => void,
  ): () => void;
}
